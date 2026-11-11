import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFusorManifest, validateGenerationPlan } from '../web/liquid-cpu/contract.mjs';

const variant = {
  modelRepo: 'LiquidAI/LFM3-Audio-2B',
  sourceRevision: '9d49701c372d6011d900f6abb40c6b296fb706dd',
};
const digest = char => char.repeat(64);
function validManifest() {
  return {
    format: 2,
    model: { repo: variant.modelRepo, revision: variant.sourceRevision, profile: 'q7' },
    parts: [
      { file: 'config.json', bytes: 8, blake3: digest('a') },
      { file: 'tokenizer.json', bytes: 9, blake3: digest('b') },
      { file: `parts/${digest('c')}.bin`, bytes: 10, blake3: digest('c') },
    ],
  };
}

test('accepts a q7 manifest with hashed support and weight parts', () => {
  assert.equal(validateFusorManifest(validManifest(), variant), true);
});

test('rejects a support part without a 64-character BLAKE3 digest', () => {
  const manifest = validManifest();
  manifest.parts[0].blake3 = 'bad';
  assert.throws(() => validateFusorManifest(manifest, variant), /digest/);
});

test('rejects unsafe part paths and invalid byte counts', () => {
  const unsafePath = validManifest();
  unsafePath.parts[0].file = '../config.json';
  assert.throws(() => validateFusorManifest(unsafePath, variant), /unexpected part path/);

  for (const bytes of [0, -1, Number.MAX_SAFE_INTEGER + 1, '8']) {
    const invalidSize = validManifest();
    invalidSize.parts[0].bytes = bytes;
    assert.throws(() => validateFusorManifest(invalidSize, variant), /invalid digest, size/);
  }
});

test('rejects a weight filename that does not match its BLAKE3', () => {
  const manifest = validManifest();
  manifest.parts[2].file = `parts/${digest('d')}.bin`;
  assert.throws(() => validateFusorManifest(manifest, variant), /unexpected part path/);
});

test('rejects duplicate paths, missing support files and empty weight lists', () => {
  const duplicate = validManifest();
  duplicate.parts.push({ ...duplicate.parts[0] });
  assert.throws(() => validateFusorManifest(duplicate, variant), /duplicate/);
  const missingTokenizer = validManifest();
  missingTokenizer.parts.splice(1, 1);
  assert.throws(() => validateFusorManifest(missingTokenizer, variant), /missing config/);
  const noWeights = validManifest();
  noWeights.parts = noWeights.parts.slice(0, 2);
  assert.throws(() => validateFusorManifest(noWeights, variant), /missing config/);
});

test('rejects a different model, precision profile or base source revision', () => {
  for (const mutate of [
    m => { m.model.repo = 'LiquidAI/LFM3-Omni-2B'; },
    m => { m.model.profile = 'q4'; },
    m => { m.model.revision = 'a'.repeat(40); },
  ]) {
    const manifest = validManifest();
    mutate(manifest);
    assert.throws(() => validateFusorManifest(manifest, variant));
  }
});

test('accepts the full prompt plus full reply exactly at context boundary', () => {
  assert.equal(validateGenerationPlan({ prompt_tokens: 4096, max_tokens: 4096 }), true);
  assert.equal(validateGenerationPlan({ prompt_tokens: 128, max_tokens: 4096 }), true);
});

test('rejects shortened reply budgets and context overflow', () => {
  assert.throws(() => validateGenerationPlan({ prompt_tokens: 4096, max_tokens: 4095 }), /invalid or truncated/);
  assert.throws(() => validateGenerationPlan({ prompt_tokens: 4097, max_tokens: 4096 }), /context budget/);
});

test('rejects nonnumeric and noninteger plan fields', () => {
  for (const plan of [
    { prompt_tokens: '128', max_tokens: 4096 },
    { prompt_tokens: 128, max_tokens: '4096' },
    { prompt_tokens: 1.5, max_tokens: 4096 },
    { prompt_tokens: 0, max_tokens: 4096 },
    null,
  ]) assert.throws(() => validateGenerationPlan(plan));
});
