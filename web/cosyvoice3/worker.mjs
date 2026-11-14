import { observeComputeDispatches, requestHardwareWebGpuAdapter } from '../piper/webgpu.mjs';
import { BpeTokenizer } from './tokenizer.mjs';
import { fromHalf, prepareText, synthesize } from './generate.mjs';

const modelRoot = '/models/cosyvoice3/dcdb9df4bce4a47d318f5f8736de0b080efd944f/';
const ortRoot = '/runtimes/onnxruntime-web/1.31.1/';
const graphs = {
  flowEncoder: 'flow_encoder_q4.onnx',
  hift: 'hift_q4c8.onnx',
  embed: 'embed_q4.onnx',
  flowStep: 'flow_step_q8.onnx',
  llm: 'llm_q8.onnx',
};
const gpuOutputs = {
  llm: Array.from({length: 24}, (_, layer) => [`present.${layer}.key`, `present.${layer}.value`]).flat(),
  flowEncoder: ['mu', 'spks', 'cond'],
  flowStep: ['x_next'],
};
let engine;
const nativeFetch = self.fetch.bind(self);
self.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input, self.location);
  if (url.origin !== self.location.origin) throw new Error('CosyVoice3 requested an external resource');
  return nativeFetch(input, options);
};

async function asset(path) {
  const response = await fetch(modelRoot + path);
  if (!response.ok) throw new Error(`CosyVoice3 asset ${path} returned HTTP ${response.status}`);
  return response;
}

async function release() {
  const sessions = Object.values(engine?.sessions ?? {});
  engine = null;
  for (const session of sessions) await session.release();
}

async function initialize({backend, probe, probeText}) {
  const gpu = backend === 'webgpu';
  if (!gpu && backend !== 'cpu') throw new Error('Unknown CosyVoice3 execution provider');
  const hardware = gpu ? await requestHardwareWebGpuAdapter(navigator.gpu) : null;
  const description = {
    backendEffective: gpu ? 'webgpu+wasm' : 'cpu/wasm',
    voice: 'LibriTTS-R 4446 default',
    precision: 'Q8 LLM and flow steps; Q4 embeddings and flow encoder; Q4/int8 HiFT',
    settings: {
      executionProviders: gpu ? ['webgpu', 'wasm'] : ['wasm'],
      language: 'en', sampleRate: 24000, wasmThreads: 4, flowSteps: 10, guidance: 0.7,
      sampler: 'RAS top-p 0.8 / top-k 25 / repeat window 10, unseeded',
      frontend: 'Quick Inference English normalization, Qwen2 BPE, sentence packing up to nominal 80 tokens',
      generation: '109 preset prompt speech tokens, cap 20 speech tokens per text token with required stop, fixed start noise and upstream HiFT uniform noise',
    },
  };
  if (hardware?.reason) return {...description, status: 'unsupported', backendEffective: 'none', reason: hardware.reason, capability: {gpuDispatchVerified: false, description: hardware.reason}};
  const ort = await import(ortRoot + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'));
  ort.env.wasm.numThreads = 4;
  ort.env.wasm.proxy = false;
  const prefix = 'ort-wasm-simd-threaded' + (gpu ? '.asyncify' : '');
  ort.env.wasm.wasmPaths = {mjs: ortRoot + prefix + '.mjs', wasm: ortRoot + prefix + '.wasm'};
  if (gpu) ort.env.webgpu.adapter = hardware.adapter;
  engine = {
    ort,
    sessions: {},
    tokenizer: BpeTokenizer.fromJSON(await (await asset('tokenizer.json')).json()),
    voice: await (await asset('voice_default.json')).json(),
    flowNoise: fromHalf(new Uint16Array(await (await asset('flow_noise_f16.bin')).arrayBuffer())),
  };
  for (const [stage, file] of Object.entries(graphs)) {
    const bytes = new Uint8Array(await (await asset('onnx/' + file)).arrayBuffer());
    try {
      engine.sessions[stage] = await ort.InferenceSession.create(bytes, {
        executionProviders: gpu ? [{name: 'webgpu', storageBufferCacheMode: 'bucket'}, 'wasm'] : ['wasm'],
        enableCpuMemArena: false,
        graphOptimizationLevel: 'all',
        ...(gpu && gpuOutputs[stage] ? {preferredOutputLocation: Object.fromEntries(gpuOutputs[stage].map(name => [name, 'gpu-buffer']))} : {}),
      });
    } catch (e) { throw new Error(`CosyVoice3 ${stage} session: ${e.message ?? e}`); }
  }
  let dispatches = 0;
  if (probe) {
    const hook = gpu ? observeComputeDispatches(self) : null;
    try {
      await synthesize(engine, probeText || 'A short browser speech check.', part => {
        if (!part.length || !part.every(Number.isFinite)) throw new Error('Invalid CosyVoice3 probe PCM');
      });
    } finally { dispatches = hook?.stop() ?? 0; }
    if (gpu && !dispatches) {
      const reason = 'CosyVoice3 synthesis produced no hardware WebGPU dispatch';
      return {...description, status: 'unsupported', backendEffective: 'none', reason, capability: {gpuDispatchVerified: false, description: reason}};
    }
  }
  return {...description, status: 'measured', ...(gpu ? {gpu: hardware.description} : {}), capability: {
    gpuDispatchVerified: gpu ? dispatches > 0 : null,
    description: gpu ? `Observed ${dispatches} WebGPU compute dispatches during a separate PCM probe; WASM fallback enabled.` : 'Four WASM threads for the five ONNX graphs; browser-worker frontend and sampling.',
  }};
}

self.onmessage = async ({data}) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') {
      const parts = [];
      await synthesize(engine, data.chunk.text, part => {
        if (!part.length) throw new Error('CosyVoice3 returned empty PCM');
        if (!parts.length) self.postMessage({id: data.id, event: 'first-pcm'});
        parts.push(part);
      });
      value = {parts, sampleRate: 24000, completedChunkId: data.chunk.id};
    } else if (data.action === 'audit') {
      value = prepareText(data.text, engine.tokenizer).map(text => ({text, ids: engine.tokenizer.encode(text)}));
    } else if (data.action === 'dispose') { await release(); value = null; }
    else throw new Error('Unexpected CosyVoice3 message');
    self.postMessage({id: data.id, value}, value?.parts?.map(p => p.buffer) ?? []);
  } catch (e) {
    await release().catch(() => {});
    self.postMessage({id: data.id, error: String(e.message ?? e)});
  }
};
