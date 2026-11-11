const ONE_SECOND = 1;

function shortestSubsecond(records) {
  if (!Array.isArray(records)) return null;
  const candidates = records.flatMap((record, index) => {
    const samples = record?.metrics?.minSamplesPerChunk;
    const sampleRate = record?.sampleRate;
    if (!Number.isSafeInteger(samples) || samples < 0 || !Number.isSafeInteger(sampleRate) || sampleRate <= 0) return [];
    const seconds = samples / sampleRate;
    if (seconds >= ONE_SECOND) return [];
    return [{ samples, sampleRate, seconds, index: Number.isInteger(record.index) ? record.index : index + 1 }];
  });
  candidates.sort((a, b) => a.seconds - b.seconds || a.index - b.index);
  return candidates[0] ?? null;
}

function formatNote(kind, observation) {
  const roundedSeconds = Number(observation.seconds.toFixed(2));
  const seconds = roundedSeconds >= ONE_SECOND ? '<1.00' : roundedSeconds.toFixed(2);
  const samples = observation.samples.toLocaleString('en-US');
  const rate = observation.sampleRate.toLocaleString('en-US');
  if (kind === 'scored') {
    return `The shortest source-chunk output in scored trial ${observation.index} was ${seconds} s (${samples} samples at ${rate} Hz). Check audio; this is an output-length observation only, not a diagnosis of truncation or transcript fidelity.`;
  }
  return `The excluded warm-up's shortest source-chunk output was ${seconds} s (warm-up ${observation.index}; ${samples} samples at ${rate} Hz). It is not part of the scored trials and is an output-length observation only, not a diagnosis of truncation or transcript fidelity.`;
}

/** Derive sub-second output notes only from a measured cell's recorded trial metrics. */
export function outputLengthNotes(cell) {
  if (cell?.status !== 'measured') return null;
  const scored = shortestSubsecond(cell.trials);
  const warmup = shortestSubsecond(cell.warmup);
  if (!scored && !warmup) return null;
  return {
    scored: scored ? { ...scored, text: formatNote('scored', scored) } : null,
    warmup: warmup ? { ...warmup, text: formatNote('warmup', warmup) } : null,
  };
}
