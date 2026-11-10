import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSanoAdapter } from '../web/adapters/sano.mjs';

const workerSource = await readFile(new URL('../web/workers/sano.js', import.meta.url), 'utf8');

class FakeWorker {
  static instances = [];
  static responseError = null;

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.sent = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.sent.push(message);
    queueMicrotask(() => {
      const value = message.action === 'initialize'
        ? {
            status: 'measured',
            backendEffective: 'cpu/wasm',
            voice: 'Amy (English, eSpeak en-us)',
            precision: 'FP32 browser voice bundle',
            settings: { runtime: 'sanotts-web@0.3.0', voiceKey: 'amy', language: 'en' },
            capability: { gpuDispatchVerified: null, description: 'CPU WASM.' },
          }
        : message.action === 'generate'
          ? { parts: [Float32Array.of(0.125, -0.25)], sampleRate: 22050, completedChunkId: message.chunk.id }
          : null;
      this.onmessage?.({ data: { id: message.id, ...(FakeWorker.responseError ? { error: FakeWorker.responseError } : { value }) } });
    });
  }

  terminate() { this.terminated = true; }
}

test('Sano CPU adapter uses a classic worker and preserves the chunk result contract', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.instances = [];
  FakeWorker.responseError = null;
  globalThis.Worker = FakeWorker;
  try {
    const adapter = createSanoAdapter();
    const initialized = await adapter.initialize({ backend: 'cpu', probe: true });
    assert.equal(initialized.status, 'measured');
    assert.equal(initialized.backendEffective, 'cpu/wasm');
    assert.equal(FakeWorker.instances.length, 1);
    const worker = FakeWorker.instances[0];
    assert.equal(worker.options.type, undefined);
    assert.equal(new URL(worker.url).pathname.endsWith('/web/workers/sano.js'), true);

    let firstPcmCalls = 0;
    const chunk = { id: 9, start: 20, end: 31, text: 'Hello Sano.', sha256: 'd'.repeat(64) };
    const response = await adapter.generateChunk(chunk, { onFirstPcm: () => { firstPcmCalls++; } });
    assert.equal(firstPcmCalls, 1);
    assert.equal(response.completedChunkId, chunk.id);
    assert.equal(response.sampleRate, 22050);
    assert.deepEqual(Array.from(response.parts[0]), [0.125, -0.25]);
    await adapter.dispose();
    assert.equal(worker.terminated, true);
  } finally {
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test('Sano reports WebGPU unsupported without starting a worker', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  try {
    const result = await createSanoAdapter().initialize({ backend: 'webgpu' });
    assert.equal(result.status, 'unsupported');
    assert.match(result.reason, /does not provide a WebGPU path/);
    assert.equal(result.capability.gpuDispatchVerified, false);
    assert.equal(FakeWorker.instances.length, 0);
  } finally {
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test('Sano adapter rejects worker errors and still terminates the worker', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.instances = [];
  FakeWorker.responseError = 'pinned runtime failed';
  globalThis.Worker = FakeWorker;
  try {
    const adapter = createSanoAdapter();
    await assert.rejects(adapter.initialize({ backend: 'cpu' }), /pinned runtime failed/);
    assert.equal(FakeWorker.instances.length, 1);
    assert.equal(FakeWorker.instances[0].terminated, true);
  } finally {
    FakeWorker.responseError = null;
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test('Sano worker loads only same-origin pinned runtime files and restores worker RPC messages', () => {
  assert.match(workerSource, /RUNTIME_ROOT = '\/runtimes\/sanotts-web\/0\.3\.0\/dist\//);
  assert.match(workerSource, /MODEL_REVISION = '4a8194aa1dd958033ee449b3ad30c37e536b216e'/);
  assert.match(workerSource, /url\.origin !== self\.location\.origin/);
  assert.match(workerSource, /allowedScripts\.has\(url\.href\)/);
  assert.match(workerSource, /importScripts\(url\.href\)/);
  assert.match(workerSource, /await import\(runtimeUrl\('index\.js'\)\)/);
  assert.match(workerSource, /engine\.synthesize\(chunk\.text/);
  assert.match(workerSource, /const MAX_SECONDS = 120/);
  assert.match(workerSource, /result\.samples\.length >= EXPECTED_SAMPLE_RATE \* MAX_SECONDS/);
  assert.match(workerSource, /result\.phonemeCount >= MAX_PHONEME_IDS/);
  assert.match(workerSource, /if \(probe\) \{/);
  assert.match(workerSource, /await synthesize\(\{ id: 'sano-probe', text: probeText \}\)/);
  assert.match(workerSource, /self\.onmessage = rpcHandler/);
  assert.doesNotMatch(workerSource, /navigator\.gpu|executionProviders: \['webgpu'\]/);
});
