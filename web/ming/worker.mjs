import { fetchModelAsset } from '../cache-model-asset.mjs';
import { loadHttpParts } from '../liquid-cpu/part-loader.mjs';
// Adapter for the pinned public Fusor Ming WASM runtime. No model code, normalization or synthesis
// math is reimplemented here; this worker maps the upstream Runtime API to benchmark source spans.
import { MING_EXPORT, validateMingManifest, validateMingPlan, validateMingProgress } from './contract.mjs';
import { BUNDLE_REVISION, SPACE_REVISION, MAX_FRAMES, PRESET, SAMPLE_RATE, SEED, THREADS, VOICE, modelBase, runtimeRoot } from './config.mjs';

let runtime = null;
let glue = null;
let settings = null;
let restoreFetchFence = null;

function localFetchFence(allowedBases) {
  const original = self.fetch;
  const prefixes = allowedBases.map(base => base.pathname);
  self.fetch = (input, init = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, self.location.href);
    if (url.origin !== self.location.origin || !prefixes.some(prefix => url.pathname.startsWith(prefix))) {
      throw new Error('Pinned Ming runtime attempted a fetch outside the local model/runtime assets.');
    }
    return original.call(self, input, { ...init, credentials: 'same-origin' });
  };
  return () => { self.fetch = original; };
}

async function initialize(options = {}) {
  const backend = options.backend ?? 'cpu';
  const baseInfo = {
    backendRequested: backend,
    voice: `${VOICE} (built-in US English male narrator)`,
    precision: 'Fusor mix: Q4 LLM/VAE, Q7 flow/aggregator/embeddings',
    sampleRate: SAMPLE_RATE,
    settings: {
      voice: VOICE,
      preset: PRESET,
      seed: SEED,
      sampleRate: SAMPLE_RATE,
      threadCount: THREADS,
      maxFramesPerInternalFragment: MAX_FRAMES,
      quantization: 'mix: LLM and VAE decoder 4-bit; flow head, aggregator and embeddings 7-bit',
      baseModelRevision: MING_EXPORT.revision,
      modelBundleRevision: BUNDLE_REVISION,
      runtimeSpaceRevision: SPACE_REVISION,
      loadingCache: 'Revision-scoped Cache Storage supplies verified part responses to the bounded Fusor loader; the runtime checks BLAKE3 on every load.',
      textProcessing: 'Pinned upstream Ming fragmenter; benchmark source spans are passed verbatim, and a source span may become multiple internal fragments.',
    },
  };

  if (backend !== 'cpu') {
    const reason = 'The pinned Fusor browser runtime is CPU/WebAssembly only; no GPU inference path is implemented.';
    return { ...baseInfo, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
  }

  const modelUrl = modelBase(self.location.origin);
  const distUrl = runtimeRoot(self.location.origin);
  const restoreFence = localFetchFence([modelUrl, distUrl]);
  try {
    const loader = await import(new URL('host/loader.js', distUrl));
    const selectedBuild = loader.chooseBuild(THREADS, 'web-threaded-relaxed');
    if (!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined' || selectedBuild?.name !== 'web-threaded-relaxed') {
      const reason = 'This Ming CPU configuration requires six cross-origin-isolated Web Workers and the pinned relaxed-SIMD WASM build.';
      restoreFence();
      return { ...baseInfo, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
    }

    const manifestResponse = await fetchModelAsset(new URL('manifest.json', modelUrl), BUNDLE_REVISION);
    const manifestText = await manifestResponse.text();
    const manifest = JSON.parse(manifestText);
    validateMingManifest(manifest);
    const started = await loader.startRuntime({
      distUrl: distUrl.href,
      glueName: 'ming_runtime',
      threads: THREADS,
      requested: 'web-threaded-relaxed',
    });
    if (started.build.name !== 'web-threaded-relaxed' || started.threads !== THREADS) {
      throw new Error(`Ming selected ${started.build.name} with ${started.threads} thread(s); this configuration requires the pinned six-thread relaxed-SIMD build.`);
    }
    glue = started.glue;
    runtime = new glue.Runtime(manifestText);
    await loadHttpParts({
      runtime,
      manifest,
      baseUrl: modelUrl,
      fetchImpl: url => fetchModelAsset(url, BUNDLE_REVISION),
    });

    if (runtime.threads() !== THREADS) throw new Error('The model did not activate the six-thread CPU pool.');
    const voices = JSON.parse(glue.voices());
    if (voices.length !== 7 || !voices.some(v => v.id === VOICE)) throw new Error('Unexpected Fusor voice catalog.');
    settings = {
      ...baseInfo.settings,
      runtimeBuild: started.build.name,
      effectiveThreads: started.threads,
    };
    baseInfo.settings = settings;
    let description = `Pinned Fusor ${started.build.name} WebAssembly runtime initialized with ${started.threads} compute threads.`;
    if (options.probe) {
      const probeText = typeof options.probeText === 'string' && options.probeText.length
        ? options.probeText
        : 'A short browser speech check.';
      const probe = await generate({ id: 0, text: probeText });
      if (!probe.parts.length || probe.parts.some(part => !(part instanceof Float32Array) || !part.length || part.some(sample => !Number.isFinite(sample)))) {
        throw new Error('Ming CPU compatibility probe did not return finite 44.1 kHz PCM.');
      }
      description += ' A separate untimed synthesis probe returned finite PCM.';
    }
    restoreFetchFence = restoreFence;
    return {
      ...baseInfo,
      status: 'measured',
      backendEffective: 'cpu/wasm',
      capability: { gpuDispatchVerified: null, description },
    };
  } catch (error) {
    try { runtime?.cancel(); } catch {}
    runtime?.free?.();
    runtime = null;
    glue = null;
    settings = null;
    restoreFence();
    throw error;
  }
}

async function generate(chunk, onFirstPcm) {
  if (!runtime || !settings) throw new Error('Ming CPU runtime is not initialized.');
  if (!chunk || !Number.isSafeInteger(chunk.id) || chunk.id < 0 || typeof chunk.text !== 'string' || !chunk.text.trim()) {
    throw new Error('Ming requires a nonempty canonical source span with an integer ID.');
  }
  const request = {
    text: chunk.text,
    voice: { builtin: VOICE },
    preset: PRESET,
    seed: SEED,
    max_frames: MAX_FRAMES,
  };
  const plan = JSON.parse(runtime.start(JSON.stringify(request)));
  const fragmentCount = validateMingPlan(plan);
  const parts = [];
  let previous = null;
  let reportedFirst = false;
  try {
    for (;;) {
      const progress = JSON.parse(runtime.step());
      previous = validateMingProgress(progress, { fragments: fragmentCount, previous, maxFrames: MAX_FRAMES });
      const pcm = runtime.take_audio();
      if (!(pcm instanceof Float32Array)) throw new Error('Ming returned PCM in an unexpected format.');
      if (pcm.length) {
        for (const value of pcm) if (!Number.isFinite(value)) throw new Error('Ming returned non-finite PCM.');
        if (!reportedFirst) {
          reportedFirst = true;
          onFirstPcm?.();
        }
        parts.push(pcm);
      }
      if (progress.done) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    try { runtime.cancel(); } catch {}
    try { runtime.take_audio(); } catch {}
    throw error;
  }
  if (!parts.length) throw new Error('Ming completed this source span without emitting audio.');
  return { parts, sampleRate: SAMPLE_RATE, completedChunkId: chunk.id };
}

async function dispose() {
  try { runtime?.cancel(); }
  finally {
    runtime?.free?.();
    runtime = null;
    glue = null;
    settings = null;
    restoreFetchFence?.();
    restoreFetchFence = null;
  }
}

self.onmessage = async ({ data }) => {
  const { id, action } = data ?? {};
  try {
    let value;
    if (action === 'initialize') value = await initialize(data.options);
    else if (action === 'generate') value = await generate(data.chunk, () => self.postMessage({ id, event: 'first-pcm' }));
    else if (action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Ming worker action.');
    self.postMessage({ id, value }, value?.parts?.map(part => part.buffer) ?? []);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
