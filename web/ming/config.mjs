export const MODEL_ID = 'ming-3.0-tts-0.5b-fusor-mix-cpu';
export const BUNDLE_REVISION = '62588575d91dceb33822fe1e3925e748393c6b3e';
export const SPACE_REVISION = 'bdf46b41e966340f398fdd82d3ca64f4058ad892';
export const THREADS = 6;
export const SAMPLE_RATE = 44_100;
export const MAX_FRAMES = 512;
export const PRESET = 'quality';
export const SEED = 1_895;
export const VOICE = 'US_James';

export function modelBase(origin) {
  return new URL(`models/${MODEL_ID}/${BUNDLE_REVISION}/`, `${origin}/`);
}

export function runtimeRoot(origin) {
  return new URL(`runtimes/ming-fusor/${SPACE_REVISION}/engine/dist/`, `${origin}/`);
}
