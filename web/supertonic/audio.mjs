export function trimWaveToDuration(wave, durationSeconds, sampleRate) {
  if (!Array.isArray(wave) && !ArrayBuffer.isView(wave)) throw new Error('Supertonic waveform must be an array.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Supertonic duration must be positive and finite.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Supertonic sample rate is invalid.');
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  if (sampleCount < 1) throw new Error('Supertonic predicted audio duration is shorter than one sample.');
  return Float32Array.from(wave.slice(0, sampleCount));
}
