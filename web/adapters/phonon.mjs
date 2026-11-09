const REVISION = '92741c5b07d085ff840e26fea8ce43110b87852f';
const ROOT = '/models/phonon-31m-en/' + REVISION + '/';
const RUNTIME = '/runtimes/phonon-tts/0.6.0/';
const PROBE_WORKER = '/web/workers/phonon-probe-worker.mjs';
const SEED = 4242424242424242n;

export class UnsupportedBackendError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedBackendError';
    this.unsupported = true;
  }
}

function readWorkerControl(worker) {
  let serial = 0;
  return (action, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const id = 'phonon-probe-' + (++serial);
    const timer = setTimeout(() => finish(new Error('Phonon dispatch probe control timed out')), timeoutMs);
    const onMessage = event => {
      const data = event.data;
      if (data?.type !== 'bench-dispatch' || data.id !== id) return;
      if (data.error) finish(new Error(data.error));
      else finish(null, data.value);
    };
    function finish(error, value) {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      if (error) reject(error);
      else resolve(value);
    }
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'bench-control', action, id });
  });
}

async function hardwareAdapter() {
  if (!navigator.gpu) return { adapter: null, reason: 'This Chrome profile does not expose WebGPU.' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { adapter: null, reason: 'Chrome did not provide a WebGPU adapter.' };
    const info = adapter.info ?? {};
    const fallback = Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter);
    if (fallback) return { adapter: null, reason: 'Chrome returned a software fallback adapter; this run requires hardware WebGPU.' };
    return { adapter, info };
  } catch (error) {
    return { adapter: null, reason: 'WebGPU adapter request failed: ' + String(error?.message ?? error) };
  }
}

function interceptProbeWorker() {
  const NativeWorker = globalThis.Worker;
  let captured = null;
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args, newTarget) {
      const worker = Reflect.construct(target, args, newTarget);
      if (String(args[0]).includes(PROBE_WORKER)) captured = worker;
      return worker;
    },
  });
  return {
    get worker() { return captured; },
    restore() { globalThis.Worker = NativeWorker; },
  };
}

async function loadRuntime(backend, cache, probe) {
  const phonon = await import(RUNTIME + 'index.js');
  const capture = probe && backend === 'webgpu' ? interceptProbeWorker() : null;
  let tts;
  try {
    tts = await phonon.PhononTTS.load({
      lang: 'en',
      model: {
        weights: { q8: ROOT + 'model.q8.gguf' },
        tokenizer: ROOT + 'tokenizer.json',
        config: ROOT + 'config.json',
        voices: { default: ROOT + 'default-voice.safetensors' },
        defaultVoice: 'default',
      },
      quant: 'q8',
      device: backend,
      threads: 1,
      cache,
      workerUrl: new URL(probe && backend === 'webgpu' ? PROBE_WORKER : RUNTIME + 'worker.js', location.origin),
      wasmUrl: new URL(RUNTIME + 'wasm/phonon_tts_bg.wasm', location.origin),
      simdWasmUrl: new URL(RUNTIME + 'wasm/phonon_tts_simd_bg.wasm', location.origin),
    });
  } finally {
    capture?.restore();
  }
  return { tts, probeWorker: capture?.worker ?? null };
}

async function verifyDispatch(tts, worker, probeText) {
  if (!worker) throw new Error('The instrumented Phonon worker was not captured.');
  const control = readWorkerControl(worker);
  await control('start');
  let probeError = null;
  try {
    for await (const pcm of tts.stream(probeText, { voice: 'default', seed: SEED })) {
      if (!(pcm instanceof Float32Array) || pcm.length === 0) throw new Error('Phonon capability probe returned an empty PCM block.');
    }
  } catch (error) {
    probeError = error;
  }
  const counts = await control('stop');
  if (probeError) throw probeError;
  const total = counts.dispatchWorkgroups + counts.dispatchWorkgroupsIndirect;
  return { total, counts };
}

export async function createPhononAdapter() {
  let tts = null;
  let worker = null;
  let initialized = false;
  let info = null;

  return {
    async initialize({ backend, cache = true, probe = false, probeText = 'A short browser speech check.' }) {
      if (!['cpu', 'webgpu'].includes(backend)) {
        return {
          status: 'unsupported',
          reason: 'Phonon supports explicit CPU/WASM and WebGPU backends.',
          backendEffective: 'none',
          voice: 'default',
          precision: 'q8 GGUF',
          settings: { quant: 'q8', threads: 1, seed: String(SEED) },
          capability: { gpuDispatchVerified: false, description: 'Requested backend is not available in this Phonon runtime.' },
        };
      }
      let adapterInfo = null;
      if (backend === 'webgpu') {
        const gpuAdapter = await hardwareAdapter();
        if (!gpuAdapter.adapter) {
          return {
            status: 'unsupported',
            reason: gpuAdapter.reason,
            backendEffective: 'none',
            voice: 'default',
            precision: 'q8 GGUF',
            settings: { quant: 'q8', threads: 1, seed: String(SEED) },
            capability: { gpuDispatchVerified: false, description: gpuAdapter.reason },
          };
        }
        adapterInfo = gpuAdapter.info;
      }
      const loaded = await loadRuntime(backend, cache, probe);
      tts = loaded.tts;
      worker = loaded.probeWorker;
      initialized = true;
      if (tts.device !== backend) {
        await this.dispose();
        throw new Error('Phonon silently selected ' + tts.device + ' after ' + backend + ' was requested.');
      }
      let capability;
      if (backend === 'cpu') {
        capability = { gpuDispatchVerified: null, description: 'CPU/WASM was explicitly requested; generation uses one worker thread.' };
      } else if (probe) {
        const observed = await verifyDispatch(tts, worker, probeText);
        if (observed.total < 1) {
          await this.dispose();
          return {
            status: 'unsupported',
            reason: 'The WebGPU adapter loaded, but no compute dispatch was observed during the excluded capability utterance.',
            backendEffective: 'none',
            voice: 'default',
            precision: 'q8 GGUF',
            settings: { quant: 'q8', threads: 1, seed: String(SEED) },
            capability: { gpuDispatchVerified: false, description: 'No compute dispatch was observed in the probe.' },
          };
        }
        capability = {
          gpuDispatchVerified: true,
          description: 'Observed ' + observed.total + ' WebGPU compute dispatches during a separate untimed utterance; hooks were removed before measured generation.',
        };
      } else {
        capability = { gpuDispatchVerified: null, description: 'WebGPU was requested; no dispatch probe was run for this initialization.' };
      }
      info = {
        status: 'measured',
        backendEffective: tts.device,
        voice: 'default',
        precision: 'q8 GGUF',
        settings: { quant: 'q8', threads: 1, seed: String(SEED), cache },
        capability,
        gpu: adapterInfo?.description || adapterInfo?.vendor || null,
        sampleRate: tts.sampleRate,
      };
      return info;
    },

    async generateChunk(chunk, { onFirstPcm } = {}) {
      if (!initialized || !tts) throw new Error('Phonon has not been initialized.');
      const parts = [];
      let first = true;
      for await (const pcm of tts.stream(chunk.text, { voice: 'default', seed: SEED })) {
        if (first && pcm.length > 0) {
          first = false;
          onFirstPcm?.();
        }
        parts.push(pcm);
      }
      return { parts, sampleRate: tts.sampleRate, completedChunkId: chunk.id };
    },

    async dispose() {
      if (tts) tts.dispose();
      tts = null;
      worker = null;
      initialized = false;
    },

    get info() { return info; },
  };
}
