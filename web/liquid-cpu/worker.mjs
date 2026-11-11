// Thin benchmark adapter around the pinned Fusor browser runtime. The loader, runtime glue and
// WASM stay in the ignored staged asset cache; no model/runtime source is copied into this repo.
import { validateFusorManifest, validateGenerationPlan } from './contract.mjs';

const SPACE_REVISION = '572fc51e58808d3536bc8a8bea9d74a11b4b88bc';
const SPEECH_SYSTEM = 'Perform TTS in American English using a female voice.';
const VARIANTS = {
  audio: {
    bundleRevision: 'e273326dda2bb26870549ed7b39324ae086e5fe7',
    modelRepo: 'LiquidAI/LFM3-Audio-2B',
    sourceRevision: '9d49701c372d6011d900f6abb40c6b296fb706dd',
    speechSampling: { temperature: 1, topK: 128, repetitionPenalty: 1.1, window: 4096 },
  },
  omni: {
    bundleRevision: '09f4fc6ddbbb3cc6cd30f74b1e76cc894f4901f4',
    modelRepo: 'LiquidAI/LFM3-Omni-2B',
    // This source revision is read from the pinned q7 manifest.
    sourceRevision: 'ce2458cbce4ad970f92032ed94e3d18d30b04f9c',
    speechSampling: { temperature: 0.4, topK: null, repetitionPenalty: 1.2, window: 64 },
  },
};
const SAMPLE_RATE = 24000;
const MAX_REPLY_ROWS = 4096;
const CPU_THREADS = 6;
let runtime = null;
let hostWorker = null;
let kind = null;
let settings = null;
let restoreFetchFence = null;

function resourceBase(path) {
  return new URL(path, self.location.origin + '/');
}

function localFetchFence(modelBase, distBase) {
  const original = self.fetch;
  const prefixes = [modelBase.pathname, distBase.pathname];
  self.fetch = (input, init = {}) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, self.location.href);
    if (url.origin !== self.location.origin || !prefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      throw new Error('Fusor CPU runtime attempted a fetch outside its pinned same-origin assets.');
    }
    return original.call(self, input, { ...init, credentials: 'same-origin' });
  };
  return () => { self.fetch = original; };
}

function variantSettings(selectedKind, variant) {
  const sampling = variant.speechSampling;
  return {
    voice: 'American English female (prompted style; no fixed speaker ID)',
    sampleRate: SAMPLE_RATE,
    precision: 'Fusor q7 CPU bundle; six-thread WebAssembly (upstream relaxed-SIMD build when supported)',
    executionProviders: ['cpu-wasm-threads'],
    requestedThreads: CPU_THREADS,
    systemPrompt: SPEECH_SYSTEM,
    frontend: 'Pinned official LFM3 chat template; canonical source span passed verbatim; reset before every span.',
    textSampling: 'Official Audio/Omni greedy text defaults (temperature 0, top-p 1, top-k 1, presence penalty 0).',
    speechSampling: `Pinned variant defaults: temperature ${sampling.temperature}, top-k ${sampling.topK ?? 'all'}, repetition penalty ${sampling.repetitionPenalty}, recent-frame window ${sampling.window}. Benchmark seed 0 per source span overrides the upstream browser random seed.`,
    maxReplyRows: MAX_REPLY_ROWS,
    runtime: `Fusor browser runtime from Space ${SPACE_REVISION}; ${selectedKind} q7 bundle ${variant.bundleRevision}.`,
    hostWork: 'CPU JavaScript scheduling and 24 kHz PCM transfer; neural inference and codec are in six-thread WebAssembly with upstream relaxed-SIMD selection.',
    streaming: 'Official 24 kHz PCM drained from Runtime.speech() after every step, including the final EOS/finalize step.',
  };
}

async function initialize(options) {
  kind = options.kind;
  const variant = VARIANTS[kind];
  if (!variant) throw new Error('Unknown Liquid CPU model variant.');
  settings = variantSettings(kind, variant);
  const baseInfo = {
    voice: 'American English female (prompted style; no fixed speaker ID)',
    precision: 'q7 weights; six-thread WebAssembly (upstream relaxed-SIMD build when supported)',
    settings,
    sampleRate: SAMPLE_RATE,
    backendRequested: options.backend,
  };
  if (options.backend !== 'cpu') {
    const reason = 'This q7 Fusor configuration is the CPU/WASM baseline; GPU uses a separate GGUF configuration.';
    return { ...baseInfo, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
  }

  if (self.crossOriginIsolated !== true || typeof SharedArrayBuffer === 'undefined') {
    const reason = 'The pinned six-thread CPU configuration requires a cross-origin isolated Chrome worker with SharedArrayBuffer.';
    return { ...baseInfo, status: 'unsupported', reason, backendEffective: 'none', capability: { gpuDispatchVerified: false, description: reason } };
  }

  const modelBase = resourceBase(`liquid-cpu/${kind}/${variant.bundleRevision}/model/`);
  const runtimeRoot = resourceBase(`liquid-cpu/runtime/${SPACE_REVISION}/engine/dist/`);
  const restoreFetch = localFetchFence(modelBase, runtimeRoot);
  try {
    // Both helpers are the exact upstream Space/Fusor browser host modules, staged locally by
    // immutable revision. The official loader performs BLAKE3 verification for every model part.
    hostWorker = await import(new URL('host/worker.js', runtimeRoot));
    const loader = await import(new URL('host/loader.js', runtimeRoot));
    const response = await fetch(new URL('manifest.json', modelBase));
    if (!response.ok) throw new Error(`Pinned Fusor manifest returned HTTP ${response.status}.`);
    const manifestText = await response.text();
    const manifest = JSON.parse(manifestText);
    validateFusorManifest(manifest, variant);
    const started = await loader.startRuntime({
      distUrl: runtimeRoot,
      glueName: 'lfm3_runtime',
      threads: CPU_THREADS,
      // Omit `requested`: the upstream loader selects relaxed SIMD when available, as its demo does.
    });
    if (!started.build.threads || started.threads !== CPU_THREADS) {
      throw new Error(`Fusor selected ${started.build.name} with ${started.threads} thread(s); the six-thread protocol forbids fallback.`);
    }
    runtime = new started.glue.Runtime(manifestText);
    await loader.loadParts({ runtime, manifest, baseUrl: modelBase, cacheName: `lfm3-${kind}-q7-threads-${CPU_THREADS}` });
    settings = { ...settings, runtimeBuild: started.build.name, effectiveThreads: started.threads };
    baseInfo.settings = settings;
    baseInfo.runtimeBuild = started.build.name;
    baseInfo.threads = started.threads;
    let description = `Explicit Fusor ${started.build.name} CPU runtime with ${started.threads} threads; untimed synthesis probe was not requested.`;
    if (options.probe) {
      const probe = await generate({ id: 0, text: options.probeText || 'A short browser speech check.' });
      if (!probe.parts.length || probe.parts.some((part) => !(part instanceof Float32Array) || !part.length)) {
        throw new Error('Fusor CPU compatibility probe did not return finite PCM.');
      }
      description = `Explicit Fusor ${started.build.name} CPU runtime with ${started.threads} threads; separate untimed probe returned finite 24 kHz PCM. Probe excluded from timed synthesis.`;
    }
    restoreFetchFence = restoreFetch;
    return {
      ...baseInfo,
      status: 'measured',
      backendEffective: 'cpu/wasm',
      runtimeBuild: started.build.name,
      threads: started.threads,
      capability: { gpuDispatchVerified: null, description },
    };
  } catch (error) {
    restoreFetch();
    runtime?.free?.();
    runtime = null;
    hostWorker = null;
    throw error;
  }
}

function readPcm() {
  const pcm = runtime.speech();
  if (!(pcm instanceof Float32Array)) throw new Error('Fusor returned PCM in an unexpected format.');
  if (!pcm.length) return null;
  for (const value of pcm) if (!Number.isFinite(value)) throw new Error('Fusor returned non-finite PCM.');
  return pcm.slice();
}

async function generate(chunk, onFirstPcm) {
  if (!runtime || !hostWorker || !settings) throw new Error('Liquid CPU runtime is not initialized.');
  if (!chunk || chunk.id === undefined || chunk.id === null || typeof chunk.text !== 'string' || !chunk.text.trim()) {
    throw new Error('Liquid requires a nonempty canonical source span.');
  }
  await runtime.reset();
  const message = {
    text: chunk.text,
    system: SPEECH_SYSTEM,
    mode: 'speech',
    thinking: false,
    max_tokens: MAX_REPLY_ROWS,
    seed: 0,
  };
  const plan = JSON.parse(runtime.start(JSON.stringify(message), new Uint8Array(), new Float32Array(), JSON.stringify({ images: [], clips: [] })));
  validateGenerationPlan(plan, { maxReplyRows: MAX_REPLY_ROWS, maxContextRows: 8192 });
  const parts = [];
  let rows = 0;
  let reportedFirst = false;
  for (;;) {
    // A macrotask yield is required: it preserves the official worker's responsiveness and lets
    // the RPC bridge record first PCM without moving synthesis off the benchmark timer.
    await hostWorker.yieldTask();
    const progress = JSON.parse(runtime.step());
    rows += 1; // With empty images/clips, each official step emits one reply token or audio frame.
    const pcm = readPcm();
    if (pcm) {
      if (!reportedFirst) {
        reportedFirst = true;
        onFirstPcm?.();
      }
      parts.push(pcm);
    }
    if (progress.done) {
      if (rows >= plan.max_tokens) throw new Error('Fusor ended at the reply-row cap; possible truncation is rejected.');
      break;
    }
    if (rows >= plan.max_tokens) throw new Error('Fusor exceeded its reply-row budget.');
  }
  if (!parts.length) throw new Error('Fusor completed without spoken PCM.');
  return { parts, sampleRate: SAMPLE_RATE, completedChunkId: chunk.id };
}

async function dispose() {
  try { await runtime?.reset(); }
  finally {
    runtime?.free?.();
    runtime = null;
    hostWorker = null;
    settings = null;
    restoreFetchFence?.();
    restoreFetchFence = null;
  }
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk, () => self.postMessage({ id: data.id, event: 'first-pcm' }));
    else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Liquid CPU action.');
    self.postMessage({ id: data.id, value }, value?.parts?.map((part) => part.buffer) ?? []);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};
