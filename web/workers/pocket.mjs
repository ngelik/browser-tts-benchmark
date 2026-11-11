import { requestHardwareWebGpuAdapter, observeComputeDispatches } from '../piper/webgpu.mjs';
import { validatePocketChunk, validatePocketPcm } from '../pocket/contract.mjs';
import { auditPocketFrontend, beginPocketGenerationScope, configurePocketWorker, clearPocketWorkerState, handlePocketMessage, releasePocketResources } from '../pocket/upstream-worker.mjs';
import {
  BUNDLE,
  EOS_LOGIT_THRESHOLD,
  EXECUTION_PROVIDERS,
  FRONTEND_DESCRIPTION,
  GENERATION_DESCRIPTION,
  LANGUAGE,
  LATENT_TEMPERATURE,
  MAX_FRAMES_PER_INTERNAL_UTTERANCE,
  MODEL_ID,
  MODEL_ROOT,
  ORT_ROOT,
  SAMPLE_RATE,
  TOKENIZER_JSON_URL,
  TRANSFORMERS_ROOT,
  VOICE,
  VOICE_DESCRIPTION,
  WASM_THREADS,
} from '../pocket/settings.mjs';

const nativePostMessage = self.postMessage.bind(self);
const nativeFetch = globalThis.fetch.bind(globalThis);
let activeRequest = null;
let worker = null;
let ortModule = null;
let restoreFetch = null;
let activeBackend = null;
let activeProviders = [];
let gpuDescription = null;
let initialized = false;

function installLocalFetchFence() {
  globalThis.fetch = async (input, init) => {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(value, self.location.href);
    if (url.origin !== self.location.origin) throw new Error(`Pocket TTS attempted a non-local fetch: ${url.origin}`);
    return nativeFetch(input, init);
  };
  restoreFetch = () => { globalThis.fetch = nativeFetch; };
}

function forwardedUpstreamMessage(message) {
  const request = activeRequest;
  if (!request || !message || typeof message !== 'object') return;
  if (message.type === 'error') {
    request.error ??= String(message.error ?? 'Pinned Pocket TTS frontend reported an error.');
    return;
  }
  if (message.type === 'loaded') {
    request.loaded = true;
    return;
  }
  if (message.type === 'bundle_loaded') {
    request.bundle = { language: message.language, sampleRate: message.sampleRate };
    return;
  }
  if (message.type === 'voices_loaded') {
    request.voices = [...(message.voices ?? [])];
    request.defaultVoice = message.defaultVoice ?? null;
    request.language = message.language;
    return;
  }
  if (message.type === 'stream_ended') {
    request.streamEnded = true;
    return;
  }
  if (message.type !== 'audio_chunk') return;
  if (!(message.data instanceof Float32Array) || message.data.length === 0) {
    request.error ??= 'Pinned Pocket TTS frontend emitted an empty or invalid PCM chunk.';
    return;
  }
  const pcm = new Float32Array(message.data);
  request.parts.push(pcm);
  if (!request.firstPcm) {
    request.firstPcm = true;
    nativePostMessage({ id: request.id, event: 'first-pcm' });
  }
}

// The pinned Apache-2.0 demo worker speaks an uncorrelated UI protocol. Capture
// its events locally and expose only the benchmark's request-ID RPC contract.
self.postMessage = message => forwardedUpstreamMessage(message);

function settings() {
  return {
    executionProviders: [...activeProviders],
    language: LANGUAGE,
    bundle: BUNDLE,
    voice: VOICE,
    temperature: LATENT_TEMPERATURE,
    randomSeed: 'Unseeded; pinned worker uses Math.random() Box-Muller latent noise.',
    sampleRate: SAMPLE_RATE,
    wasmThreads: WASM_THREADS,
    maxFramesPerInternalUtterance: MAX_FRAMES_PER_INTERNAL_UTTERANCE,
    eosLogitThreshold: EOS_LOGIT_THRESHOLD,
    frontend: FRONTEND_DESCRIPTION,
    generation: GENERATION_DESCRIPTION,
    voiceSelection: VOICE_DESCRIPTION,
    modelFiles: 'Five pinned ONNX graphs; four use dynamically quantized initializers and the text conditioner is FP32. The local Unigram tokenizer conversion and preset voice-state assets are hash-locked.',
    chunking: 'The 93 canonical source spans are passed whole; pinned frontend may split each into internal sentence/50-token utterances and inserts 0.25 seconds of silence between them.',
    outputLocation: 'ONNX Runtime Web default CPU output; every session.run is awaited before copied Float32 PCM is returned.',
  };
}

function unsupported(reason) {
  return {
    status: 'unsupported',
    reason,
    backendEffective: 'none',
    voice: VOICE,
    precision: 'Mixed: 4 quantized graphs (Flow main/flow, MIMI encoder/decoder); FP32 text conditioner.',
    settings: settings(),
    capability: { gpuDispatchVerified: false, description: reason },
  };
}

async function invokeFrontend(id, type, data = {}) {
  if (activeRequest) throw new Error('Pocket TTS does not accept overlapping frontend operations.');
  const request = { id, type, parts: [], error: null, loaded: false, streamEnded: false, firstPcm: false, bundle: null, voices: [], defaultVoice: null, language: null };
  activeRequest = request;
  try {
    await handlePocketMessage({ data: { type, data } });
    if (request.error) throw new Error(request.error);
    return request;
  } finally {
    activeRequest = null;
  }
}

async function loadRuntime(backend) {
  installLocalFetchFence();
  const entry = backend === 'webgpu' ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs';
  const runtimeUrl = new URL(ORT_ROOT + entry, self.location.href);
  const tokenizerUrl = new URL(TOKENIZER_JSON_URL, self.location.href);
  const transformersUrl = new URL(`${TRANSFORMERS_ROOT}transformers.min.js`, self.location.href);
  const modelRoot = new URL(MODEL_ROOT, self.location.href);
  for (const url of [runtimeUrl, tokenizerUrl, transformersUrl, modelRoot]) {
    if (url.origin !== self.location.origin) throw new Error('Pocket TTS assets must be staged on the local origin.');
  }

  ortModule = await import(runtimeUrl.href);
  ortModule.env.logLevel = 'error';
  ortModule.env.wasm.numThreads = WASM_THREADS;
  ortModule.env.wasm.proxy = false;
  const wasmBundle = backend === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
  ortModule.env.wasm.wasmPaths = {
    mjs: `${ORT_ROOT}${wasmBundle}.mjs`,
    wasm: `${ORT_ROOT}${wasmBundle}.wasm`,
  };

  if (backend === 'webgpu') {
    const selection = await requestHardwareWebGpuAdapter(globalThis.navigator?.gpu);
    if (selection.reason) return { reason: selection.reason };
    gpuDescription = selection.description;
    ortModule.env.webgpu.adapter = selection.adapter;
  }

  const runtime = ortModule.default || ortModule;
  worker = { ready: false };
  activeProviders = [...EXECUTION_PROVIDERS[backend]];
  configurePocketWorker({ ort: runtime, providers: activeProviders });
  const loaded = await invokeFrontend(0, 'load');
  if (!loaded.loaded) throw new Error('Pinned Pocket TTS frontend did not confirm model loading.');
  if (loaded.bundle?.language !== BUNDLE || loaded.bundle?.sampleRate !== SAMPLE_RATE) {
    throw new Error(`Pinned Pocket TTS bundle reported ${loaded.bundle?.language}/${loaded.bundle?.sampleRate}; expected ${BUNDLE}/${SAMPLE_RATE}.`);
  }
  if (loaded.defaultVoice !== VOICE || !loaded.voices.includes(VOICE)) {
    throw new Error(`Pinned Pocket TTS bundle did not initialize expected built-in voice '${VOICE}'.`);
  }
  worker.ready = true;
  return {};
}

async function synthesize(chunk, id) {
  validatePocketChunk(chunk);
  if (!worker?.ready) throw new Error('Pocket TTS is not initialized.');
  const scope = beginPocketGenerationScope();
  try {
    const request = await invokeFrontend(id, 'generate', { text: chunk.text, voice: VOICE });
    if (!request.streamEnded) throw new Error(`Pinned Pocket TTS frontend did not finish source chunk ${chunk.id}.`);
    const checked = validatePocketPcm(request.parts, SAMPLE_RATE, chunk.id, chunk.id);
    return { parts: checked.parts, sampleRate: SAMPLE_RATE, completedChunkId: chunk.id };
  } finally {
    scope.dispose();
  }
}

async function initialize({ backend, probe, probeText }) {
  if (!Object.hasOwn(EXECUTION_PROVIDERS, backend)) return unsupported('Unsupported Pocket TTS backend.');
  if (initialized) throw new Error('Pocket TTS worker is already initialized.');
  activeBackend = backend;
  activeProviders = [...EXECUTION_PROVIDERS[backend]];
  gpuDescription = null;

  try {
    const selection = await loadRuntime(backend);
    if (selection.reason) {
      await dispose();
      return unsupported(selection.reason);
    }

    let capability = backend === 'cpu'
      ? { gpuDispatchVerified: null, description: `Explicit ${WASM_THREADS}-thread ONNX Runtime Web WASM; text processing runs in the worker.` }
      : { gpuDispatchVerified: false, description: 'Configured ONNX Runtime WebGPU with WASM operator fallback; actual compute dispatch has not been probed.' };
    if (probe) {
      const dispatch = backend === 'webgpu' ? observeComputeDispatches(self) : null;
      let dispatches = 0;
      try {
        const text = probeText || 'A short browser speech check.';
        const pcm = await synthesize({ id: 0, start: 0, end: text.length, text }, 1);
        const samples = pcm.parts.reduce((sum, part) => sum + part.length, 0);
        if (!samples || pcm.parts.some(part => !part.every(Number.isFinite))) {
          throw new Error('Pocket TTS capability synthesis returned empty or nonfinite PCM.');
        }
      } finally {
        dispatches = dispatch?.stop() ?? 0;
      }
      if (backend === 'webgpu') {
        if (dispatches === 0) {
          await dispose();
          return unsupported('No actual WebGPU compute dispatch was observed during Pocket TTS synthesis.');
        }
        const actualAdapter = await ortModule.env.webgpu.adapter;
        if (actualAdapter?.isFallbackAdapter === true || actualAdapter?.info?.isFallbackAdapter === true) {
          await dispose();
          return unsupported('ONNX Runtime selected a software fallback WebGPU adapter.');
        }
        gpuDescription = actualAdapter?.info?.description || actualAdapter?.info?.vendor || gpuDescription;
        capability = {
          gpuDispatchVerified: true,
          description: `Observed ${dispatches} WebGPU compute dispatches in separate untimed Pocket TTS synthesis; WebGPU with WASM fallback. Hooks removed before scored generation.`,
        };
      }
    }
    initialized = true;
    return {
      status: 'measured',
      backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm',
      voice: VOICE,
      precision: 'Mixed: 4 quantized graphs (Flow main/flow, MIMI encoder/decoder); FP32 text conditioner.',
      settings: settings(),
      capability,
      ...(backend === 'webgpu' ? { gpu: gpuDescription || 'WebGPU adapter description unavailable' } : {}),
    };
  } catch (error) {
    await dispose().catch(() => {});
    throw error;
  }
}

async function dispose() {
  let firstError = null;
  worker = null;
  try { await releasePocketResources(); } catch (error) { firstError = error; }
  clearPocketWorkerState();
  restoreFetch?.();
  restoreFetch = null;
  ortModule = null;
  activeBackend = null;
  activeProviders = [];
  gpuDescription = null;
  initialized = false;
  if (firstError) throw firstError;
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await synthesize(data.chunk, data.id);
    else if (data.action === 'audit') value = auditPocketFrontend(data.text);
    else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Pocket TTS benchmark action.');
    const transfer = value?.parts?.map(part => part.buffer) ?? [];
    nativePostMessage({ id: data.id, value }, transfer);
  } catch (error) {
    nativePostMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};
