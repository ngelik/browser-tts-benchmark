import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginPocketGenerationScope,
  clearPocketWorkerState,
  releasePocketResources,
  releasePocketTensor,
  trackPocketTensor,
} from '../web/pocket/upstream-worker.mjs';

function fakeTensor() {
  return { disposeCalls: 0, dispose() { this.disposeCalls++; } };
}

test('Pocket per-generation tensor scope disposes remaining temporary tensors once', () => {
  const scope = beginPocketGenerationScope();
  const tensor = fakeTensor();
  trackPocketTensor(tensor);
  scope.dispose();
  scope.dispose();
  assert.equal(tensor.disposeCalls, 1);
});

test('Pocket explicit intermediate release removes tensors from scope cleanup', () => {
  const scope = beginPocketGenerationScope();
  const tensor = fakeTensor();
  trackPocketTensor(tensor);
  releasePocketTensor(tensor);
  scope.dispose();
  assert.equal(tensor.disposeCalls, 1);
});

test('Pocket persistent preset tensors are released during worker teardown', async () => {
  const tensor = fakeTensor();
  trackPocketTensor(tensor);
  await releasePocketResources();
  clearPocketWorkerState();
  assert.equal(tensor.disposeCalls, 1);
});

test('Pocket generation tensor scopes reject accidental nesting', () => {
  const scope = beginPocketGenerationScope();
  assert.throws(() => beginPocketGenerationScope(), /Nested Pocket TTS tensor scopes/);
  scope.dispose();
});
