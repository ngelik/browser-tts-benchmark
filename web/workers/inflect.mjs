import { phonemize } from '/runtimes/phonemizer/1.2.1/phonemizer.js';
import { inflectPhonemeText, inflectTokenIds, splitInflectText } from '../inflect/frontend.mjs';
import { seededNormalNoise } from '../inflect/noise.mjs';
import { dispatchProbe } from './gpu-probe.mjs';

const MODEL_ROOT = '/models/inflect-micro-v2/';
const ORT_ROOT = '/runtimes/onnxruntime-web/1.23.2/';
const SAMPLE_RATE = 24000;
const SPEED = 1.0;
const VARIATION = 0.667;
const BASE_SEED = 0;
const MAX_TOKEN_IDS = 8192;
const INFO = {
  voice: 'English (single speaker; eSpeak en-us)',
  precision: 'FP32 ONNX',
  settings: {
    sampleRate: SAMPLE_RATE,
    speed: SPEED,
    variation: VARIATION,
    seed: BASE_SEED,
    noiseGenerator: 'Seeded Mulberry32 + Box-Muller standard-normal noise; seed resets to 0 per canonical source span and increments for internal pieces. This is not NumPy PCG64 bitwise parity.',
    runtime: 'ONNX Runtime Web 1.23.2; Inflect-Micro-v2-ONNX pinned graphs',
    frontend: 'Pinned Inflect VITS frontend port: English normalization, eSpeak en-us with stress, punctuation retained, two official phoneme overrides, exact symbols.py vocabulary and blank insertion; unknown symbols fail.',
    chunking: 'Official 280-character sentence/punctuation chunking inside each canonical source span; 5 ms edge fades and punctuation-based internal pauses are preserved.',
    waveform: 'One duration graph and one decoder graph call per internal piece; waveform is awaited to CPU, faded and clipped to [-1, 1].',
    executionProviders: [],
  },
};

let ort = null;
let durationSession = null;
let decodeSession = null;
let restoreFetch = null;
let backendEffective = null;

function unsupported(reason) {
  return { ...INFO, settings: { ...INFO.settings, executionProviders: [] }, status: 'unsupported', reason,
    backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
}

function installLocalFetch() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const requested = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(requested, self.location.href);
    if (url.origin !== self.location.origin) throw new Error(`Inflect attempted a non-local fetch: ${url.origin}`);
    return nativeFetch(input, init);
  };
  restoreFetch = () => { globalThis.fetch = nativeFetch; };
}

async function localBytes(path) {
  const response = await fetch(MODEL_ROOT + path);
  if (!response.ok) throw new Error(`Inflect local asset fetch failed: ${path} HTTP ${response.status}`);
  return response.arrayBuffer();
}

function remember(set, value) {
  if (value && typeof value.dispose === 'function') set.add(value);
  return value;
}

function releaseTensors(tensors) {
  let firstError = null;
  for (const tensor of tensors) {
    try { tensor.dispose(); }
    catch (error) { firstError ??= error; }
  }
  tensors.clear();
  if (firstError) throw new Error('Inflect tensor disposal failed: ' + String(firstError?.message ?? firstError));
}

function boundaryPauseSeconds(text) {
  const ending = text.trimEnd().slice(-1);
  return ({ '?': 0.28, '!': 0.24, '.': 0.22, ';': 0.16, ':': 0.13, ',': 0.09 })[ending] ?? 0.08;
}

function edgeFadeAndClip(source) {
  const waveform = Float32Array.from(source);
  const frames = Math.min(Math.round(SAMPLE_RATE * 5 / 1000), Math.floor(waveform.length / 2));
  if (frames > 0) {
    for (let index = 0; index < frames; index++) {
      const gain = frames === 1 ? 0 : index / (frames - 1);
      waveform[index] *= gain;
      waveform[waveform.length - 1 - index] *= gain;
    }
  }
  for (let index = 0; index < waveform.length; index++) {
    waveform[index] = Math.max(-1, Math.min(1, waveform[index]));
  }
  return waveform;
}

function appendPause(parts, text) {
  const samples = Math.round(SAMPLE_RATE * boundaryPauseSeconds(text));
  if (samples > 0) parts.push(new Float32Array(samples));
}

async function inferPiece(text, seed) {
  const tensors = new Set();
  try {
    const frontend = await inflectPhonemeText(text, phonemize);
    const tokenized = inflectTokenIds(frontend.phonemeText);
    if (tokenized.phonemeCount * 2 + 1 > MAX_TOKEN_IDS) {
      throw new Error(`Inflect input has ${tokenized.phonemeCount * 2 + 1} padded tokens; configured maximum is ${MAX_TOKEN_IDS}.`);
    }

    const tokens = remember(tensors, new ort.Tensor('int64', tokenized.tokens, [1, tokenized.tokens.length]));
    const lengths = remember(tensors, new ort.Tensor('int64', BigInt64Array.of(BigInt(tokenized.tokens.length)), [1]));
    const lengthScale = remember(tensors, new ort.Tensor('float32', Float32Array.of(1 / SPEED), []));
    const durationFeeds = { tokens, lengths, length_scale: lengthScale };
    const durationOutputs = await durationSession.run(durationFeeds, ['m_p_exp', 'logs_p_exp', 'y_mask']);
    for (const value of Object.values(durationOutputs)) remember(tensors, value);
    const mean = durationOutputs.m_p_exp;
    const logs = durationOutputs.logs_p_exp;
    const mask = durationOutputs.y_mask;
    if (!mean?.dims?.length || !logs?.dims?.length || !mask?.dims?.length) {
      throw new Error('Inflect duration graph returned incomplete latent tensors.');
    }
    if (JSON.stringify(mean.dims) !== JSON.stringify(logs.dims)) throw new Error('Inflect duration graph mean/log-scale dimensions differ.');

    const noise = remember(tensors, new ort.Tensor('float32', seededNormalNoise(mean.dims, seed), mean.dims));
    const noiseScale = remember(tensors, new ort.Tensor('float32', Float32Array.of(VARIATION), []));
    const decodeOutputs = await decodeSession.run({
      m_p_exp: mean,
      logs_p_exp: logs,
      y_mask: mask,
      zp_noise: noise,
      noise_scale: noiseScale,
    }, ['waveform']);
    for (const value of Object.values(decodeOutputs)) remember(tensors, value);
    const output = decodeOutputs.waveform;
    if (!output || typeof output.getData !== 'function') throw new Error('Inflect decoder did not return a readable waveform tensor.');
    const cpuData = await output.getData();
    if (!(cpuData instanceof Float32Array) || cpuData.length === 0) throw new Error('Inflect decoder returned empty or non-Float32 PCM.');
    return edgeFadeAndClip(cpuData);
  } finally {
    releaseTensors(tensors);
  }
}

async function generate(chunk) {
  if (!durationSession || !decodeSession) throw new Error('Inflect has not been initialized.');
  if (typeof chunk?.text !== 'string' || !chunk.text.trim()) throw new Error('Inflect received an empty source chunk.');
  const pieces = splitInflectText(chunk.text);
  if (!pieces.length) throw new Error('Inflect normalization produced no speakable text.');
  const outputParts = [];
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    if (index > 0) appendPause(outputParts, pieces[index - 1]);
    const pcm = await inferPiece(piece, (BASE_SEED + index) >>> 0);
    outputParts.push(pcm);
  }
  return { parts: outputParts, sampleRate: SAMPLE_RATE, completedChunkId: chunk.id };
}

async function initialize({ backend, probe = false, probeText = 'A short browser speech check.' }) {
  if (!['cpu', 'webgpu'].includes(backend)) return unsupported('Inflect supports explicit CPU/WASM and WebGPU providers only.');
  let selectedAdapter = null;
  let gpu = null;
  if (backend === 'webgpu') {
    if (!navigator.gpu) return unsupported('Chrome does not expose WebGPU.');
    try { selectedAdapter = await navigator.gpu.requestAdapter(); }
    catch (error) { return unsupported('WebGPU adapter request failed: ' + String(error?.message ?? error)); }
    if (!selectedAdapter) return unsupported('No WebGPU adapter is available.');
    const selectedInfo = selectedAdapter.info ?? {};
    if (selectedAdapter.isFallbackAdapter || selectedInfo.isFallbackAdapter) return unsupported('Software WebGPU adapters are not ranked.');
    gpu = selectedInfo.description || selectedInfo.vendor || 'Hardware WebGPU adapter';
  }

  const executionProviders = backend === 'cpu' ? ['wasm'] : ['webgpu', 'wasm'];
  installLocalFetch();
  try {
    ort = await import(ORT_ROOT + (backend === 'cpu' ? 'ort.wasm.min.mjs' : 'ort.webgpu.min.mjs'));
    ort.env.logLevel = 'error';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const wasmBase = backend === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
    ort.env.wasm.wasmPaths = { mjs: ORT_ROOT + wasmBase + '.mjs', wasm: ORT_ROOT + wasmBase + '.wasm' };
    if (backend === 'webgpu') ort.env.webgpu.adapter = selectedAdapter;

    const [configBytes, durationBytes, decodeBytes] = await Promise.all([
      localBytes('config.json'), localBytes('onnx/duration.onnx'), localBytes('onnx/decode.onnx'),
    ]);
    const config = JSON.parse(new TextDecoder().decode(configBytes));
    if (config?.format !== 'inflect_v2_inference_config_v1' || config.data?.sampling_rate !== SAMPLE_RATE || config.data?.add_blank !== true) {
      throw new Error('Pinned Inflect config does not match the expected 24 kHz blank-insertion contract.');
    }
    const sessionOptions = {
      executionProviders,
      graphOptimizationLevel: 'all',
      ...(backend === 'webgpu' ? { preferredOutputLocation: 'cpu' } : {}),
    };
    durationSession = await ort.InferenceSession.create(durationBytes, sessionOptions);
    decodeSession = await ort.InferenceSession.create(decodeBytes, sessionOptions);
    backendEffective = backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm';
    if (backend === 'webgpu') {
      const actualDevice = await ort.env.webgpu.device;
      const actualAdapter = ort.env.webgpu.adapter;
      const actualInfo = actualDevice?.adapterInfo ?? actualAdapter?.info;
      if (actualInfo?.isFallbackAdapter || actualAdapter?.isFallbackAdapter) {
        await dispose();
        return unsupported('ONNX Runtime selected a software fallback WebGPU adapter.');
      }
      gpu = actualInfo?.description || actualInfo?.vendor || 'ORT WebGPU device; description unavailable';
    }
  } catch (error) {
    await dispose().catch(() => {});
    throw error;
  } finally {
    restoreFetch?.();
    restoreFetch = null;
  }

  let count = 0;
  if (probe) {
    const hook = backend === 'webgpu' ? dispatchProbe() : null;
    try {
      const output = await generate({ id: 'inflect-probe', text: probeText });
      if (!output.parts.length || output.parts.every(part => part.length === 0) || !output.parts.every(part => part.every(Number.isFinite))) {
        throw new Error('Inflect untimed capability synthesis returned invalid PCM.');
      }
    } catch (error) {
      await dispose().catch(() => {});
      throw error;
    } finally {
      count = hook?.stop() ?? 0;
    }
    if (backend === 'webgpu' && count === 0) {
      await dispose();
      return unsupported('No actual WebGPU compute dispatch was observed during Inflect synthesis.');
    }
  }

  return {
    ...INFO,
    settings: { ...INFO.settings, executionProviders },
    status: 'measured',
    backendEffective,
    ...(backend === 'webgpu' ? { gpu } : {}),
    capability: {
      gpuDispatchVerified: backend === 'cpu' ? null : probe ? count > 0 : null,
      description: backend === 'cpu'
        ? probe ? 'Explicit one-thread WASM; an untimed CPU utterance passed.' : 'Explicit one-thread ONNX Runtime Web WASM provider.'
        : probe
          ? `Observed ${count} WebGPU dispatches in untimed duration and decoder inference; final waveform was read back to CPU. WASM fallback may execute unsupported operators. Hooks removed before timing.`
          : 'WebGPU + WASM fallback configured; no dispatch probe was requested.',
    },
  };
}

async function dispose() {
  const sessions = [durationSession, decodeSession];
  durationSession = null;
  decodeSession = null;
  backendEffective = null;
  ort = null;
  restoreFetch?.();
  restoreFetch = null;
  let firstError = null;
  for (const session of sessions) {
    try { await session?.release(); }
    catch (error) { firstError ??= error; }
  }
  if (firstError) throw new Error('Inflect session disposal failed: ' + String(firstError?.message ?? firstError));
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options ?? {});
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Inflect worker action.');
    self.postMessage({ id: data.id, value }, value?.parts?.map(part => part.buffer) ?? []);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};
