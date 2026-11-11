import test from 'node:test';
import assert from 'node:assert/strict';
import { outputLengthNotes } from '../tools/output-notes.mjs';

const sample = (index, minSamplesPerChunk, sampleRate = 24_000) => ({
  index,
  sampleRate,
  metrics: { minSamplesPerChunk },
});

test('missing per-chunk metrics do not create an output note', () => {
  assert.equal(outputLengthNotes({ status: 'measured', trials: [{}], warmup: [] }), null);
  assert.equal(outputLengthNotes({ status: 'measured', trials: [sample(1, 1200, 0)], warmup: [] }), null);
  assert.equal(outputLengthNotes({ status: 'measured', trials: [], warmup: [] }), null);
});

test('fractional, negative and non-finite sample evidence is ignored', () => {
  const invalid = [
    sample(1, 1.5), sample(1, -1), sample(1, Number.NaN), sample(1, Number.POSITIVE_INFINITY),
    sample(1, 1200, 24_000.5), sample(1, 1200, -24_000), sample(1, 1200, Number.NaN),
    sample(1, 1200, Number.POSITIVE_INFINITY),
  ];
  assert.equal(outputLengthNotes({ status: 'measured', trials: invalid, warmup: [] }), null);
});

test('an explicitly recorded zero sample count remains factual warning evidence', () => {
  const notes = outputLengthNotes({ status: 'measured', trials: [sample(1, 0)], warmup: [] });
  assert.equal(notes.scored.seconds, 0);
  assert.match(notes.scored.text, /0\.00 s \(0 samples at 24,000 Hz\)/);
});

test('normal one-second-or-longer outputs do not create a warning', () => {
  assert.equal(outputLengthNotes({
    status: 'measured',
    trials: [sample(1, 24_000), sample(2, 31_200)],
    warmup: [sample(1, 24_000)],
  }), null);
});

test('near-threshold sub-second output remains visibly below one second', () => {
  const notes = outputLengthNotes({ status: 'measured', trials: [sample(1, 23_999)], warmup: [] });
  assert.equal(notes.scored.seconds, 23_999 / 24_000);
  assert.match(notes.scored.text, /was <1\.00 s \(23,999 samples at 24,000 Hz\)/);
  assert.doesNotMatch(notes.scored.text, /0\.999999/);
});

test('sub-second scored output is reported with its minimum, trial and sample rate', () => {
  const notes = outputLengthNotes({
    status: 'measured',
    trials: [sample(1, 22_800), sample(5, 21_120)],
    warmup: [sample(1, 15_360)],
  });
  assert.equal(notes.scored.seconds, 0.88);
  assert.equal(notes.scored.samples, 21_120);
  assert.equal(notes.scored.index, 5);
  assert.match(notes.scored.text, /shortest source-chunk output in scored trial 5 was 0\.88 s \(21,120 samples at 24,000 Hz\)/);
  assert.match(notes.scored.text, /not a diagnosis of truncation or transcript fidelity/);
  assert.equal(notes.warmup.seconds, 0.64);
});

test('excluded warm-up short output is separate from normal scored outputs', () => {
  const notes = outputLengthNotes({
    status: 'measured',
    trials: [sample(1, 24_000), sample(5, 26_000)],
    warmup: [sample(1, 15_360)],
  });
  assert.equal(notes.scored, null);
  assert.equal(notes.warmup.seconds, 0.64);
  assert.match(notes.warmup.text, /excluded warm-up/i);
  assert.match(notes.warmup.text, /not part of the scored trials/);
});

test('error-status cells do not turn partial output into measured warnings', () => {
  assert.equal(outputLengthNotes({
    status: 'error',
    trials: [sample(5, 21_120)],
    warmup: [sample(1, 15_360)],
  }), null);
});
