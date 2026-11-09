import { phonemize } from '../paradee/frontend.js';
import { toMisaki } from '../paradee/misaki.js';

const RUNTIME = '/runtimes/onnxruntime-web/1.23.2/';
const MODEL = '/models/paradee-8m-v1.2/';
let ort, session, config;
const INFO = {
  voice: 'af_heart', precision: 'INT8',
  settings: { threads: 1, speed: 1, voiceIndex: 0, sampleRate: 24000,
    frontend: 'Kokoro eSpeak en-us normalization + Paradee Misaki conversion',
    noise: 'Internal graph random noise; no validated public seed input' },
};

function unsupported(reason) {
  return { ...INFO, settings: { ...INFO.settings }, status: 'unsupported', reason,
    backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
}

function dispatchProbe() {
  let count = 0;
  const original = [];
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    const proto = globalThis.GPUComputePassEncoder?.prototype;
    if (typeof proto?.[name] !== 'function') continue;
    const fn = proto[name];
    original.push([proto, name, fn]);
    proto[name] = function(...args) { count++; return fn.apply(this, args); };
  }
  return { stop() { for (const [proto, name, fn] of original) proto[name] = fn; return count; } };
}

async function generate(chunk) {
  if (!session) throw new Error('Paradee has not been initialized');
  const raw = await phonemize(chunk.text, 'a', true);
  const phones = toMisaki(raw, false).replace(/\s+/gu, ' ').trim();
  const unknown = [...new Set(Array.from(phones).filter(symbol => config.vocab[symbol] === undefined))];
  if (unknown.length) throw new Error('Paradee frontend produced unknown symbols: ' + JSON.stringify(unknown));
  const tokenIds = Array.from(phones, symbol => config.vocab[symbol]);
  if (tokenIds.length + 2 > 512) throw new Error('Paradee exceeds its 512-token input limit');
  const inputs = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from([0, ...tokenIds, 0], BigInt), [1, tokenIds.length + 2]),
    speed: new ort.Tensor('float32', Float32Array.of(1), [1]),
    voice: new ort.Tensor('int64', BigInt64Array.of(0n), [1]),
  };
  let outputs;
  try {
    outputs = await session.run(inputs);
    // Default CPU output location ensures GPU completion/readback before returning.
    const pcm = Float32Array.from(outputs.waveform.data);
    return { parts: [pcm], sampleRate: 24000, completedChunkId: chunk.id };
  } finally {
    for (const tensor of Object.values(inputs)) tensor.dispose();
    if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose?.();
  }
}

async function initialize({ backend, probe, probeText }) {
  if (!['cpu', 'webgpu', 'webgl'].includes(backend)) return unsupported('Unknown backend');
  let gpu = null;
  if (backend === 'webgpu') {
    if (!navigator.gpu) return unsupported('Chrome does not expose WebGPU');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return unsupported('No WebGPU adapter is available');
    if (adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) return unsupported('Software WebGPU adapters are not ranked');
    gpu = adapter.info?.description || adapter.info?.vendor || 'Hardware WebGPU adapter';
  }
  const bundle = backend === 'cpu' ? 'ort.wasm.min.mjs' : backend === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.webgl.min.mjs';
  ort = await import(RUNTIME + bundle);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
  const wasm = backend === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
  ort.env.wasm.wasmPaths = { mjs: RUNTIME + wasm + '.mjs', wasm: RUNTIME + wasm + '.wasm' };
  const responses = await Promise.all([fetch(MODEL + 'config.json'), fetch(MODEL + 'paradee_int8.onnx')]);
  if (responses.some(response => !response.ok)) throw new Error('Paradee local assets could not be loaded');
  config = await responses[0].json();
  const model = await responses[1].arrayBuffer();
  const executionProviders = backend === 'cpu' ? ['wasm'] : backend === 'webgpu' ? ['webgpu', 'wasm'] : ['webgl'];
  try {
    session = await ort.InferenceSession.create(model, { executionProviders, graphOptimizationLevel: 'all' });
  } catch (error) {
    if (backend === 'webgl' && /FLOAT16|int64|not supported|unsupported|no available backend/i.test(String(error))) {
      return unsupported('Pinned Paradee WebGL provider cannot load this graph: ' + String(error).slice(0, 500));
    }
    throw error;
  }
  let capability = { gpuDispatchVerified: backend === 'cpu' ? null : false,
    description: backend === 'cpu' ? 'Explicit single-thread ONNX WASM provider.' : 'WebGPU + WASM operator fallback configured; capability probe not requested.' };
  if (probe) {
    const hooks = backend === 'webgpu' ? dispatchProbe() : null;
    let observed = 0;
    try {
      const output = await generate({ id: 0, text: probeText });
      if (!output.parts[0].length || !output.parts[0].every(Number.isFinite)) throw new Error('Capability probe did not produce finite PCM');
    } finally { observed = hooks?.stop() ?? 0; }
    if (backend === 'webgpu') {
      if (observed === 0) return unsupported('No actual WebGPU compute dispatch was observed during synthesis');
      capability = { gpuDispatchVerified: true, description: `Observed ${observed} compute dispatches in a separate untimed utterance. WebGPU + WASM operator fallback; CPU text preprocessing. Hooks removed before timing.` };
    }
    if (backend === 'webgl') return unsupported('WebGL graph loaded but this harness has no validated draw-dispatch evidence path');
  }
  return { ...INFO, settings: { ...INFO.settings, executionProviders }, status: 'measured',
    backendEffective: backend === 'cpu' ? 'cpu/wasm' : backend === 'webgpu' ? 'webgpu+wasm' : 'webgl', capability, gpu };
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await session?.release(); session = null; value = null; }
    else throw new Error('Unknown Paradee worker action');
    const buffers = value?.parts?.map(part => part.buffer) ?? [];
    self.postMessage({ id: data.id, value }, buffers);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
