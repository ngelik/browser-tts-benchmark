// Local adapter for the pinned audio.cpp GGUF browser build.
const THREADS = 6;
const PTHREAD_POOL_SIZE = 12;
const WORKER_URL = new URL('../audio-cpp-gguf/worker.js', import.meta.url);

const MING = Object.freeze({
  id: 'ming-3.0-tts-0.5b-gguf',
  name: 'Ming 3.0 TTS',
  family: 'ming3_tts',
  model: {
    modelUrl: '/models/ming3-tts-0.5b-q8_0-gguf/2eb8d37c7f10672e69c8aa33091baa04c461b66c/ming-3.0-tts-0.5b-q8_0.gguf',
    bytes: 1742280896,
    sha256: 'fcf2aa25e8e9cf2065a936e506581735c64d6255fb7869f09fbb61a2dde09aa1',
    seed: 1895,
  },
  info: {
    voice: 'US_James built-in voice (English)',
    precision: 'Q8_0 GGUF; the pinned checkpoint retains a BF16 stop head and F32 speaker encoder.',
    settings: {
      language: 'en',
      template: 'ip',
      voiceId: 'US_James',
      seed: 1895,
      maxTokens: 1000,
      guidanceScale: 2,
      sigma: 0.25,
      temperature: 0,
      sampleRate: 44100,
      threads: THREADS,
      pthreadPoolSize: 12,
    },
  },
});

const AUDIO8_DEFAULTS = Object.freeze({
  id: 'audio8-realistic-0.6b-q8-gguf',
  name: 'Audio8 TTS Realistic',
  family: 'audio8_tts',
  info: {
    voice: 'Reference-free English synthesis; no fixed speaker ID.',
    precision: 'Q8_0 GGUF; native ggml model tensors.',
    settings: {
      language: 'en',
      seed: 42,
      topP: 0.8,
      topK: 30,
      temperature: 0.8,
      maxTokens: 1024,
      textChunkSize: 200,
      sampleRate: 44100,
      threads: THREADS,
      pthreadPoolSize: 12,
      sessionArenas: '16 MiB AR/codec weight contexts, 64 MiB AR/codec graph arenas; reduced metadata arena settings.',
    },
  },
});

export function createAudioCppGgufAdapter(modelConfig, { threads = modelConfig?.info?.settings?.threads ?? THREADS, diagnosticLogs = false } = {}) {
  if (!modelConfig || !modelConfig.family || !modelConfig.model || !modelConfig.info) {
    throw new Error('audio.cpp GGUF adapter requires a model config.');
  }
  if (!Number.isSafeInteger(threads) || threads < 1 || threads > 16) {
    throw new Error('audio.cpp diagnostic thread count must be an integer from 1 to 16.');
  }
  const model = {
    ...modelConfig,
    model: { ...modelConfig.model },
    info: { ...modelConfig.info, settings: { ...(modelConfig.info.settings || {}), threads, pthreadPoolSize: PTHREAD_POOL_SIZE } },
  };
  let worker = null;
  let nextId = 0;
  let failed = false;
  const pending = new Map();
  let lastProgressLogged = 0;

  function terminate(error) {
    if (failed) return;
    failed = true;
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    pending.clear();
    if (worker) worker.terminate();
    worker = null;
  }

  function request(action, payload, onFirstPcm) {
    return new Promise((resolve, reject) => {
      if (failed || !worker) {
        reject(new Error(model.name + ' audio.cpp worker is unavailable.'));
        return;
      }
      const id = ++nextId;
      const timeout = action === 'dispose' ? 10000 : 0;
      const call = {
        action,
        onFirstPcm,
        resolve,
        reject,
        timer: timeout ? setTimeout(() => {
          pending.delete(id);
          reject(new Error(model.name + ' worker did not acknowledge dispose within ' + timeout + ' ms.'));
        }, timeout) : null,
      };
      pending.set(id, call);
      try { worker.postMessage(Object.assign({ id, action }, payload || {})); }
      catch (error) {
        pending.delete(id);
        clearTimeout(call.timer);
        reject(error);
        terminate(error);
      }
    });
  }

  function onWorkerError(error) {
    terminate(error instanceof Error ? error : new Error(String(error)));
  }

  return {
    async initialize({ backend = 'cpu', probe = false, probeText } = {}) {
      if (worker || failed) throw new Error(model.name + ' adapter instances initialize only once.');
      const workerUrl = new URL(WORKER_URL);
      if (probe) workerUrl.searchParams.set('dispatchProbe', '1');
      worker = new Worker(workerUrl, { name: 'tts-bench-audio-cpp-' + model.family });
      worker.onmessage = function ({ data }) {
        if (data && data.type === 'runtime-log') {
          if (diagnosticLogs) console.info('[audio.cpp/' + model.family + '] ' + (data.phase ? data.phase + ': ' : '') + data.message);
          return;
        }
        if (data && data.type === 'asset-progress') {
          if (diagnosticLogs && (data.loaded === data.total || data.loaded - lastProgressLogged >= 256 * 1024 * 1024)) {
            lastProgressLogged = data.loaded;
            console.info('[audio.cpp/' + model.family + '] model-cache: ' + data.loaded + '/' + data.total + ' bytes');
          }
          return;
        }
        const call = pending.get(data && data.id);
        if (!call) return;
        if (data.event === 'first-pcm') {
          if (call.onFirstPcm) call.onFirstPcm();
          return;
        }
        pending.delete(data.id);
        clearTimeout(call.timer);
        if (data.error) {
          const error = new Error(data.error);
          call.reject(error);
          if (call.action === 'initialize') terminate(error);
        } else {
          call.resolve(data.value);
        }
      };
      worker.onerror = event => onWorkerError(new Error(model.name + ' worker failed: ' + (event && event.message || 'unknown worker error')));
      worker.onmessageerror = () => onWorkerError(new Error(model.name + ' worker message could not be deserialized.'));
      return request('initialize', {
        options: {
          family: model.family,
          model: model.model,
          info: model.info,
          backend,
          threads,
          pthreadPoolSize: PTHREAD_POOL_SIZE,
          diagnosticLogs,
          probe,
          probeText,
          cache: true,
        },
      });
    },

    async generateChunk(chunk, { onFirstPcm } = {}) {
      if (!chunk || !Number.isSafeInteger(chunk.id) || !Number.isSafeInteger(chunk.start) ||
          !Number.isSafeInteger(chunk.end) || typeof chunk.text !== 'string' ||
          chunk.end - chunk.start !== chunk.text.length) {
        throw new Error(model.name + ' requires an exact canonical source chunk.');
      }
      const response = await request('generate', { chunk }, onFirstPcm);
      if (!response || response.completedChunkId !== chunk.id || response.sampleRate !== 44100 ||
          !Array.isArray(response.parts) || !response.parts.length ||
          response.parts.some(part => !(part instanceof Float32Array) || !part.length || !part.every(Number.isFinite))) {
        throw new Error(model.name + ' returned an invalid or mismatched PCM chunk.');
      }
      return response;
    },

    async dispose() {
      if (!worker) return;
      try {
        if (!failed) await request('dispose');
      } finally {
        if (worker) worker.terminate();
        worker = null;
        failed = true;
        for (const call of pending.values()) {
          clearTimeout(call.timer);
          call.reject(new Error(model.name + ' worker disposed.'));
        }
        pending.clear();
      }
    },

    abort(error) { terminate(error instanceof Error ? error : new Error(String(error))); },
  };
}

export function createMingGgufAdapter(options = {}) {
  return createAudioCppGgufAdapter(MING, options);
}

export function createAudio8GgufAdapter({ modelUrl, bytes, sha256 } = {}) {
  if (typeof modelUrl !== 'string' || !Number.isSafeInteger(bytes) || !/^[a-f0-9]{64}$/.test(sha256 || '')) {
    throw new Error('Audio8 GGUF adapter requires its pinned local model URL, byte count and SHA-256.');
  }
  return createAudioCppGgufAdapter({
    ...AUDIO8_DEFAULTS,
    model: { modelUrl, bytes, sha256, seed: 42 },
  });
}
