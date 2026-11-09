import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePiperConfig, strictPhonemeIdMap, validatePiperConfig } from '../web/piper/config.mjs';

function config(overrides = {}) {
  return {
    espeak: { voice: 'en-gb-x-rp' },
    num_speakers: 1,
    audio: { sample_rate: 16000 },
    phoneme_id_map: { '^': [1], '_': [0], '$': [2], a: [3] },
    ...overrides,
  };
}

test('Piper config preserves expected voice, speaker, sample rate and scalar IDs', () => {
  const value = config();
  assert.equal(validatePiperConfig(value), value);
  assert.equal('a' in strictPhonemeIdMap(value.phoneme_id_map), true);
});

test('legacy Piper config defaults missing phoneme_type to eSpeak without mutating source bytes', () => {
  const value = config();
  const normalized = normalizePiperConfig(value);
  assert.equal(value.phoneme_type, undefined);
  assert.equal(normalized.phoneme_type, 'espeak');
  assert.notEqual(normalized, value);
});

test('Piper config rejects unsupported voice, speaker, sample rate and ID shapes', () => {
  assert.throws(() => validatePiperConfig(config({ espeak: { voice: 'en-us' } })), /unexpected eSpeak voice/);
  assert.throws(() => validatePiperConfig(config({ phoneme_type: 'text' })), /must use eSpeak phonemes/);
  assert.throws(() => validatePiperConfig(config({ num_speakers: 2 })), /single-speaker/);
  assert.throws(() => validatePiperConfig(config({ audio: { sample_rate: 22050 } })), /16 kHz/);
  assert.throws(() => validatePiperConfig(config({ phoneme_id_map: { '^': [1], '_': [0], '$': [2], a: [3, 4] } })), /unsupported phoneme ID/);
});

test('Piper unknown phonemes throw instead of silently disappearing', () => {
  const idMap = strictPhonemeIdMap(config().phoneme_id_map);
  assert.throws(() => 'ɯ' in idMap, /unmapped phoneme/);
});
