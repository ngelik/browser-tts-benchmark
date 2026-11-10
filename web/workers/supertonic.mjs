import { observeComputeDispatches, requestHardwareWebGpuAdapter } from '../piper/webgpu.mjs';
import { trimWaveToDuration } from '../supertonic/audio.mjs';
import { beginTensorScope, configureOrt, releaseOrt } from '../supertonic/ort-runtime.mjs';
import { loadTextToSpeech, loadVoiceStyle } from '../supertonic/helper.mjs';
import {
  EXECUTION_PROVIDERS,
  FRONTEND_DESCRIPTION,
  LANGUAGE,
  MODEL_ID,
  ONNX_ROOT,
  ORT_ROOT,
  OUTPUT_TRIM_DESCRIPTION,
  RANDOMNESS_DESCRIPTION,
  SAMPLE_RATE,
  SILENCE_DURATION,
  SPEED,
  TOTAL_STEP,
  VOICE,
  VOICE_STYLE_PATH,
  WASM_THREADS,
} from '../supertonic/settings.mjs';

let ortModule = null;
let textToSpeech = null;
let voiceStyle = null;
let activeExecutionProviders = [];
let restoreFetch = null;

function baseInfo() {
  return {
    voice: VOICE,
    precision: 'FP32 ONNX models and FP32 preset style',
    settings: {
      executionProviders: [...activeExecutionProviders],
      threads: WASM_THREADS,
      language: LANGUAGE,
      voiceStyle: VOICE,
      totalSteps: TOTAL_STEP,
      speed: SPEED,
      demoUiSpeedEquivalent: 1,
      silenceDurationSeconds: SILENCE_DURATION,
      sampleRate: SAMPLE_RATE,
      frontend: FRONTEND_DESCRIPTION,
      outputTrim: OUTPUT_TRIM_DESCRIPTION,
      randomSeed: RANDOMNESS_DESCRIPTION,
      outputLocation: 'ONNX Runtime Web default CPU output; every session.run is awaited before the helper reads output .data.',
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
  globalThis.fetch = async (input, init) => {
    const requested = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(requested, self.location.href);
    if (url.origin !== self.location.origin) throw new Error(`Supertonic attempted a non-local fetch: ${url.origin}`);
    return nativeFetch(input, init);
  };
  restoreFetch = () => { globalThis.fetch = nativeFetch; };
}

async function synthesize(text) {
  if (!textToSpeech || !voiceStyle) throw new Error('Supertonic has not been initialized.');
  const scope = beginTensorScope();
  try {
    const result = await textToSpeech.call(text, LANGUAGE, voiceStyle, TOTAL_STEP, SPEED, SILENCE_DURATION);
    if (!Array.isArray(result?.wav) || !Array.isArray(result?.duration) || result.duration.length !== 1) {
      throw new Error('Official Supertonic helper returned an invalid waveform result.');
    }
    // Match the official web demo, which trims padded model output to the predicted duration.
    const pcm = trimWaveToDuration(result.wav, result.duration[0], SAMPLE_RATE);
    if (pcm.length < 1) throw new Error('Supertonic returned empty PCM.');
    return pcm;
  } finally {
    scope.dispose();
  }
}

async function initialize({ backend, probe, probeText }) {
  activeExecutionProviders = EXECUTION_PROVIDERS[backend] ? [...EXECUTION_PROVIDERS[backend]] : [];
  if (!activeExecutionProviders.length) return unsupported('Unsupported Supertonic backend.');

  let selectedAdapter = null;
  let selectedAdapterInfo = null;
  let gpu = null;
  if (backend === 'webgpu') {
    const selection = await requestHardwareWebGpuAdapter(globalThis.navigator?.gpu);
    if (selection.reason) return unsupported(selection.reason);
    selectedAdapter = selection.adapter;
    selectedAdapterInfo = selection.info;
    gpu = selection.description;
  }

  installLocalFetch();
  try {
    const bundle = backend === 'cpu' ? 'ort.wasm.min.mjs' : 'ort.webgpu.min.mjs';
    ortModule = await import(ORT_ROOT + bundle);
    ortModule.env.logLevel = 'error';
    ortModule.env.wasm.numThreads = WASM_THREADS;
    ortModule.env.wasm.proxy = false;
    const wasmBundle = backend === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
    ortModule.env.wasm.wasmPaths = {
      mjs: ORT_ROOT + wasmBundle + '.mjs',
      wasm: ORT_ROOT + wasmBundle + '.wasm',
    };
    if (backend === 'webgpu') ortModule.env.webgpu.adapter = selectedAdapter;
    configureOrt(ortModule);

    // ONNX Runtime Web documents CPU as the default output location; keep identical options across providers and await each run before helper output reads.
    const loaded = await loadTextToSpeech(ONNX_ROOT, {
      executionProviders: activeExecutionProviders,
      graphOptimizationLevel: 'all',
    });
    if (loaded.cfgs?.ae?.sample_rate !== SAMPLE_RATE) {
      throw new Error(`Pinned Supertonic config sample rate was ${loaded.cfgs?.ae?.sample_rate}; expected ${SAMPLE_RATE}.`);
    }
    textToSpeech = loaded.textToSpeech;
    voiceStyle = await loadVoiceStyle([VOICE_STYLE_PATH]);

    if (backend === 'webgpu') {
      const actualDevice = await ortModule.env.webgpu.device;
      const actualAdapter = await ortModule.env.webgpu.adapter;
      const actualInfo = actualDevice?.adapterInfo ?? actualAdapter?.info ?? selectedAdapterInfo;
      if (actualAdapter?.isFallbackAdapter === true || actualInfo?.isFallbackAdapter === true) {
        return unsupported('ONNX Runtime selected a software fallback WebGPU adapter.');
      }
      gpu = actualInfo?.description || actualInfo?.vendor || gpu;
    }

    let capability = backend === 'cpu'
      ? { gpuDispatchVerified: null, description: 'Explicit one-thread ONNX Runtime Web WASM provider; model text processing runs in the Chrome worker.' }
      : { gpuDispatchVerified: false, description: 'WebGPU + WASM operator fallback configured; actual dispatch probe was not requested.' };
    if (probe) {
      const hooks = backend === 'webgpu' ? observeComputeDispatches(self) : null;
      let dispatches = 0;
      try {
        const pcm = await synthesize(probeText || 'A short browser speech check.');
        if (pcm.length < 1 || !pcm.every(Number.isFinite)) throw new Error('Supertonic capability synthesis returned empty or nonfinite PCM.');
      } finally {
        dispatches = hooks?.stop() ?? 0;
      }
      if (backend === 'webgpu') {
        if (dispatches === 0) return unsupported('No actual WebGPU compute dispatch was observed during Supertonic synthesis.');
        capability = {
          gpuDispatchVerified: true,
          description: `Observed ${dispatches} WebGPU compute dispatches in a separate untimed synthesis. WebGPU + WASM operator fallback; CPU text processing. Hooks were removed before timed generation.`,
        };
      }
    }

    return {
      ...baseInfo(),
      status: 'measured',
      backendEffective: backend === 'cpu' ? 'cpu/wasm' : 'webgpu+wasm',
      capability,
      ...(backend === 'webgpu' ? { gpu } : {}),
    };
  } catch (error) {
    try { await dispose(); }
    catch (cleanupError) {
      throw new Error(`Supertonic initialization failed: ${String(error?.message ?? error)}; cleanup failed: ${String(cleanupError?.message ?? cleanupError)}`);
    }
    throw error;
  }
}

async function dispose() {
  textToSpeech = null;
  voiceStyle = null;
  restoreFetch?.();
  restoreFetch = null;
  const currentRuntime = ortModule;
  ortModule = null;
  activeExecutionProviders = [];
  if (currentRuntime) await releaseOrt();
}

self.onmessage = async ({ data }) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') {
      const pcm = await synthesize(data.chunk.text);
      value = { parts: [pcm], sampleRate: SAMPLE_RATE, completedChunkId: data.chunk.id };
    } else if (data.action === 'dispose') { await dispose(); value = null; }
    else throw new Error('Unknown Supertonic worker action.');
    const buffers = value?.parts?.map(part => part.buffer) ?? [];
    self.postMessage({ id: data.id, value }, buffers);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
};
