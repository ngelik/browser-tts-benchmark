import { KokoroTTS } from '../kokoro/kokoro.js';
import { configureTransformers, verifySelectedGpu } from './transformers-support.mjs';
import { dispatchProbe, hardwareGpu } from './gpu-probe.mjs';
let engine;
const INFO = { voice: 'af_heart', precision: 'FP32', settings: {
  threads: 1, speed: 1, sampleRate: 24000, runtime: 'kokoro-js 1.2.1 / Transformers.js 3.5.1',
  frontend: 'Official Kokoro eSpeak normalization; collapse source whitespace; expand syllabic l/n/m to schwa+consonant; strict 512-token limit; no truncation',
  noise: 'Graph random noise; no public seed input',
}};
const unsupported = reason => ({ ...INFO, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } });
async function generate(chunk) {
  const audio = await engine.generate(chunk.text.replace(/\s+/gu, " "), { voice: INFO.voice, speed: 1 });
  return { parts: [Float32Array.from(audio.audio)], sampleRate: audio.sampling_rate, completedChunkId: chunk.id };
}
async function initialize({ backend, probe, probeText }) {
  if (!['cpu', 'webgpu'].includes(backend)) return unsupported('Unknown backend');
  let gpu = backend === 'webgpu' ? await hardwareGpu() : null;
  if (backend === 'webgpu' && !gpu) return unsupported('No hardware WebGPU adapter is available');
  configureTransformers();
  engine = await KokoroTTS.from_pretrained('kokoro-82m', { dtype: 'fp32', device: backend === 'cpu' ? 'wasm' : 'webgpu' });
  const tokenizer = engine.tokenizer;
  engine.tokenizer = (text, options) => {
    for (const symbol of text) if (!tokenizer.model.tokens_to_ids.has(symbol)) throw new Error("Unknown Kokoro phoneme: " + JSON.stringify(symbol));
    const result = tokenizer(text, { ...options, truncation: false });
    if (result.input_ids.dims.at(-1) > 512) throw new Error('Kokoro input exceeds 512 tokens; refusing silent truncation');
    return result;
  };
  if (backend === 'webgpu') gpu = await verifySelectedGpu();
  let count = 0;
  if (probe) {
    const hook = backend === 'webgpu' ? dispatchProbe() : null;
    try { const out = await generate({ id: 0, text: probeText }); if (!out.parts[0].length || !out.parts[0].every(Number.isFinite)) throw new Error('Invalid probe PCM'); }
    finally { count = hook?.stop() ?? 0; }
    if (backend === 'webgpu' && !count) return unsupported('No actual WebGPU compute dispatch observed during synthesis');
  }
  return { ...INFO, settings: { ...INFO.settings, executionProviders: backend === 'cpu' ? ['wasm'] : ['webgpu'] }, status: 'measured',
    backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm', gpu,
    capability: { gpuDispatchVerified: backend === 'cpu' ? null : count > 0,
      description: backend === 'cpu' ? 'Explicit single-thread WASM provider.' : `Observed ${count} dispatches in separate untimed synthesis. CPU preprocessing and possible WASM operators; CPU-readable output. Hooks removed before timing.` } };
}
self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await engine?.model.dispose(); engine = null; value = null; }
    else throw new Error('Unknown Kokoro action');
    self.postMessage({ id: data.id, value }, value?.parts?.map(x => x.buffer) ?? []);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
