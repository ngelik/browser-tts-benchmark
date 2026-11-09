// Original adapter; upstream Leokani frontend/G2P modules are fetched into cache.
const ORT = '/runtimes/onnxruntime-web/1.23.2/';
let cpuOrt, ttsOrt, config, g2p, session, idsChunks, istftSame;
let sampleRate = 24000;
const INFO = { voice: 'default', precision: 'INT8' };
function unsupported(reason) {
  return { ...INFO, status: 'unsupported', reason, backendEffective: 'none', settings: {},
    capability: { gpuDispatchVerified: false, description: reason } };
}
function configure(ort, asyncify) {
  ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
  const stem = 'ort-wasm-simd-threaded' + (asyncify ? '.asyncify' : '');
  ort.env.wasm.wasmPaths = { mjs: ORT + stem + '.mjs', wasm: ORT + stem + '.wasm' };
}
async function pinned(file) {
  if (new URL(file.url, location.origin).origin !== location.origin) throw new Error('Leokani assets must be local');
  const response = await fetch(file.url);
  if (!response.ok) throw new Error('Missing Leokani asset');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  if (bytes.length !== file.bytes || digest !== file.sha256) throw new Error('Leokani asset size or checksum mismatch');
  return bytes;
}
function hooks() {
  let count = 0; const original = [];
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    const proto = globalThis.GPUComputePassEncoder?.prototype, fn = proto?.[name];
    if (typeof fn !== 'function') continue;
    original.push([proto, name, fn]);
    proto[name] = function(...args) { count++; return fn.apply(this, args); };
  }
  return () => { for (const [proto, name, fn] of original) proto[name] = fn; return count; };
}
async function generate(chunk) {
  if (!session || !g2p) throw new Error('Leokani has not initialized');
  const parts = [];
  for (const ids of await idsChunks(chunk.text, g2p, config.vocab)) {
    const input = new ttsOrt.Tensor('int64', BigInt64Array.from([0, ...ids, 0], BigInt), [1, ids.length + 2]);
    const speed = new ttsOrt.Tensor('float32', Float32Array.of(1), [1]);
    let outputs;
    try {
      outputs = await session.run({ ids: input, speed });
      parts.push(istftSame(outputs.mag.data, outputs.phase.data, outputs.mag.dims[2]));
    } finally {
      input.dispose(); speed.dispose();
      if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose?.();
    }
  }
  return { parts, sampleRate, completedChunkId: chunk.id };
}
async function initialize({ model, backend, probe, probeText }) {
  const variant = model === 'leokani-7m' ? '7m' : model === 'leokani-4.5m' ? '4.5m' : null;
  if (!variant) throw new Error('Unknown Leokani model');
  let gpu = null;
  if (backend === 'webgpu') {
    if (!navigator.gpu) return unsupported('Chrome does not expose WebGPU');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return unsupported('No WebGPU adapter is available');
    if (adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) return unsupported('Software WebGPU adapters are not ranked');
    gpu = adapter.info?.description || adapter.info?.vendor || 'Hardware WebGPU adapter';
  }
  if (!['cpu', 'webgpu', 'webgl'].includes(backend)) return unsupported('Unknown backend');
  const response = await fetch('/runtimes/leokani/config-' + variant + '.json');
  if (!response.ok) throw new Error('Missing local Leokani configuration');
  config = await response.json();
  cpuOrt = await import(ORT + 'ort.wasm.min.mjs'); configure(cpuOrt, false);
  // G2P creates several sessions; serialize creation for this pinned WASM runtime.
  const create = cpuOrt.InferenceSession.create;
  let tail = Promise.resolve();
  cpuOrt.InferenceSession.create = function(bytes, options) {
    const pending = tail.then(() => Reflect.apply(create, cpuOrt.InferenceSession, [bytes, options]));
    tail = pending.catch(() => {}); return pending;
  };
  ttsOrt = backend === 'cpu' ? cpuOrt : await import(ORT + (backend === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.webgl.min.mjs'));
  if (backend !== 'cpu') configure(ttsOrt, backend === 'webgpu');
  const entries = Object.entries(config.files).filter(([key]) => key !== 'ortWasm');
  const bytes = Object.fromEntries(await Promise.all(entries.map(async ([key, file]) => [key, await pinned(file)])));
  ({ idsChunks } = await import('/runtimes/leokani/frontend.mjs?v=6f666de59070ed04'));
  ({ istftSame } = await import('/runtimes/leokani/istft.mjs?v=6f666de59070ed04'));
  const { create: createG2P } = await import('/runtimes/leokani/load.mjs?v=6f666de59070ed04');
  g2p = await createG2P(null, cpuOrt, { files: { lexicon: bytes.g2pLexicon, encoder: bytes.g2pEncoder,
    decoder: bytes.g2pDecoder, context: bytes.g2pContext }, sha256: false, executionProviders: ['wasm'] });
  const executionProviders = backend === 'cpu' ? ['wasm'] : backend === 'webgpu' ? ['webgpu', 'wasm'] : ['webgl'];
  try { session = await ttsOrt.InferenceSession.create(bytes.model, { executionProviders, graphOptimizationLevel: 'all' }); }
  catch (error) {
    if (backend === 'webgl' && /int64|FLOAT16|not supported|unsupported|no available backend/i.test(String(error))) return unsupported('Pinned Leokani WebGL graph is incompatible: ' + String(error).slice(0, 500));
    throw error;
  }
  if (backend === 'webgpu') {
    const actualDevice = await ttsOrt.env.webgpu.device;
    const actualAdapter = ttsOrt.env.webgpu.adapter;
    const actualInfo = actualDevice?.adapterInfo ?? actualAdapter?.info;
    if (actualInfo?.isFallbackAdapter || actualAdapter?.isFallbackAdapter) return unsupported('ORT selected a software fallback GPU adapter');
    gpu = actualInfo?.description || actualInfo?.vendor || 'ORT WebGPU device; description unavailable';
  }
  sampleRate = config.sample_rate ?? config.sampleRate ?? 24000;
  // Preserve the historical runtime's excluded short initialization synthesis.
  await generate({ id: 0, text: 'Hello there.' });
  let capability = { gpuDispatchVerified: backend === 'cpu' ? null : false,
    description: backend === 'cpu' ? 'Explicit single-thread WASM TTS and G2P; JavaScript iSTFT.' : 'WebGPU TTS with WASM fallback; CPU G2P and JavaScript iSTFT. Probe not requested.' };
  if (probe) {
    const stop = backend === 'webgpu' ? hooks() : () => 0;
    let count = 0;
    try {
      const output = await generate({ id: 0, text: probeText });
      if (!output.parts.length || output.parts.some(p => !p.length || !p.every(Number.isFinite))) throw new Error('Capability probe produced invalid PCM');
    } finally { count = stop(); }
    if (backend === 'webgpu') {
      if (count === 0) return unsupported('No actual WebGPU dispatch observed during Leokani synthesis');
      capability = { gpuDispatchVerified: true, description: `Observed ${count} compute dispatches in a separate utterance. WebGPU TTS with WASM fallback; CPU G2P and JavaScript iSTFT. Hooks removed before timing.` };
    }
    if (backend === 'webgl') return unsupported('WebGL lacks validated draw-dispatch evidence in this adapter');
  }
  return { ...INFO, status: 'measured', backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm', gpu,
    settings: { variant, threads: 1, speed: 1, sampleRate, executionProviders, g2pExecutionProviders: ['wasm'], initializationWarmup: 'Hello there.' }, capability };
}
self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk);
    else if (data.action === 'dispose') { await session?.release(); await g2p?.dispose?.(); session = null; g2p = null; value = null; }
    else throw new Error('Unknown Leokani worker action');
    self.postMessage({ id: data.id, value }, value?.parts?.map(p => p.buffer) ?? []);
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
};
