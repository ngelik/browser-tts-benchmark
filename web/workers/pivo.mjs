import { phonemize, readLexicon, SYMBOLS } from '../pivo/text.mjs';
let ort;
let executionProviders = [];
let requestedBackend = 'cpu';

async function fetchBytes(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const MODEL_ROOT = '/models/pivo-1.4m';
const GRAPH_NAMES = ['encoder', 'decoder', 'conditioning', 'vocoder_step'];
const HOP = 160;
const FEATURE_WIDTH = 100;
const FRAMES_PER_DECODER_CALL = 16;
const AUDIO_BATCH_SAMPLES = 3200; // 200 ms at PiVo's native 16 kHz rate.

let metadata;
let dictionary;
let overrides = {};
let articleOov;
let sessions = {};
let caseId;
let disposed = false;
let normalizationRules = [];
let chosenPronunciationNote = '';
let gpuAdapterInfo = null;
const cancelled = new Set();

function applyConfiguredNormalization(text) {
  return normalizationRules.reduce((value, rule) => value.replace(new RegExp(rule.pattern, 'gu'), rule.replacement), text);
}

function observeComputeDispatches() {
  let count = 0;
  const restore = [];
  const prototype = globalThis.GPUComputePassEncoder?.prototype;
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    if (typeof prototype?.[name] !== 'function') continue;
    const original = prototype[name];
    restore.push([prototype, name, original]);
    prototype[name] = function (...args) { count += 1; return original.apply(this, args); };
  }
  return { stop() { for (const [proto, name, fn] of restore) proto[name] = fn; return count; } };
}

function unsupported(reason) {
  return { status: 'unsupported', reason, backendEffective: 'none', voice: 'Pi', precision: 'float32 ONNX',
    settings: { textVariant: 'pivo-curated-v1', frontend: 'pinned PiVo English frontend', threads: 1 },
    capability: { gpuDispatchVerified: false, description: reason } };
}

const f32 = (data, dims) => new ort.Tensor('float32', data, dims);
const i64 = (values, dims) => new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dims);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const dispose = (values) => { for (const value of values) value?.dispose?.(); };
const roundEven = (value) => {
  const base = Math.floor(value);
  const fraction = value - base;
  return fraction === 0.5 ? (base % 2 === 0 ? base : base + 1) : Math.round(value);
};

function summarizeOov(words) {
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return {
    occurrences: words.length,
    types: [...counts.keys()].sort(),
    byWord: Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

class PcmBatcher {
  constructor(jobId, chunkId, emit) {
    this.jobId = jobId;
    this.chunkId = chunkId;
    this.emit = emit;
    this.parts = [];
    this.length = 0;
    this.sampleOffset = 0;
  }

  append(pcm) {
    if (!pcm.length) return;
    this.parts.push(pcm.slice());
    this.length += pcm.length;
    while (this.length >= AUDIO_BATCH_SAMPLES) this.flush(AUDIO_BATCH_SAMPLES);
  }

  flush(count = this.length) {
    if (count <= 0 || !this.length) return;
    const output = new Float32Array(count);
    let copied = 0;
    while (copied < count) {
      const part = this.parts[0];
      const take = Math.min(count - copied, part.length);
      output.set(part.subarray(0, take), copied);
      copied += take;
      if (take === part.length) this.parts.shift();
      else this.parts[0] = part.subarray(take);
    }
    this.length -= count;
    const offset = this.sampleOffset;
    this.sampleOffset += count;
    this.emit({
      type: 'pcm', jobId: this.jobId, chunkId: this.chunkId, sampleOffset: offset,
      sampleRate: metadata.config.sample_rate, pcm: output,
    }, [output.buffer]);
  }
}

function postError(error, jobId) {
  self.postMessage({
    type: 'error', jobId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

async function load(data) {
  const began = performance.now();
  caseId = data.caseId ?? 'pivo-curated';
  requestedBackend = data.options?.backend ?? 'cpu';
  if (!['cpu', 'webgpu', 'webgl'].includes(requestedBackend)) {
    self.postMessage({ type: 'ready', info: unsupported('Unknown PiVo backend: ' + requestedBackend) });
    return;
  }
  let adapter = null;
  if (requestedBackend === 'webgpu') {
    adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      self.postMessage({ type: 'ready', info: unsupported('No WebGPU adapter is available in this worker.') });
      return;
    }
    if (adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) {
      self.postMessage({ type: 'ready', info: unsupported('Software WebGPU adapters are not ranked.') });
      return;
    }
    gpuAdapterInfo = adapter.info?.description || adapter.info?.vendor || 'Hardware WebGPU adapter';
  }
  const bundle = requestedBackend === 'cpu' ? 'ort.wasm.min.mjs' : requestedBackend === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.webgl.min.mjs';
  ort = await import('/runtimes/onnxruntime-web/1.23.2/' + bundle);
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (requestedBackend === 'webgpu') ort.env.webgpu.adapter = adapter;
  const wasm = requestedBackend === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
  ort.env.wasm.wasmPaths = {
    mjs: '/runtimes/onnxruntime-web/1.23.2/' + wasm + '.mjs',
    wasm: '/runtimes/onnxruntime-web/1.23.2/' + wasm + '.wasm',
  };
  executionProviders = requestedBackend === 'cpu' ? ['wasm'] : requestedBackend === 'webgpu' ? ['webgpu', 'wasm'] : ['webgl'];
  const [metadataBytes, dictionaryBytes, articleBytes] = await Promise.all([
    fetchBytes(`${MODEL_ROOT}/metadata.json`, 'PiVo model metadata'),
    fetchBytes(`${MODEL_ROOT}/cmudict.dict`, 'CMU pronunciation dictionary'),
    fetchBytes('/fixtures/en-20000.txt', 'Canonical article for strict OOV preflight'),
  ]);
  metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
  dictionary = readLexicon(new TextDecoder().decode(dictionaryBytes));
  if (metadata.format !== 'pivo-onnx-v1' || metadata.config.sample_rate !== 16000) {
    throw new Error('PiVo metadata does not match the pinned browser adapter expectations');
  }
  if (metadata.symbols.length !== SYMBOLS.length || metadata.symbols.some((symbol, index) => symbol !== SYMBOLS[index])) {
    throw new Error('PiVo frontend symbols do not match the pinned ONNX model vocabulary');
  }
  const article = new TextDecoder().decode(articleBytes);
  const strictArticle = phonemize(article, { dictionary, strict: false });
  articleOov = summarizeOov(strictArticle.unknown_words);

  let variantName = 'canonical strict baseline';
  if (caseId === 'pivo-curated') {
    const proposalBytes = await fetchBytes('/fixtures/pivo-curated-variant.json', 'PiVo reviewed article variant');
    const proposalHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', proposalBytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const proposal = JSON.parse(new TextDecoder().decode(proposalBytes));
    if (proposalHash !== '51c7dae518cfd46df175c9de323016e330db22a5f61bdb9097a14c50206a5190'
      || proposal.articleSha256 !== '4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b'
      || proposal.id !== 'pivo-curated-v1' || Object.keys(proposal.overrides).length !== 12
      || !Array.isArray(proposal.normalizationRules) || proposal.normalizationRules.length !== 2) {
      throw new Error('PiVo curated variant differs from its frozen benchmark configuration');
    }
    overrides = proposal.overrides;
    normalizationRules = proposal.normalizationRules;
    chosenPronunciationNote = proposal.chosenPronunciationNote;
    variantName = 'explicit article normalization and reviewed pronunciations';
    const curated = phonemize(applyConfiguredNormalization(article), { dictionary, strict: false, overrides });
    const curatedOov = summarizeOov(curated.unknown_words);
    if (curatedOov.occurrences) throw new Error(`PiVo curated full-article frontend still has OOV tokens: ${curatedOov.types.join(', ')}`);
  } else if (caseId !== 'pivo-strict') {
    throw new Error(`Unknown PiVo case: ${caseId}`);
  }

  if (caseId === 'pivo-strict') {
    self.postMessage({ type: 'ready', info: {
      modelId: 'PiVo-1.4M', revision: '515d84fc3420da6ae138f1b81017fcbc24d622a8',
      runtime: 'PiVo custom ONNX Runtime Web 1.23.2 port', runtimeOrigin: 'custom-port',
      voice: 'Pi', precision: 'float32 ONNX', backendRequested: 'webgpu', backendEffective: 'not-run',
      threadsEffective: null, sampleRate: 16000, loadMs: performance.now() - began,
      textVariant: variantName, preflightOnly: true, articleOov,
      modelWeightsLoaded: false,
    } });
    return;
  }

  const modelManifest = await fetch(`${MODEL_ROOT}/model_manifest.json`).then((response) => {
    if (!response.ok) throw new Error(`PiVo model manifest returned HTTP ${response.status}`);
    return response.json();
  });
  const modelBytes = await Promise.all(GRAPH_NAMES.map(async (name) => {
    const bytes = await fetchBytes(`${MODEL_ROOT}/${name}.onnx`, `PiVo ${name} graph`);
    const pinned = modelManifest.files.find((file) => file.path === `onnx/${name}.onnx`);
    if (!pinned || pinned.bytes !== bytes.byteLength) throw new Error(`PiVo ${name} graph size did not match its pinned model manifest`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== pinned.sha256) throw new Error(`PiVo ${name} graph SHA-256 ${hash} did not match the pinned ${pinned.sha256}`);
    return bytes;
  }));
  try {
    for (let i = 0; i < GRAPH_NAMES.length; i += 1) {
      const name = GRAPH_NAMES[i];
      sessions[name] = await ort.InferenceSession.create(modelBytes[i], {
        executionProviders, graphOptimizationLevel: 'all',
      });
    }
  } catch (error) {
    if (requestedBackend === 'webgl' && /int64|FLOAT16|unsupported|not supported|no available backend/i.test(String(error?.message ?? error))) {
      self.postMessage({ type: 'ready', info: unsupported('Pinned PiVo WebGL provider cannot load this graph: ' + String(error?.message ?? error).slice(0, 400)) });
      return;
    }
    throw error;
  }
  if (requestedBackend === 'webgpu') {
    const activeDevice = await ort.env.webgpu.device;
    const actualAdapterInfo = activeDevice?.adapterInfo ?? ort.env.webgpu.adapter?.info ?? adapter?.info;
    gpuAdapterInfo = actualAdapterInfo?.description || actualAdapterInfo?.device
      || actualAdapterInfo?.vendor || gpuAdapterInfo;
  }
  if (ort.env.wasm.numThreads !== 1) throw new Error(`PiVo expected one WASM thread, got ${ort.env.wasm.numThreads}`);
  let dispatches = 0;
  let capability = { gpuDispatchVerified: requestedBackend === 'webgpu' ? false : null,
    description: `${requestedBackend} ONNX Runtime provider; a separate synthesis probe was not requested.` };
  if (data.options?.probe) {
    const probeHooks = requestedBackend === 'webgpu' ? observeComputeDispatches() : null;
    let warmup;
    try {
      warmup = await synthesizeChunk(0, { id: -1, text: 'Hello there.' }, () => {}, true);
    } finally {
      dispatches = probeHooks?.stop() ?? 0;
    }
    if (!warmup.samples) throw new Error('PiVo initialization synthesis returned no samples');
  }
  if (data.options?.probe && requestedBackend === 'webgl') {
    self.postMessage({ type: 'ready', info: unsupported('WebGL synthesis completed, but this adapter lacks validated draw-dispatch evidence; no GPU score is published.') });
    return;
  }
  if (data.options?.probe && requestedBackend === 'webgpu' && dispatches === 0) {
    self.postMessage({ type: 'ready', info: unsupported('No WebGPU compute dispatch was observed during PiVo synthesis.') });
    return;
  }
  if (data.options?.probe) capability = requestedBackend === 'webgpu'
    ? { gpuDispatchVerified: true, description: `Observed ${dispatches} WebGPU compute dispatches during an untimed PiVo probe; hooks were removed before timed synthesis.` }
    : { gpuDispatchVerified: null, description: `The ${requestedBackend} provider produced finite PiVo PCM in an untimed compatibility probe.` };
  const effectiveBackend = requestedBackend === 'cpu' ? 'cpu/wasm' : requestedBackend === 'webgpu' ? 'webgpu+wasm' : 'webgl';
  self.postMessage({ type: 'ready', info: {
    status: 'measured',
    modelId: 'PiVo-1.4M', revision: '515d84fc3420da6ae138f1b81017fcbc24d622a8',
    runtime: 'PiVo custom ONNX Runtime Web 1.23.2 port', runtimeOrigin: 'custom-port',
    voice: 'Pi', precision: 'float32 ONNX', backendRequested: requestedBackend, requestedExecutionProviders: executionProviders,
    threadsEffective: ort.env.wasm.numThreads, sampleRate: metadata.config.sample_rate,
    loadMs: performance.now() - began, textVariant: variantName,
    warmup: data.options?.probe ? 'Hello there. (untimed initialization probe; included in loadMs)' : 'none',
    modelWeightsLoaded: true, articleOov: summarizeOov([]), backendEffective: effectiveBackend,
    settings: { textVariant: 'pivo-curated-v1', frontend: 'pinned PiVo English frontend', threads: 1,
      executionProviders, voiceIndex: 0, sampleRate: metadata.config.sample_rate,
      normalizationRules, overrides, chosenPronunciationNote },
    capability, gpu: gpuAdapterInfo,
  } });
}

async function runGraph(name, feeds) {
  const outputs = await sessions[name].run(feeds);
  return sessions[name].outputNames.map((outputName) => outputs[outputName]);
}

async function synthesizeChunk(jobId, chunk, emit, warmup = false) {
  let tokens;
  let voice;
  let lengths;
  let encoded;
  let logDurations;
  let cache = {};
  let state = {};
  let audioBatcher;
  try {
    if (disposed) throw new Error('PiVo engine has been disposed');
    if (cancelled.has(jobId)) throw new DOMException('Synthesis cancelled', 'AbortError');
    if (caseId === 'pivo-strict') {
      throw new Error(`PiVo strict canonical article preflight failed: ${articleOov.occurrences} OOV occurrences across ${articleOov.types.length} word types (${articleOov.types.join(', ')}). The approved curated variant is a separate case.`);
    }
    const input = caseId === 'pivo-curated' ? applyConfiguredNormalization(chunk.text) : chunk.text;
    const phonemes = phonemize(input, { dictionary, strict: true, overrides });
    if (phonemes.token_ids.length > 3000) throw new Error(`PiVo source chunk has ${phonemes.token_ids.length} tokens; model limit is 3000`);
    tokens = i64(phonemes.token_ids, [1, phonemes.token_ids.length]);
    voice = i64([0], [1]);
    lengths = i64([phonemes.token_ids.length], [1]);
    [encoded, logDurations] = await runGraph('encoder', { tokens, voice, lengths });
    dispose([tokens, voice, lengths]); tokens = voice = lengths = undefined;

    const durations = Array.from(logDurations.data, (value, index) => {
      let frames = clamp(roundEven(Math.fround(Math.expm1(clamp(value, 0, Math.log1p(200))))), 0, 200);
      if (phonemes.token_ids[index] >= 10) frames = Math.max(1, frames);
      if (phonemes.token_ids[index] <= 2) frames = 0;
      return frames;
    });
    const frameCount = durations.reduce((sum, value) => sum + value, 0);
    if (frameCount > metadata.config.max_utterance_frames) throw new Error(`PiVo source chunk requires ${frameCount} frames; model limit is ${metadata.config.max_utterance_frames}`);
    const expanded = new Float32Array(frameCount * FEATURE_WIDTH);
    let at = 0;
    for (let token = 0; token < durations.length; token += 1) {
      for (let frame = 0; frame < durations[token]; frame += 1) {
        expanded.set(encoded.data.subarray(token * 96, (token + 1) * 96), at * FEATURE_WIDTH);
        const phase = Math.fround(Math.fround(frame + 0.5) / durations[token]);
        expanded[at * FEATURE_WIDTH + 96] = Math.fround(2 * phase - 1);
        expanded[at * FEATURE_WIDTH + 97] = Math.sin(Math.fround(Math.PI * phase));
        expanded[at * FEATURE_WIDTH + 98] = Math.cos(Math.fround(Math.PI * phase));
        expanded[at * FEATURE_WIDTH + 99] = Math.log1p(durations[token]) / Math.log1p(200);
        at += 1;
      }
    }
    dispose([encoded, logDurations]); encoded = logDurations = undefined;

    cache = Object.fromEntries(metadata.cache_names.map((name) => [name, f32(new Float32Array(0), [1, 2, 0, 24])]));
    state = Object.fromEntries(metadata.step_state_names.map((name, index) => {
      const sizes = [256, 160, 128, 128, 164];
      return [name, f32(new Float32Array(sizes[index]), [1, sizes[index]])];
    }));
    audioBatcher = warmup ? null : new PcmBatcher(jobId, chunk.id, emit);
    let frameQueue = [];
    let previousFrame = null;
    let deemphasis = 0;
    let sampleCount = 0;
    let frameIndex = 0;

    const processFrame = async (current, following) => {
      const contextData = new Float32Array(60);
      contextData.set(previousFrame ?? current, 0);
      contextData.set(current, 20);
      contextData.set(following ?? current, 40);
      const periods = Array.from({ length: 3 }, (_, index) => clamp(
        roundEven(Math.fround(256 / Math.fround(Math.pow(2, Math.fround(clamp(contextData[index * 20 + 18], -10, 10) + 1.5))))),
        32, 255,
      ));
      const context = f32(contextData, [1, 3, 20]);
      const periodTensor = i64(periods, [1, 3]);
      let conditioning;
      try {
        [conditioning] = await runGraph('conditioning', { features: context, periods: periodTensor });
      } finally {
        dispose([context, periodTensor]);
      }
      try {
        for (let sub = 0; sub < 4; sub += 1) {
          if (cancelled.has(jobId)) throw new DOMException('Synthesis cancelled', 'AbortError');
          const cond = f32(conditioning.data.slice(sub * 80, (sub + 1) * 80), [1, 80]);
          const period = i64([periods[1]], [1]);
          let output;
          try {
            output = await runGraph('vocoder_step', { conditioning: cond, period, ...state });
          } finally {
            dispose([cond, period, ...Object.values(state)]);
          }
          state = Object.fromEntries(metadata.step_state_names.map((name, index) => [name, output[index + 1]]));
          const samples = output[0].data;
          const pcm = new Float32Array(samples.length);
          for (let sample = 0; sample < samples.length; sample += 1) {
            deemphasis = samples[sample] + 0.85 * deemphasis;
            pcm[sample] = deemphasis;
          }
          sampleCount += samples.length;
          audioBatcher?.append(pcm);
          output[0].dispose?.();
        }
      } finally {
        conditioning.dispose?.();
      }
      previousFrame = current;
      frameIndex += 1;
    };

    for (let position = 0; position < frameCount; position += FRAMES_PER_DECODER_CALL) {
      if (cancelled.has(jobId)) throw new DOMException('Synthesis cancelled', 'AbortError');
      const count = Math.min(FRAMES_PER_DECODER_CALL, frameCount - position);
      const block = f32(expanded.slice(position * FEATURE_WIDTH, (position + count) * FEATURE_WIDTH), [1, count, FEATURE_WIDTH]);
      const pos = i64([position], []);
      let output;
      try {
        output = await runGraph('decoder', { expanded: block, position: pos, ...cache });
      } finally {
        dispose([block, pos, ...Object.values(cache)]);
      }
      cache = Object.fromEntries(metadata.cache_names.map((name, index) => [name, output[index + 1]]));
      for (let frame = 0; frame < count; frame += 1) {
        frameQueue.push(output[0].data.slice(frame * 20, (frame + 1) * 20));
      }
      output[0].dispose?.();
      const finalBlock = position + count >= frameCount;
      while (frameQueue.length >= 2 || (finalBlock && frameQueue.length)) {
        const current = frameQueue.shift();
        await processFrame(current, frameQueue[0] ?? current);
      }
    }
    audioBatcher?.flush();
    if (!warmup) emit({ type: 'chunk-done', jobId, chunkId: chunk.id, samples: sampleCount, tokenCount: phonemes.token_ids.length, frames: frameCount });
    return { frames: frameCount, samples: sampleCount };
  } finally {
    dispose([tokens, voice, lengths, encoded, logDurations, ...Object.values(cache), ...Object.values(state)]);
  }
}

async function speak(jobId, chunk) {
  try {
    if (disposed) throw new Error('PiVo session is not available');
    await synthesizeChunk(jobId, chunk, (message, transfer) => self.postMessage(message, transfer));
  } catch (error) {
    postError(error, jobId);
  } finally {
    cancelled.delete(jobId);
  }
}

async function release() {
  disposed = true;
  cancelled.clear();
  await Promise.all(Object.values(sessions).map((session) => session?.release?.().catch(() => {})));
  sessions = {};
  self.postMessage({ type: 'disposed' });
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') void load(data).catch((error) => postError(error));
  else if (data.type === 'synthesize') void speak(data.jobId, data.chunk);
  else if (data.type === 'cancel') cancelled.add(data.jobId);
  else if (data.type === 'dispose') void release();
};
