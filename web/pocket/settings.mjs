export const MODEL_ID = 'pocket-tts-100m-english-int8';
export const MODEL_REVISION = '58a6d00cf13d239b6748cb0769f35c580a8f606c';
export const SPACE_REVISION = 'd0c0c79b7712256a32d691c67f20b8ae2e020d00';
export const MODEL_ROOT = `/models/pocket-tts/${MODEL_REVISION}/`;
export const ONNX_ROOT = `${MODEL_ROOT}onnx/`;
export const TOKENIZER_JSON_URL = `${MODEL_ROOT}tokenizer.json`;
export const TRANSFORMERS_ROOT = '/runtimes/transformers/3.5.1/';
export const ORT_ROOT = '/runtimes/onnxruntime-web/1.31.1/';

export const BUNDLE = 'english_2026-04';
export const LANGUAGE = 'en';
export const VOICE = 'alba';
export const SAMPLE_RATE = 24000;
export const LATENT_TEMPERATURE = 0.7;
export const WASM_THREADS = 1;
export const MAX_FRAMES_PER_INTERNAL_UTTERANCE = 500;
export const CHUNK_GAP_SECONDS = 0.25;
export const EOS_LOGIT_THRESHOLD = -4;
export const LSD_STEPS = 1;

export const EXECUTION_PROVIDERS = Object.freeze({
  cpu: Object.freeze(['wasm']),
  webgpu: Object.freeze(['webgpu', 'wasm']),
});

export const FRONTEND_DESCRIPTION =
  'Pinned KevinAHM Pocket TTS browser frontend: whitespace/newline normalization, optional semicolon cleanup, initial capitalization and terminal punctuation; pinned SentencePiece Unigram tokenizer, browser-loaded from a hash-locked local JSON conversion audited against the original tokenizer.model. Sentence splitting uses a 50-token internal limit. The 93 canonical spans are passed intact to the frontend.';
export const GENERATION_DESCRIPTION =
  'One latent flow step, temperature 0.7 with unseeded Math.random noise, EOS logit threshold -4 and the pinned frontend frames-after-EOS rule; independent Flow/MIMI state is reset between internal utterances. Output is 24 kHz Float32 PCM with 0.25-second silence between internal utterances. A 500-frame guard is treated as an error, never silent truncation.';
export const VOICE_DESCRIPTION =
  'Pinned built-in English voice alba from the selected English bundle; the other seven bundled voices are not used in this configuration.';
