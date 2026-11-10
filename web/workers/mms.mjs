import { AutoTokenizer } from '/runtimes/transformers/3.5.1/transformers.min.js';
import { configureTransformers } from './transformers-support.mjs';
import { dispatchProbe, hardwareGpu } from './gpu-probe.mjs';
import { normalizeMms } from '../mms/normalize.mjs';
let model, tokenizer, ort;
const INFO = { voice: 'English fixed voice', precision: 'FP32', settings: {
  threads: 1, sampleRate: 16000, runtime: 'Transformers.js 3.5.1 tokenizer / ONNX Runtime Web 1.23.2',
  frontend: 'English numeric spelling followed by official MMS VitsTokenizer; lowercase graphemes and model punctuation normalization',
  noise: 'Graph random noise; no validated public seed input',
}};
const unsupported = reason => ({ ...INFO, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } });
async function generate(chunk) {
  const inputs = tokenizer(normalizeMms(chunk.text), { truncation: false });
  if (inputs.input_ids.dims.at(-1) > 4096) throw new Error('MMS token limit exceeded');
  const feeds = Object.fromEntries(model.inputNames.map(name => [name, new ort.Tensor(inputs[name].type, inputs[name].data, inputs[name].dims)]));
  let outputs;
  try {
    outputs = await model.run(feeds);
    return { parts: [Float32Array.from(outputs.waveform.data)], sampleRate: 16000, completedChunkId: chunk.id };
  } finally {
    for (const value of Object.values(feeds)) value.dispose?.();
    for (const value of Object.values(inputs)) value.dispose?.();
    if (outputs) for (const value of Object.values(outputs)) value.dispose?.();
  }
}
async function initialize({ backend, probe, probeText }) {
  if (!['cpu', 'webgpu'].includes(backend)) return unsupported('Unknown backend');
  let gpu = backend === 'webgpu' ? await hardwareGpu() : null;
  if (backend === 'webgpu' && !gpu) return unsupported('No hardware WebGPU adapter is available');
  configureTransformers();
  tokenizer = await AutoTokenizer.from_pretrained('mms-english', { local_files_only: true });
  const runtime = '/runtimes/onnxruntime-web/1.23.2/';
  ort = await import(runtime + (backend === 'cpu' ? 'ort.wasm.min.mjs' : 'ort.webgpu.min.mjs'));
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  const wasm = 'ort-wasm-simd-threaded' + (backend === 'webgpu' ? '.asyncify' : '');
  ort.env.wasm.wasmPaths = { mjs: runtime + wasm + '.mjs', wasm: runtime + wasm + '.wasm' };
  const response = await fetch('/models/mms-english/onnx/model.onnx');
  if (!response.ok) throw new Error('Missing local MMS graph');
  model = await ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: backend === 'cpu' ? ['wasm'] : ['webgpu','wasm'], graphOptimizationLevel: 'all' });
  if (backend === 'webgpu') {
    const device = await ort.env.webgpu.device, adapter = ort.env.webgpu.adapter;
    const info = device?.adapterInfo ?? adapter?.info;
    if (info?.isFallbackAdapter || adapter?.isFallbackAdapter) return unsupported('Runtime selected software WebGPU');
    gpu = info?.description || info?.vendor || 'ORT WebGPU device; description unavailable';
  }
  let count = 0;
  if (probe) {
    const hook = backend === 'webgpu' ? dispatchProbe() : null;
    try { const out = await generate({ id: 0, text: probeText }); if (!out.parts[0].length || !out.parts[0].every(Number.isFinite)) throw new Error('Invalid probe PCM'); }
    finally { count = hook?.stop() ?? 0; }
    if (backend === 'webgpu' && !count) return unsupported('No actual WebGPU compute dispatch observed during synthesis');
  }
  return { ...INFO, settings: { ...INFO.settings, executionProviders: backend === 'cpu' ? ['wasm'] : ['webgpu','wasm'] }, status: 'measured',
    backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm', gpu,
    capability: { gpuDispatchVerified: backend === 'cpu' ? null : count > 0,
      description: backend === 'cpu' ? 'Explicit single-thread WASM provider.' : `Observed ${count} dispatches in separate untimed synthesis. CPU tokenization and possible WASM operators; CPU-readable output. Hooks removed before timing.` } };
}
self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await model?.release(); model = null; tokenizer = null; value = null; }
    else throw new Error('Unknown MMS action');
    self.postMessage({ id: data.id, value }, value?.parts?.map(x => x.buffer) ?? []);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
