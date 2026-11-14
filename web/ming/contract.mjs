/** Strict checks around the pinned browser bundle and per-source-span runtime contract. */
export const MING_EXPORT = Object.freeze({
  repo: 'inclusionAI/Ming-3.0-tts-0.5B',
  revision: 'e5bd8da31ecf1b9276cdbdda821fa891068f1368',
  profile: 'mix',
  partCount: 16,
  totalBytes: 850_027_293,
});

const digest64 = /^[0-9a-f]{64}$/;
const partPattern = /^parts\/(?:00[0-9]|01[0-4])\.bin$/;

export function validateMingManifest(manifest) {
  if (manifest?.format !== 1 || manifest?.model?.repo !== MING_EXPORT.repo ||
      manifest?.model?.revision !== MING_EXPORT.revision || manifest?.model?.profile !== MING_EXPORT.profile) {
    throw new Error('The staged Ming bundle does not match the pinned mix export and source checkpoint.');
  }
  if (!Array.isArray(manifest.parts) || manifest.parts.length !== MING_EXPORT.partCount) {
    throw new Error('The staged Ming manifest must contain the pinned 15 weight parts and tokenizer.');
  }
  const seen = new Set();
  let total = 0;
  for (const part of manifest.parts) {
    if (typeof part?.file !== 'string' || seen.has(part.file) ||
        !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || !digest64.test(part.blake3 ?? '')) {
      throw new Error('The Ming manifest contains a duplicate path or invalid size/digest.');
    }
    if (!(partPattern.test(part.file) || part.file === 'tokenizer.json')) {
      throw new Error('The Ming manifest contains an unexpected bundle path.');
    }
    seen.add(part.file);
    total += part.bytes;
  }
  for (let index = 0; index < 15; index++) {
    if (!seen.has(`parts/${String(index).padStart(3, '0')}.bin`)) {
      throw new Error('The Ming manifest is missing a pinned model weight part.');
    }
  }
  if (!seen.has('tokenizer.json') || total !== MING_EXPORT.totalBytes) {
    throw new Error('The Ming manifest is missing its tokenizer or has an unexpected total size.');
  }
  return true;
}

export function validateMingPlan(plan) {
  if (!Array.isArray(plan?.fragments) || plan.fragments.length < 1 ||
      plan.fragments.some(text => typeof text !== 'string' || !text.trim())) {
    throw new Error('Ming did not produce a valid nonempty fragment plan for this source span.');
  }
  return plan.fragments.length;
}

export function validateMingProgress(progress, { fragments, previous = null, maxFrames }) {
  if (!Number.isSafeInteger(progress?.fragment) || progress.fragment < 0 || progress.fragment >= fragments ||
      progress.fragments !== fragments || !Number.isSafeInteger(progress.frame) || progress.frame < 0 ||
      progress.frame >= maxFrames || typeof progress.done !== 'boolean') {
    throw new Error('Ming returned invalid or over-budget frame progress.');
  }
  if (previous) {
    const sameFragment = progress.fragment === previous.fragment;
    if ((!sameFragment && progress.fragment !== previous.fragment + 1) ||
        (sameFragment && progress.frame !== previous.frame + 1) ||
        (!sameFragment && progress.frame !== 0) || previous.done) {
      throw new Error('Ming skipped, repeated or reordered a synthesis frame.');
    }
  } else if (progress.fragment !== 0 || progress.frame !== 0) {
    throw new Error('Ming synthesis did not begin at the first frame.');
  }
  if (progress.done && progress.fragment !== fragments - 1) {
    throw new Error('Ming ended before all planned fragments were synthesized.');
  }
  if (progress.frame + 1 >= maxFrames) {
    throw new Error('Ming reached the frame budget; possible truncated audio is rejected.');
  }
  return { fragment: progress.fragment, frame: progress.frame, done: progress.done };
}
