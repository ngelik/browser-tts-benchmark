// This classic worker loads the pinned GPL sanotts-web runtime from the local
// asset cache. This file is original harness integration; upstream runtime
// files stay cache-only and retain their own GPL-3.0-or-later terms.
const MODEL_REVISION = '4a8194aa1dd958033ee449b3ad30c37e536b216e';
const RUNTIME_ROOT = '/runtimes/sanotts-web/0.3.0/dist/';
const MODEL_ROOT = `/models/sano-amy/${MODEL_REVISION}/web/`;
const VOICE = 'amy';
const LANGUAGE = 'en';
const EXPECTED_SAMPLE_RATE = 22050;
// Canonical chunks can exceed 20 seconds in this voice. Keep a generous cap,
// and fail closed if the native wrapper returns a waveform at that boundary.
const MAX_SECONDS = 120;
const MAX_PHONEME_IDS = 1024;

let engine = null;
let voiceMeta = null;
let restoreFetch = null;
let removeDocumentShim = null;

function baseInfo(backend = 'cpu') {
  const front = voiceMeta?.front || 'front_f32.bin';
  const decoder = voiceMeta?.dec || 'dec_f32.bin';
  const fp32Bundle = /_f32\.bin$/.test(front) && /_f32\.bin$/.test(decoder);
  return {
    voice: 'Amy (English, eSpeak en-us)',
    precision: fp32Bundle ? 'FP32 browser voice bundle' : 'Voice bundle precision from pinned meta.json',
    settings: {
      runtime: 'sanotts-web@0.3.0',
      modelRevision: MODEL_REVISION,
      voiceKey: VOICE,
      language: LANGUAGE,
      espeakVoice: voiceMeta?.espeak_voice ?? 'en-us',
      g2pVoiceSlot: voiceMeta?.g2p_voice_slot ?? null,
      lengthScale: voiceMeta?.length_scale ?? null,
      sampleRate: voiceMeta?.sample_rate ?? EXPECTED_SAMPLE_RATE,
      maxSeconds: MAX_SECONDS,
      maxPhonemeIds: MAX_PHONEME_IDS,
      executionProviders: backend === 'cpu' ? ['wasm'] : [],
      callPattern: 'One official SanoTTS.synthesize call per canonical source chunk; no harness text splitting.',
      assetOrigins: 'Explicit local assetBase and voiceBase; cross-origin fetches and classic script loads are rejected.',
      disposal: 'The official wrapper has no dispose method; the dedicated worker is terminated to release its WebAssembly modules.',
    },
  };
}

function unsupported(reason) {
  return {
    ...baseInfo('unsupported'),
    status: 'unsupported',
    reason,
    backendEffective: 'none',
    capability: { gpuDispatchVerified: false, description: reason },
  };
}

function installLocalFetch() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const requested = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(requested, self.location.href);
    if (url.origin !== self.location.origin) {
      throw new Error(`Sano attempted a non-local fetch: ${url.origin}`);
    }
    return nativeFetch(input, init);
  };
  restoreFetch = () => { globalThis.fetch = nativeFetch; };
}

function installClassicScriptDocument() {
  const runtimeBase = new URL(RUNTIME_ROOT, self.location.origin);
  const allowedScripts = new Set([
    new URL('snt_g2p.js', runtimeBase).href,
    new URL('snt_voice.js', runtimeBase).href,
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  if (previous) throw new Error('Sano expected a dedicated worker without a document global.');

  const documentShim = {
    currentScript: null,
    createElement(tagName) {
      if (tagName !== 'script') throw new Error(`Sano requested unsupported worker DOM element: ${tagName}`);
      return { src: '', async: false, onload: null, onerror: null };
    },
    head: {
      appendChild(script) {
        const url = new URL(script.src, self.location.href);
        if (url.origin !== self.location.origin || !allowedScripts.has(url.href)) {
          throw new Error(`Sano attempted an unpinned or non-local script load: ${url.href}`);
        }
        // The official Emscripten glue is a classic UMD script. importScripts
        // preserves its global exports and the real WorkerGlobalScope path.
        importScripts(url.href);
        script.onload?.();
        return script;
      },
    },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: documentShim,
  });
  removeDocumentShim = () => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  };
}

function localAssetUrl(path) {
  return new URL(path, self.location.origin).href;
}

function runtimeUrl(path) {
  return localAssetUrl(RUNTIME_ROOT + path);
}

function localVoiceBase() {
  return localAssetUrl(MODEL_ROOT);
}

function requireAmyMetadata(meta) {
  if (!meta || typeof meta !== 'object') throw new Error('Pinned Amy meta.json is missing or invalid.');
  if (meta.runtime === 'snt_nano') throw new Error('Pinned Amy metadata selected the wrong Sano runtime family.');
  if (meta.espeak_voice !== 'en-us') throw new Error(`Pinned Amy eSpeak voice was ${String(meta.espeak_voice)}; expected en-us.`);
  const sampleRate = meta.sample_rate || EXPECTED_SAMPLE_RATE;
  if (sampleRate !== EXPECTED_SAMPLE_RATE) {
    throw new Error(`Pinned Amy sample rate was ${String(sampleRate)}; expected ${EXPECTED_SAMPLE_RATE}.`);
  }
  if (!Number.isFinite(meta.length_scale) || meta.length_scale <= 0) {
    throw new Error('Pinned Amy metadata has no valid length_scale.');
  }
  return meta;
}

async function initialize({ backend, probe = false, probeText = 'A short browser speech check.' }) {
  if (backend !== 'cpu') {
    return unsupported('The official Sano runtime only provides CPU WebAssembly; WebGPU is unavailable.');
  }

  const rpcHandler = self.onmessage;
  try {
    installLocalFetch();
    installClassicScriptDocument();
    const { SanoTTS } = await import(runtimeUrl('index.js'));
    if (typeof SanoTTS?.load !== 'function') throw new Error('Pinned sanotts-web runtime did not export SanoTTS.load().');
    engine = await SanoTTS.load({ assetBase: localAssetUrl(RUNTIME_ROOT) });
    const bundle = await engine.loadVoice(VOICE, { voiceBase: localVoiceBase() });
    voiceMeta = requireAmyMetadata(bundle?.meta);
    if (probe) {
      const probeResult = await synthesize({ id: 'sano-probe', text: probeText });
      if (!probeResult.parts[0].length || !probeResult.parts[0].every(Number.isFinite)) {
        throw new Error('Sano CPU capability probe returned invalid PCM.');
      }
    }
  } catch (error) {
    await dispose();
    throw error;
  } finally {
    // The upstream eSpeak/Emscripten initialization may assign self.onmessage
    // when it sees WorkerGlobalScope. Restore the benchmark RPC handler before
    // another request can be dispatched.
    self.onmessage = rpcHandler;
  }

  return {
    ...baseInfo('cpu'),
    status: 'measured',
    backendEffective: 'cpu/wasm',
    capability: {
      gpuDispatchVerified: null,
      description: probe
        ? 'Official Sano Emscripten WebAssembly inference in a headed Chrome classic worker; an untimed CPU utterance passed; no GPU execution.'
        : 'Official Sano Emscripten WebAssembly inference in a headed Chrome classic worker; no GPU execution.',
    },
  };
}

async function synthesize(chunk) {
  if (!engine || !voiceMeta) throw new Error('Sano has not been initialized.');
  if (typeof chunk?.text !== 'string' || chunk.text.length === 0) throw new Error('Sano received an empty source chunk.');
  const rpcHandler = self.onmessage;
  try {
    const result = await engine.synthesize(chunk.text, {
      voice: VOICE,
      voiceBase: localVoiceBase(),
      maxSeconds: MAX_SECONDS,
    });
    if (!(result?.samples instanceof Float32Array) || result.samples.length === 0) {
      throw new Error('Official Sano runtime returned empty or non-Float32 PCM.');
    }
    if (result.sampleRate !== EXPECTED_SAMPLE_RATE) {
      throw new Error(`Official Sano returned sample rate ${String(result.sampleRate)}; expected ${EXPECTED_SAMPLE_RATE}.`);
    }
    if (!Number.isInteger(result.phonemeCount) || result.phonemeCount < 1 || result.phonemeCount >= MAX_PHONEME_IDS) {
      throw new Error(`Official Sano returned phonemeCount=${String(result.phonemeCount)}; expected 1..${MAX_PHONEME_IDS - 1} (the runtime limit is ${MAX_PHONEME_IDS}).`);
    }
    if (result.samples.length >= EXPECTED_SAMPLE_RATE * MAX_SECONDS) {
      throw new Error(`Official Sano output reached its ${MAX_SECONDS}-second cap; refusing possibly clipped audio.`);
    }
    return {
      // The official runtime already returns owned Float32 PCM. Transfer its
      // buffer directly; whole-result finite validation happens after the
      // timed generation window in the shared benchmark page.
      parts: [result.samples],
      sampleRate: result.sampleRate,
      completedChunkId: chunk.id,
    };
  } finally {
    self.onmessage = rpcHandler;
  }
}

async function dispose() {
  engine = null;
  voiceMeta = null;
  restoreFetch?.();
  restoreFetch = null;
  removeDocumentShim?.();
  removeDocumentShim = null;
}

const rpcHandler = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options ?? {});
    else if (data.action === 'generate') value = await synthesize(data.chunk);
    else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Sano worker action.');
    const buffers = value?.parts?.map(part => part.buffer) ?? [];
    self.postMessage({ id: data.id, value }, buffers);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  } finally {
    self.onmessage = rpcHandler;
  }
};
self.onmessage = rpcHandler;
