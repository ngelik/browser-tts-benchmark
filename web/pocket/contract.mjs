export function validatePocketChunk(chunk) {
  if (!chunk || !Number.isSafeInteger(chunk.id) || chunk.id < 0) {
    throw new Error('Pocket TTS requires a nonnegative integer source chunk ID.');
  }
  if (!Number.isSafeInteger(chunk.start) || !Number.isSafeInteger(chunk.end) || chunk.start < 0 || chunk.end <= chunk.start) {
    throw new Error(`Pocket TTS received invalid source boundaries for chunk ${chunk?.id}.`);
  }
  if (typeof chunk.text !== 'string' || !chunk.text.trim()) {
    throw new Error(`Pocket TTS received empty or invalid source text for chunk ${chunk?.id}.`);
  }
  if (chunk.end - chunk.start !== chunk.text.length) {
    throw new Error(`Pocket TTS source boundaries do not match the complete text for chunk ${chunk.id}.`);
  }
  return chunk;
}

export function validatePocketPcm(parts, sampleRate, expectedChunkId, completedChunkId) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error(`Pocket TTS returned no PCM parts for chunk ${expectedChunkId}.`);
  }
  if (sampleRate !== 24000) {
    throw new Error(`Pocket TTS returned sample rate ${sampleRate}; expected 24000 Hz.`);
  }
  if (completedChunkId !== expectedChunkId) {
    throw new Error(`Pocket TTS completed chunk ${completedChunkId}; expected ${expectedChunkId}.`);
  }
  let samples = 0;
  for (const [partIndex, part] of parts.entries()) {
    if (!(part instanceof Float32Array) || part.length === 0) {
      throw new Error(`Pocket TTS returned an empty or invalid Float32 PCM part ${partIndex} for chunk ${expectedChunkId}.`);
    }
    for (let index = 0; index < part.length; index++) {
      if (!Number.isFinite(part[index])) {
        throw new Error(`Pocket TTS returned nonfinite PCM in part ${partIndex} for chunk ${expectedChunkId}.`);
      }
    }
    samples += part.length;
  }
  if (samples < 1) throw new Error(`Pocket TTS returned no PCM samples for chunk ${expectedChunkId}.`);
  return { parts, sampleRate, completedChunkId, samples };
}

export function assertPocketUtteranceEnded({ chunkEnded, stillGenerating, frameLimit }) {
  if (stillGenerating && !chunkEnded) {
    throw new Error(`Pocket TTS reached the ${frameLimit}-frame internal utterance limit without EOS; refusing truncated output.`);
  }
}
