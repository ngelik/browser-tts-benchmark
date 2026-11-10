import test from 'node:test';
import assert from 'node:assert/strict';
import { beginTensorScope, configureOrt, ort, releaseOrt } from '../web/supertonic/ort-runtime.mjs';

function fakeRuntime() {
  const createdSessions = [];
  class Tensor {
    constructor(type, data, dims) {
      this.type = type;
      this.data = data;
      this.dims = dims;
      this.disposeCount = 0;
    }
    dispose() { this.disposeCount++; }
  }
  class InferenceSession {
    static async create(_model, options) {
      const session = new this();
      session.options = options;
      createdSessions.push(session);
      return session;
    }
    async run() {
      return { audio: new Tensor('float32', Float32Array.of(0.5), [1]) };
    }
    async release() { this.releaseCount = (this.releaseCount ?? 0) + 1; }
  }
  return { module: { Tensor, InferenceSession, env: {} }, createdSessions };
}

test('Supertonic runtime disposes per-chunk tensors on success and failure, preserves style, then releases sessions', async () => {
  await releaseOrt();
  const firstRuntime = fakeRuntime();
  configureOrt(firstRuntime.module);
  try {
    const styleTtl = new ort.Tensor('float32', Float32Array.of(1), [1]);
    const styleDp = new ort.Tensor('float32', Float32Array.of(2), [1]);
    const session = await ort.InferenceSession.create('/local/model.onnx', { executionProviders: ['wasm'] });

    let successfulInput;
    let successfulOutput;
    const successfulScope = beginTensorScope();
    try {
      successfulInput = new ort.Tensor('float32', Float32Array.of(3), [1]);
      successfulOutput = (await session.run({ input: successfulInput, style: styleTtl })).audio;
      assert.deepEqual(Array.from(successfulOutput.data), [0.5]);
    } finally {
      successfulScope.dispose();
    }
    assert.equal(successfulInput.disposeCount, 1);
    assert.equal(successfulOutput.disposeCount, 1);
    assert.equal(styleTtl.disposeCount, 0);
    assert.equal(styleDp.disposeCount, 0);

    let failedInput;
    let failedOutput;
    const failedScope = beginTensorScope();
    try {
      failedInput = new ort.Tensor('float32', Float32Array.of(4), [1]);
      failedOutput = (await session.run({ input: failedInput })).audio;
      throw new Error('simulated postprocessing failure');
    } catch (error) {
      assert.match(error.message, /simulated postprocessing failure/);
    } finally {
      failedScope.dispose();
    }
    assert.equal(failedInput.disposeCount, 1);
    assert.equal(failedOutput.disposeCount, 1);
    assert.equal(styleTtl.disposeCount, 0);
    assert.equal(styleDp.disposeCount, 0);

    await releaseOrt();
    assert.equal(firstRuntime.createdSessions.length, 1);
    assert.equal(firstRuntime.createdSessions[0].releaseCount, 1);
    assert.equal(styleTtl.disposeCount, 1);
    assert.equal(styleDp.disposeCount, 1);
    assert.throws(() => beginTensorScope(), /not configured/);

    const replacementRuntime = fakeRuntime();
    configureOrt(replacementRuntime.module);
    await releaseOrt();
  } finally {
    await releaseOrt();
  }
});
