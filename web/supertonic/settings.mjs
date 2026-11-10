export const MODEL_ID = 'supertonic-3';
export const MODEL_REVISION = '3cadd1ee6394adea1bd021217a0e650ede09a323';
export const MODEL_ROOT = `/models/${MODEL_ID}/${MODEL_REVISION}/`;
export const ONNX_ROOT = `${MODEL_ROOT}onnx`;
export const VOICE_STYLE_PATH = `${MODEL_ROOT}voice_styles/M3.json`;
export const ORT_ROOT = '/runtimes/onnxruntime-web/1.23.2/';

export const VOICE = 'M3 (Robert)';
export const LANGUAGE = 'en';
export const TOTAL_STEP = 8;
export const SPEED = 1.05;
export const SILENCE_DURATION = 0.3;
export const SAMPLE_RATE = 44100;
export const WASM_THREADS = 1;
export const INNER_CHUNK_LIMIT = 300;

export const EXECUTION_PROVIDERS = Object.freeze({
  cpu: Object.freeze(['wasm']),
  webgpu: Object.freeze(['webgpu', 'wasm']),
});

export const FRONTEND_DESCRIPTION = 'Official Supertonic browser helper: NFKD normalization, emoji/symbol cleanup, whitespace compaction, terminal punctuation and <en> tags. It splits each source span at paragraph/sentence boundaries (max 300 characters); the 93-span canonical fixture yields 111 internal utterances and 18 intra-span 0.3-second silences.';
export const OUTPUT_TRIM_DESCRIPTION = 'Matches the official browser demo: trim waveform to floor(sampleRate × predicted duration) before returning Float32 PCM.';
export const RANDOMNESS_DESCRIPTION = 'The official helper samples Box-Muller latent noise with Math.random; it exposes no validated seed input.';
