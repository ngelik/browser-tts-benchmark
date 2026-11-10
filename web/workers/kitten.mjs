import { kittenPhones } from '../kitten/frontend.mjs';
import { readVoiceNpz } from '../kitten/voice.mjs';
import { kittenTokens } from '../kitten/tokens.mjs';
import { dispatchProbe, hardwareGpu } from './gpu-probe.mjs';
const BASE = '/models/kitten-nano-0.8/', RUNTIME = '/runtimes/onnxruntime-web/1.23.2/';
let ort, session, voice;
const INFO = { voice: 'Bella (expr-voice-2-f)', precision: 'FP32', settings: {
  threads: 1, speed: 1, effectiveSpeed: 0.8, sampleRate: 24000,
  frontend: 'Kitten official ONNX TextCleaner/token spacing port; browser eSpeak en-us with stress and preserved punctuation; clean_text=false',
  styleRow: 'min(source text length,399)', tailTrimSamples: 5000,
  noise: 'Graph random noise; no validated public seed input',
}};
const unsupported = reason => ({ ...INFO, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } });
async function generate(chunk) {
  const ids = kittenTokens(await kittenPhones(chunk.text));
  if (ids.length > 512) throw new Error('Kitten exceeds 512 tokens; refusing truncation');
  const row = Math.min(Array.from(chunk.text).length, voice.rows - 1);
  const inputs = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    style: new ort.Tensor('float32', voice.data.slice(row * 256, (row + 1) * 256), [1, 256]),
    speed: new ort.Tensor('float32', Float32Array.of(0.8), [1]),
  };
  let outputs;
  try {
    outputs = await session.run(inputs);
    const raw = Object.values(outputs)[0].data;
    if (raw.length <= 5000) throw new Error('Kitten output shorter than official tail trim');
    return { parts: [Float32Array.from(raw.subarray(0, raw.length - 5000))], sampleRate: 24000, completedChunkId: chunk.id };
  } finally { for (const t of Object.values(inputs)) t.dispose(); if (outputs) for (const t of Object.values(outputs)) t.dispose(); }
}
async function initialize({ backend, probe, probeText }) {
  if (!['cpu', 'webgpu'].includes(backend)) return unsupported('Unknown backend');
  let gpu = backend === 'webgpu' ? await hardwareGpu() : null;
  if (backend === 'webgpu' && !gpu) return unsupported('No hardware WebGPU adapter');
  ort = await import(RUNTIME + (backend === 'cpu' ? 'ort.wasm.min.mjs' : 'ort.webgpu.min.mjs'));
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  const wasm = 'ort-wasm-simd-threaded' + (backend === 'webgpu' ? '.asyncify' : '');
  ort.env.wasm.wasmPaths = { mjs: RUNTIME + wasm + '.mjs', wasm: RUNTIME + wasm + '.wasm' };
  const responses = await Promise.all([fetch(BASE + 'kitten_tts_nano_v0_8.onnx'), fetch(BASE + 'voices.npz')]);
  if (responses.some(x => !x.ok)) throw new Error('Missing local Kitten assets');
  voice = readVoiceNpz(await responses[1].arrayBuffer(), 'expr-voice-2-f');
  const executionProviders = backend === 'cpu' ? ['wasm'] : ['webgpu', 'wasm'];
  session = await ort.InferenceSession.create(await responses[0].arrayBuffer(), { executionProviders, graphOptimizationLevel: 'all' });
  if (backend === 'webgpu') {
    const device = await ort.env.webgpu.device, adapter = ort.env.webgpu.adapter;
    const info = device?.adapterInfo ?? adapter?.info;
    if (info?.isFallbackAdapter || adapter?.isFallbackAdapter) return unsupported('Runtime selected software WebGPU');
    gpu = info?.description || info?.vendor || 'ORT WebGPU device; description unavailable';
  }
  let count = 0;
  if (probe) {
    const hook = backend === 'webgpu' ? dispatchProbe() : null;
    try { const out = await generate({ id: 0, text: probeText }); if (!out.parts[0].every(Number.isFinite)) throw new Error('Nonfinite probe PCM'); }
    finally { count = hook?.stop() ?? 0; }
    if (backend === 'webgpu' && !count) return unsupported('No actual WebGPU dispatch observed');
  }
  return { ...INFO, settings: { ...INFO.settings, executionProviders }, status: 'measured', backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm', gpu,
    capability: { gpuDispatchVerified: backend === 'cpu' ? null : count > 0, description: backend === 'cpu' ? 'Explicit single-thread WASM provider.' : `Observed ${count} dispatches during separate untimed synthesis. WebGPU with WASM operator fallback; CPU eSpeak preprocessing and PCM readback. Hooks removed before timing.` } };
}
self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await session?.release(); session = null; voice = null; value = null; }
    else throw new Error('Unknown Kitten action');
    self.postMessage({ id: data.id, value }, value?.parts?.map(x => x.buffer) ?? []);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
