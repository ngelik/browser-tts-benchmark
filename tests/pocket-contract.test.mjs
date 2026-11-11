import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPocketUtteranceEnded,
  validatePocketChunk,
  validatePocketPcm,
} from '../web/pocket/contract.mjs';
import {
  BUNDLE,
  EXECUTION_PROVIDERS,
  LANGUAGE,
  SAMPLE_RATE,
  VOICE,
} from '../web/pocket/settings.mjs';

test('Pocket TTS pins the English April bundle and one selected bundled voice', () => {
  assert.equal(BUNDLE, 'english_2026-04');
  assert.equal(LANGUAGE, 'en');
  assert.equal(VOICE, 'alba');
  assert.equal(SAMPLE_RATE, 24000);
});

test('CPU and WebGPU differ only in the explicit provider list', () => {
  assert.deepEqual(EXECUTION_PROVIDERS.cpu, ['wasm']);
  assert.deepEqual(EXECUTION_PROVIDERS.webgpu, ['webgpu', 'wasm']);
});

test('Pocket TTS accepts a full canonical source span and rejects boundary or text loss', () => {
  const source = { id: 7, start: 15, end: 28, text: 'Hello, world!' };
  assert.equal(validatePocketChunk(source), source);
  assert.throws(() => validatePocketChunk({ ...source, id: '7' }), /integer source chunk ID/);
  assert.throws(() => validatePocketChunk({ ...source, end: source.end - 1 }), /boundaries do not match/);
  assert.throws(() => validatePocketChunk({ ...source, text: '  ' }), /empty or invalid/);
});

test('Pocket TTS requires complete finite 24 kHz PCM for the requested chunk', () => {
  const parts = [new Float32Array([0.1, -0.2]), new Float32Array([0.3])];
  assert.equal(validatePocketPcm(parts, 24000, 3, 3).samples, 3);
  assert.throws(() => validatePocketPcm([], 24000, 3, 3), /no PCM parts/);
  assert.throws(() => validatePocketPcm([new Float32Array([0.1])], 22050, 3, 3), /expected 24000/);
  assert.throws(() => validatePocketPcm([new Float32Array([NaN])], 24000, 3, 3), /nonfinite PCM/);
  assert.throws(() => validatePocketPcm(parts, 24000, 3, 4), /completed chunk 4; expected 3/);
});

test('Pocket TTS rejects the pinned worker frame cap instead of returning a partial utterance', () => {
  assert.doesNotThrow(() => assertPocketUtteranceEnded({ chunkEnded: true, stillGenerating: true, frameLimit: 500 }));
  assert.doesNotThrow(() => assertPocketUtteranceEnded({ chunkEnded: false, stillGenerating: false, frameLimit: 500 }));
  assert.throws(() => assertPocketUtteranceEnded({ chunkEnded: false, stillGenerating: true, frameLimit: 500 }), /500-frame.*without EOS/);
});
