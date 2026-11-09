import { normalizePiperConfig, strictPhonemeIdMap } from '../piper/config.mjs';

const MODEL_ROOT = '/models/piper-en-gb-southern-english-female-low/e7229f7d33a10e145e109b886d661984201ac3c4/';
const MODEL_FILE = 'en_GB-southern_english_female-low.onnx';
const CONFIG_PATH = MODEL_ROOT + MODEL_FILE + '.json';
const MODEL_PATH = MODEL_ROOT + MODEL_FILE;
const PIPER_ROOT = '/runtimes/piper-samples/da672d1157136d07365790f51da3357a17cf9650/';
const ORT_ROOT = '/runtimes/onnxruntime-web/1.23.2/';
const SAMPLE_RATE = 16000;
const VOICE = 'en_GB-southern_english_female-low (single speaker)';
const PRECISION = 'FP32 ONNX';

let ort = null;
let piper = null;
let session = null;
let voiceConfig = null;
let restoreFetch = null;
const pendingTensors = new Set();

function baseInfo() {
  const inference = voiceConfig?.inference ?? {};
  return {
    voice: VOICE,
    precision: PRECISION,
    settings: {
      executionProviders: ['wasm'],
      threads: 1,
      espeakVoice: 'en-gb-x-rp',
      speakerId: null,
      sampleRate: SAMPLE_RATE,
      phonemeType: voiceConfig?.phoneme_type ?? 'espeak',
      lengthScale: inference.length_scale ?? 1,
      noiseScale: inference.noise_scale ?? 0.667,
      noiseWScale: inference.noise_w ?? 0.8,
      sentenceHandling: 'Official Piper frontend converts each source chunk to eSpeak IPA and concatenates sentence IDs for one ONNX call.',
      unknownPhonemes: 'Error; unknown symbols are not silently dropped.',
      configCompatibility: 'Pinned voice JSON omits phoneme_type; the local response wrapper supplies espeak so the official frontend initializes its eSpeak module. Hashed source bytes remain unchanged.',
      workerIsolation: 'The official eSpeak module assigns global onmessage when it detects WorkerGlobalScope. The adapter restores the benchmark RPC handler after setVoice initialization.',
      randomSeed: 'The pinned Piper graph/runtime exposes no validated seed input.',
    },
  };
}

function unsupported(reason) {
  return {
    ...baseInfo(),
    status: 'unsupported',
    reason,
    backendEffective: 'none',
    capability: { gpuDispatchVerified: false, description: reason },
  };
}

function installLocalFetch() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const dataUrl = new URL(PIPER_ROOT + 'espeakng.worker.data', self.location.origin).href;
  const configUrl = new URL(CONFIG_PATH, self.location.origin).href;
  globalThis.fetch = async (input, init) => {
    const requested = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(requested, self.location.href);
    if (url.origin !== self.location.origin) throw new Error('Piper attempted a non-local fetch: ' + url.origin);
    if (url.pathname.endsWith('/espeakng.worker.data')) return nativeFetch(dataUrl, init);
    if (url.pathname.endsWith('/espeakng.worker.wasm')) {
      return nativeFetch(new URL(PIPER_ROOT + 'resources/espeakng.worker.wasm', self.location.origin).href, init);
    }
    const response = await nativeFetch(input, init);
    if (url.href !== configUrl || !response.ok) return response;
    voiceConfig = normalizePiperConfig(await response.json());
    const runtimeConfig = {
      ...voiceConfig,
      phoneme_id_map: strictPhonemeIdMap(voiceConfig.phoneme_id_map),
    };
    return { ok: true, json: async () => runtimeConfig };
  };
  restoreFetch = () => { globalThis.fetch = nativeFetch; };
}

function trackSession(value) {
  session = value;
  const originalRun = value.run.bind(value);
  value.run = async (...args) => {
    const feeds = args[0] ?? {};
    for (const tensor of Object.values(feeds)) if (typeof tensor?.dispose === 'function') pendingTensors.add(tensor);
    const results = await originalRun(...args);
    for (const tensor of Object.values(results ?? {})) if (typeof tensor?.dispose === 'function') pendingTensors.add(tensor);
    return results;
  };
}

function releasePendingTensors() {
  let firstError = null;
  for (const tensor of pendingTensors) {
    try { tensor.dispose(); }
    catch (error) { firstError ??= error; }
  }
  pendingTensors.clear();
  if (firstError) throw new Error('Piper tensor disposal failed: ' + String(firstError?.message ?? firstError));
}

async function synthesize(text) {
  if (!piper || !session) throw new Error('Piper has not been initialized.');
  let pcm;
  try {
    const source = await piper.textToFloat32Audio(
      text,
      undefined,
      voiceConfig.inference?.length_scale ?? 1,
      voiceConfig.inference?.noise_scale ?? 0.667,
      voiceConfig.inference?.noise_w ?? 0.8,
    );
    if (!(source instanceof Float32Array)) throw new Error('Piper returned non-Float32 PCM.');
    pcm = Float32Array.from(source);
  } finally {
    releasePendingTensors();
  }
  if (pcm.length < 1) throw new Error('Piper returned empty PCM.');
  return pcm;
}

async function initialize({ backend, probe, probeText }) {
  if (backend !== 'cpu') {
    return unsupported('This adapter currently validates only explicit CPU/WASM execution; WebGPU and WebGL have no verified Piper result.');
  }

  ort = await import(ORT_ROOT + 'ort.wasm.min.mjs');
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    mjs: ORT_ROOT + 'ort-wasm-simd-threaded.mjs',
    wasm: ORT_ROOT + 'ort-wasm-simd-threaded.wasm',
  };
  globalThis.ort = ort;

  installLocalFetch();
  try {
    piper = await import(PIPER_ROOT + 'resources/piper.js');
    const create = ort.InferenceSession.create;
    ort.InferenceSession.create = async function (model, options = {}) {
      const created = await create.call(this, model, {
        ...options,
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      if (session) {
        await created.release();
        throw new Error('Piper created more than one ONNX session.');
      }
      trackSession(created);
      return created;
    };
    try {
      const rpcHandler = self.onmessage;
      try {
        await piper.setVoice(MODEL_PATH, CONFIG_PATH);
      } finally {
        self.onmessage = rpcHandler;
      }
    } finally {
      ort.InferenceSession.create = create;
    }
  } catch (error) {
    await dispose();
    throw error;
  } finally {
    restoreFetch?.();
    restoreFetch = null;
  }

  if (!voiceConfig || !session) throw new Error('Official Piper runtime did not retain the expected voice and session.');
  if (probe) {
    const pcm = await synthesize(probeText || 'A short browser speech check.');
    if (pcm.length < 1) throw new Error('Piper capability synthesis returned no PCM.');
  }
  return {
    ...baseInfo(),
    status: 'measured',
    backendEffective: 'cpu/wasm',
    capability: { gpuDispatchVerified: null, description: 'Explicit ONNX Runtime Web WASM provider with one thread; eSpeak preprocessing and synthesis run locally in the Chrome worker.' },
  };
}

async function dispose() {
  releasePendingTensors();
  const current = session;
  session = null;
  piper = null;
  voiceConfig = null;
  restoreFetch?.();
  restoreFetch = null;
  if (current) await current.release();
  ort = null;
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') {
      const pcm = await synthesize(data.chunk.text);
      value = { parts: [pcm], sampleRate: SAMPLE_RATE, completedChunkId: data.chunk.id };
    } else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Piper worker action');
    const buffers = value?.parts?.map(part => part.buffer) ?? [];
    self.postMessage({ id: data.id, value }, buffers);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};
