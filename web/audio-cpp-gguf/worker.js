// Classic Emscripten worker. The same file is the pinned pthread main script.
(function () {
  'use strict';
  const RUNTIME_JS = '/runtimes/audio-cpp-browser-v1/bench_browser.js';
  const RUNTIME_WASM = '/runtimes/audio-cpp-browser-v1/bench_browser.wasm';
  const CACHE_PREFIX = 'tts-bench-audio-cpp-gguf-v1';
  const RANGE_BYTES = 16 * 1024 * 1024;
  const THREADS = 6;
  const PTHREAD_POOL_SIZE = 12;
  const isPthread = String(self.name || '').startsWith('em-pthread');
  const dispatchProbe = new URL(self.location.href).searchParams.get('dispatchProbe') === '1';
  let localDispatches = 0;
  let trackedWorkers = null;
  const childDispatches = new WeakMap();

  function observeDispatches() {
    const proto = self.GPUComputePassEncoder && self.GPUComputePassEncoder.prototype;
    if (!proto) return;
    ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect'].forEach(name => {
      const original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function () {
        localDispatches++;
        return original.apply(this, arguments);
      };
    });
  }
  function totalDispatches() {
    let total = localDispatches;
    if (!isPthread && trackedWorkers) trackedWorkers.forEach(worker => { total += childDispatches.get(worker) || 0; });
    return total;
  }
  function instrumentPthreads() {
    if (isPthread) {
      const post = self.postMessage.bind(self);
      self.postMessage = function (message) {
        const rest = Array.prototype.slice.call(arguments, 1);
        const value = message && typeof message === 'object' && !(message instanceof ArrayBuffer)
          ? Object.assign({}, message, { __benchGpuDispatches: localDispatches }) : message;
        return post.apply(null, [value].concat(rest));
      };
      return;
    }
    trackedWorkers = new Set();
    const NativeWorker = self.Worker;
    if (typeof NativeWorker !== 'function') return;
    self.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (String(options && options.name || '').startsWith('em-pthread-')) {
          trackedWorkers.add(this);
          this.addEventListener('message', event => {
            const count = event.data && event.data.__benchGpuDispatches;
            if (Number.isSafeInteger(count) && count >= 0) childDispatches.set(this, count);
          });
        }
      }
    };
  }

  if (dispatchProbe) { observeDispatches(); instrumentPthreads(); }
  importScripts(RUNTIME_JS);
  if (isPthread) return;

  let module = null;
  let config = null;
  let gpuInfo = null;

  function errorText(error) { return String(error && (error.stack || error.message) || error); }
  function runtimeLog(phase, message) {
    if (config && config.diagnosticLogs) self.postMessage({type:'runtime-log',phase,message:String(message)});
  }
  function makeUnsupported(reason, info) {
    return { ...info, status:'unsupported', reason, backendEffective:'none',
      capability:{gpuDispatchVerified:false, description:reason} };
  }
  async function checkGpu() {
    if (!self.navigator || !self.navigator.gpu || !self.navigator.gpu.requestAdapter) {
      return {reason:'Chrome does not expose WebGPU in this worker.'};
    }
    const adapter = await self.navigator.gpu.requestAdapter();
    if (!adapter) return {reason:'Chrome returned no WebGPU adapter.'};
    let info = adapter.info || null;
    if (!info && typeof adapter.requestAdapterInfo === 'function') {
      try { info = await adapter.requestAdapterInfo(); } catch (error) {}
    }
    if (adapter.isFallbackAdapter === true || (info && info.isFallbackAdapter === true)) {
      return {reason:'Software WebGPU fallback adapters are not benchmarked.'};
    }
    return {adapter, description:info && (info.description || info.vendor) || 'Hardware WebGPU adapter'};
  }
  function cacheKey(start, end) {
    return new Request(new URL('/' + CACHE_PREFIX + '/' + config.sha256 + '/' + start + '-' + end, self.location.origin));
  }
  async function readModelRange(cache, start, end) {
    const key = cacheKey(start, end);
    let response = await cache.match(key);
    if (response && (response.headers.get('X-GGUF-SHA256') !== config.sha256 ||
        response.headers.get('X-GGUF-START') !== String(start) ||
        response.headers.get('X-GGUF-END') !== String(end))) {
      await cache.delete(key);
      response = null;
    }
    if (!response) {
      const expectedLength = end - start + 1;
      const network = await fetch(config.modelUrl, {
        headers:{Range:'bytes=' + start + '-' + end}, cache:'no-store', credentials:'same-origin',
      });
      if (network.status !== 206) throw new Error('GGUF range ' + start + '-' + end + ' returned HTTP ' + network.status + ', expected 206.');
      const range = network.headers.get('Content-Range') || '';
      if (range !== 'bytes ' + start + '-' + end + '/' + config.bytes) {
        throw new Error('GGUF range ' + start + '-' + end + ' returned unexpected Content-Range: ' + (range || '(missing)') + '.');
      }
      const declaredLength = Number(network.headers.get('Content-Length'));
      if (declaredLength !== expectedLength) throw new Error('GGUF range ' + start + '-' + end + ' declared ' + declaredLength + ' bytes, expected ' + expectedLength + '.');
      const body = await network.arrayBuffer();
      if (body.byteLength !== expectedLength) throw new Error('GGUF range ' + start + '-' + end + ' body has ' + body.byteLength + ' bytes, expected ' + expectedLength + '.');
      response = new Response(body, {status:200, headers:{
        'Content-Type':'application/octet-stream', 'Content-Length':String(expectedLength),
        'X-GGUF-SHA256':config.sha256, 'X-GGUF-START':String(start), 'X-GGUF-END':String(end),
      }});
      await cache.put(key, response.clone());
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== end - start + 1) throw new Error('Cached GGUF range ' + start + '-' + end + ' has an unexpected length.');
    return bytes;
  }
  async function fillModelFile(runtime, options) {
    config = options.model;
    if (!config || !Number.isSafeInteger(config.bytes) || config.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(config.sha256 || '') || typeof config.modelUrl !== 'string') {
      throw new Error('Invalid pinned GGUF asset configuration.');
    }
    const modelUrl = new URL(config.modelUrl, self.location.href);
    if (modelUrl.origin !== self.location.origin || !modelUrl.pathname.endsWith('.gguf')) {
      throw new Error('GGUF model URL must be a local same-origin .gguf asset.');
    }
    config.modelUrl = modelUrl.href;
    if (self.crossOriginIsolated !== true || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('The six-thread Emscripten build requires cross-origin isolation and SharedArrayBuffer.');
    }
    const fs = runtime.FS;
    if (!fs.analyzePath('/inputs').exists) fs.mkdir('/inputs');
    const path = '/inputs/model.gguf';
    const stream = fs.open(path, 'w');
    const cache = await caches.open(CACHE_PREFIX + '-' + config.sha256);
    try {
      fs.truncate(path, config.bytes);
      let offset = 0;
      while (offset < config.bytes) {
        const end = Math.min(config.bytes - 1, offset + RANGE_BYTES - 1);
        const bytes = await readModelRange(cache, offset, end);
        const written = fs.write(stream, bytes, 0, bytes.length, offset);
        if (written !== bytes.length) throw new Error('Could not write GGUF range ' + offset + '-' + end + ' into MEMFS.');
        offset = end + 1;
        if (config.diagnosticLogs) self.postMessage({type:'asset-progress', loaded:offset, total:config.bytes});
      }
    } finally {
      fs.close(stream);
    }
  }
  function invoke(name, resultType, argTypes, args) {
    return module.ccall(name, resultType, argTypes, args, {async:true});
  }
  function checkPcm() {
    const rate = module._bench_rate();
    const frames = module._bench_frames();
    const channels = module._bench_channels();
    const pointer = module._bench_pcm();
    if (!pointer || !Number.isSafeInteger(frames) || frames <= 0 || channels !== 1 || rate !== 44100) {
      throw new Error('audio.cpp returned invalid PCM metadata: ' + frames + ' frames, ' + channels + ' channels at ' + rate + ' Hz.');
    }
    const pcm = module.HEAPF32.slice(pointer >>> 2, (pointer >>> 2) + frames * channels);
    if (!pcm.length || pcm.length !== frames * channels || !pcm.every(Number.isFinite)) {
      throw new Error('audio.cpp returned empty or non-finite PCM.');
    }
    return {pcm, rate, frames};
  }
  async function synthesize(text, chunkId, emitFirstPcm) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('GGUF generation requires nonempty canonical source text.');
    const before = dispatchProbe ? totalDispatches() : 0;
    runtimeLog('synthesis-start', 'Running ' + chunkId + ' on explicit ' + config.backend + ' backend.');
    const status = await invoke('bench_generate', 'number', ['string','string','number'], [text, 'en', config.seed]);
    if (status !== 0) throw new Error('audio.cpp generation failed (' + status + '): ' + module.ccall('bench_error','string',[],[]));
    const output = checkPcm();
    if (dispatchProbe) await new Promise(resolve => setTimeout(resolve, 0));
    const dispatches = dispatchProbe ? totalDispatches() - before : 0;
    if (dispatchProbe && config.backend === 'webgpu' && dispatches <= 0) {
      module._bench_clear_result();
      throw new Error('The explicit WebGPU backend completed speech without an observed WebGPU compute dispatch.');
    }
    runtimeLog('synthesis-complete', output.frames + ' mono samples at ' + output.rate + ' Hz.');
    if (emitFirstPcm) emitFirstPcm();
    module._bench_clear_result();
    return {parts:[output.pcm], sampleRate:output.rate, completedChunkId:chunkId, dispatches};
  }
  async function initialize(options) {
    config = Object.assign({}, options.model, {backend:options.backend,diagnosticLogs:options.diagnosticLogs === true});
    const family = options.family;
    const threads = options.threads || THREADS;
    if (!Number.isSafeInteger(threads) || threads < 1 || threads > 16) throw new Error('Backend thread count must be an integer from 1 to 16.');
    if (family !== 'ming3_tts' && family !== 'audio8_tts') throw new Error('Unsupported audio.cpp TTS family.');
    if (options.backend !== 'cpu' && options.backend !== 'webgpu') throw new Error('Backend must be explicitly cpu or webgpu.');
    if (options.backend === 'webgpu') {
      const hardware = await checkGpu();
      if (hardware.reason) return makeUnsupported(hardware.reason, options.info || {});
      gpuInfo = hardware.description;
    }
    runtimeLog('runtime-load', 'Loading pinned audio.cpp WebAssembly runtime.');
    module = await createTTS({
      locateFile(name) {
        return name.endsWith('.wasm') ? RUNTIME_WASM :
          new URL(name, self.location.origin + '/runtimes/audio-cpp-browser-v1/').href;
      },
      print(message) { runtimeLog('audio.cpp', message); },
      printErr(message) { runtimeLog('audio.cpp error', message); },
    });
    runtimeLog('runtime-ready', 'WebAssembly module loaded.');
    runtimeLog('model-cache', 'Filling local MEMFS from verified 16 MiB model ranges.');
    await fillModelFile(module, options);
    runtimeLog('session-open', 'Opening ' + family + ' session with ' + options.backend + ' backend and ' + threads + ' threads.');
    const status = await invoke('bench_open','number',['string','string','number'],[family,options.backend,threads]);
    if (status !== 0) throw new Error('audio.cpp model/session initialization failed (' + status + '): ' + module.ccall('bench_error','string',[],[]));
    runtimeLog('session-ready', 'Model session initialized.');
    const info = options.info || {};
    const value = {
      ...info, status:'measured',
      backendEffective:options.backend === 'webgpu' ? 'webgpu' : 'cpu',
      voice:info.voice || (family === 'ming3_tts' ? 'US_James built-in English voice' : 'Reference-free model synthesis'),
      precision:info.precision || 'Pinned GGUF',
      settings:Object.assign({},info.settings || {},{
        language:'en', threads, pthreadPoolSize:PTHREAD_POOL_SIZE,
        modelCache:'Pinned GGUF stored in 16 MiB same-origin CacheStorage ranges keyed by full asset SHA-256, then filled into Emscripten MEMFS; incomplete ranges are rejected. Cache entries can be evicted and fetched again.',
        output:'Mono 44.1 kHz Float32 PCM; offline API returns the complete span before first-pcm is emitted.',
        executionProviders:options.backend === 'webgpu' ? ['webgpu'] : ['cpu'],
      }),
      capability:{
        gpuDispatchVerified:null,
        description:options.backend === 'webgpu'
          ? 'Explicit audio.cpp WebGPU backend on ' + gpuInfo + '; each generated span must show an observed compute dispatch.'
          : 'Explicit audio.cpp CPU backend with ' + threads + ' backend threads; GPU is not used.',
      },
    };
    if (options.backend === 'webgpu') value.gpu = gpuInfo;
    // The benchmark runner validates dispatch in a separate untimed worker. The timed worker remains uninstrumented.
    if (options.probe) {
      const probe = await synthesize(options.probeText || 'The local browser runtime is ready.', 'probe', null);
      value.capability = {
        gpuDispatchVerified:options.backend === 'webgpu' ? probe.dispatches > 0 : null,
        description:options.backend === 'webgpu'
          ? 'Observed ' + probe.dispatches + ' WebGPU dispatches during untimed synthesis with finite CPU-readable PCM. Hooks were installed before runtime init and the probe is outside generation timing.'
          : 'Explicit CPU audio.cpp backend; separate untimed synthesis probe returned finite PCM.',
      };
    }
    return value;
  }
  async function dispose() {
    if (!module) return;
    try { module._bench_shutdown(); } catch (error) {}
    module = null;
    config = null;
  }
  async function handle(event) {
    const data = event.data || {};
    try {
      let value;
      if (data.action === 'initialize') value = await initialize(data.options || {});
      else if (data.action === 'generate') {
        const chunk = data.chunk;
        if (!chunk || !Number.isSafeInteger(chunk.id) || typeof chunk.text !== 'string' ||
            !Number.isSafeInteger(chunk.start) || !Number.isSafeInteger(chunk.end) ||
            chunk.end - chunk.start !== chunk.text.length) {
          throw new Error('Invalid canonical source chunk supplied to audio.cpp.');
        }
        value = await synthesize(chunk.text, chunk.id, function () {
          self.postMessage({id:data.id,event:'first-pcm'});
        });
      } else if (data.action === 'dispose') {
        await dispose();
        value = null;
      } else throw new Error('Unknown audio.cpp worker action.');
      self.postMessage({id:data.id,value:value},value && value.parts ? value.parts.map(part => part.buffer) : []);
    } catch (error) {
      if (data.action === 'initialize') await dispose();
      self.postMessage({id:data.id,error:errorText(error)});
    }
  }
  self.onmessage = handle;
}());
