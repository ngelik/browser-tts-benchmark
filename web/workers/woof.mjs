const noop = () => {};
globalThis.window = {
  location: { search: '' },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  addEventListener: noop,
  removeEventListener: noop,
  innerHeight: 0,
  visualViewport: { height: 0, offsetTop: 0, addEventListener: noop, removeEventListener: noop },
};

const MODEL_DIRECTORY = '/models/woof-one-voice';
const MODEL_BYTES = 31_708_642;
const INFO = {
  modelId: 'Underdog-Woof-one-voice', revision: 'be702960539777fc3f698e54335276a8391b00f9',
  runtime: 'official Woof WebGPU runtime + local worker shim', runtimeOrigin: 'official-with-local-adaptation',
  voice: 'Isla', precision: 'INT8', backendRequested: 'webgpu', backendEffective: 'webgpu',
  threadsEffective: null, sampleRate: 24000,
};

let engine;
let device;
let disposed = false;
let intentionalDeviceDestroy = false;
const active = new Map();

function progress(file, loaded, total) {
  self.postMessage({ type: 'progress', progress: { file, loaded, total, cached: false } });
}

function adapterInfo(adapter) {
  const info = adapter?.info;
  if (!info) return null;
  return {
    vendor: info.vendor ?? null,
    architecture: info.architecture ?? null,
    device: info.device ?? null,
    description: info.description ?? null,
  };
}

function unsupported(reason) {
  return { ...INFO, status: 'unsupported', reason, backendEffective: 'none',
    settings: { voice: 'Isla', precision: 'INT8', sampleRate: 24000, batchSamples: 6000 },
    capability: { gpuDispatchVerified: false, description: reason } };
}

function observeComputeDispatches() {
  let count = 0;
  const restore = [];
  const prototype = globalThis.GPUComputePassEncoder?.prototype;
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    if (typeof prototype?.[name] !== 'function') continue;
    const original = prototype[name];
    restore.push([prototype, name, original]);
    prototype[name] = function (...args) { count += 1; return original.apply(this, args); };
  }
  return { stop() { for (const [proto, name, fn] of restore) proto[name] = fn; return count; } };
}

class PcmBatcher {
  constructor(jobId, chunkId) {
    this.jobId = jobId;
    this.chunkId = chunkId;
    this.parts = [];
    this.length = 0;
    this.sampleOffset = 0;
    this.targetSamples = 6000; // 250 ms at the native 24 kHz output rate.
  }

  append(pcm) {
    if (!(pcm instanceof Float32Array)) pcm = Float32Array.from(pcm);
    if (!pcm.length) return;
    this.parts.push(pcm.slice());
    this.length += pcm.length;
    while (this.length >= this.targetSamples) this.flush(this.targetSamples);
  }

  flush(count = this.length) {
    if (count <= 0 || !this.length) return;
    const output = new Float32Array(count);
    let copied = 0;
    while (copied < count) {
      const part = this.parts[0];
      const take = Math.min(count - copied, part.length);
      output.set(part.subarray(0, take), copied);
      copied += take;
      if (take === part.length) this.parts.shift();
      else this.parts[0] = part.subarray(take);
    }
    this.length -= count;
    const offset = this.sampleOffset;
    const samples = output.length;
    this.sampleOffset += samples;
    self.postMessage({ type: 'pcm', jobId: this.jobId, chunkId: this.chunkId, sampleOffset: offset, sampleRate: INFO.sampleRate, pcm: output }, [output.buffer]);
  }
}

async function load(options = {}) {
  const began = performance.now();
  if (options.backend !== 'webgpu') {
    self.postMessage({ type: 'ready', info: unsupported('Woof is pinned to its WebGPU execution path.') });
    return;
  }
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    self.postMessage({ type: 'ready', info: unsupported('No WebGPU adapter is available in this worker.') });
    return;
  }
  if (adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) {
    self.postMessage({ type: 'ready', info: unsupported('Software WebGPU adapters are not ranked.') });
    return;
  }
  const gpuAdapterInfo = adapterInfo(adapter);
  const fallback = adapter.isFallbackAdapter ?? null;
  device = await adapter.requestDevice({ requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  } });
  const deviceLimits = {
    maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
    maxBufferSize: device.limits.maxBufferSize,
  };
  device.lost.then((lost) => {
    if (disposed || intentionalDeviceDestroy) return;
    for (const controller of active.values()) controller.abort();
    self.postMessage({ type: 'gpu-device-lost', deviceLost: { reason: lost.reason, message: lost.message ?? '' } });
  });
  self.postMessage({ type: 'gpu-capabilities', adapter: gpuAdapterInfo, fallback, deviceLimits });
  const { loadWoof } = await import('/runtimes/woof/woof.js');
  engine = await loadWoof(MODEL_DIRECTORY, {
    download: (fraction) => progress('Woof one-voice INT8 weights', Math.round(Math.max(0, Math.min(1, fraction)) * MODEL_BYTES), MODEL_BYTES),
    gpu: (fraction) => self.postMessage({ type: 'runtime-progress', stage: 'webgpu-upload', fraction }),
  }, device);
  if (!engine) throw new Error('The official Woof WebGPU runtime could not initialize this model');
  if (engine.rate !== INFO.sampleRate) {
    throw new Error(`Woof runtime sample rate ${engine.rate} did not match the pinned ${INFO.sampleRate} Hz output rate`);
  }
  let gpuDispatchVerified = false;
  let probeDispatches = 0;
  if (options.probe) {
    const hooks = observeComputeDispatches();
    let samples = 0;
    try {
      const signal = new AbortController().signal;
      await engine.speak(options.probeText?.slice(0, 80) || 'Hello there.', pcm => { samples += pcm?.length ?? 0; }, signal, async () => 0, 'narrator');
    } finally {
      probeDispatches = hooks.stop();
    }
    if (!samples) throw new Error('Woof dispatch probe returned no PCM samples');
    if (!probeDispatches) {
      self.postMessage({ type: 'ready', info: unsupported('No WebGPU compute dispatch was observed during Woof synthesis.') });
      return;
    }
    gpuDispatchVerified = true;
  }
  self.postMessage({ type: 'ready', info: {
    ...INFO,
    gpu: gpuAdapterInfo?.description || gpuAdapterInfo?.device || gpuAdapterInfo?.vendor || 'WebGPU adapter',
    status: 'measured',
    backendEffective: 'webgpu',
    sampleRate: engine.rate,
    gpuAdapterInfo,
    gpuFallbackAdapter: fallback,
    gpuDeviceLimits: deviceLimits,
    gpuDeviceLost: { state: 'pending' },
    loadMs: performance.now() - began,
    settings: { voice: 'Isla', precision: 'INT8', sampleRate: engine.rate, batchSamples: 6000,
      textNormalization: 'official runtime', workerThreads: 1 },
    capability: { gpuDispatchVerified, description: options.probe
      ? `Observed ${probeDispatches} WebGPU compute dispatches during untimed synthesis; instrumentation removed before timing.`
      : 'The local worker requested WebGPU; a separate dispatch probe was not requested.' },
  } });
}

async function speak(jobId, chunk) {
  const controller = new AbortController();
  active.set(jobId, controller);
  const output = new PcmBatcher(jobId, chunk.id);
  try {
    if (disposed || !engine) throw new Error('Woof WebGPU engine is not available');
    await engine.speak(chunk.text, (pcm) => {
      if (controller.signal.aborted) return;
      output.append(pcm);
    }, controller.signal, async () => 0, 'narrator');
    if (controller.signal.aborted) throw new DOMException('Synthesis cancelled', 'AbortError');
    output.flush();
    self.postMessage({ type: 'chunk-done', jobId, chunkId: chunk.id, samples: output.sampleOffset, batchMs: 250 });
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  } finally {
    active.delete(jobId);
  }
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') void load(data.options).catch((error) => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }));
  else if (data.type === 'synthesize') void speak(data.jobId, data.chunk);
  else if (data.type === 'cancel') active.get(data.jobId)?.abort();
  else if (data.type === 'dispose') {
    disposed = true;
    intentionalDeviceDestroy = true;
    for (const controller of active.values()) controller.abort();
    device?.destroy?.();
    self.postMessage({ type: 'disposed' }); // Worker termination releases the official GPU runtime and buffers.
  }
};
