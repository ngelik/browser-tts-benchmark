import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { ComputePool, SPAWN_COMPUTE, validateComputeSpawn } from '../web/liquid-cpu/compute-pool.mjs';
import { createLiquidCpuAdapter } from '../web/adapters/liquid-cpu.mjs';

const origin = 'https://benchmark.test';
const runtimeRoot = `${origin}/liquid-cpu/runtime/space-revision/engine/dist/`;
const adapterRuntimeRoot = `${origin}/liquid-cpu/runtime/572fc51e58808d3536bc8a8bea9d74a11b4b88bc/engine/dist/`;
const build = 'web-threaded-relaxed';
const workerUrl = `${runtimeRoot}${build}/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.no-bundler.js`;
const mainJS = `${runtimeRoot}${build}/lfm3_runtime.js`;
const spawn = port => ({
  type: SPAWN_COMPUTE,
  count: 6,
  url: workerUrl,
  mainJS,
  module: {},
  memory: {},
  receiver: 3,
  port,
});
const adapterSpawn = port => ({
  ...spawn(port),
  url: `${adapterRuntimeRoot}${build}/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.no-bundler.js`,
  mainJS: `${adapterRuntimeRoot}${build}/lfm3_runtime.js`,
});

class FakePort {
  messages = [];
  closed = false;
  postMessage(message) { this.messages.push(message); this.resolve?.(message); }
  close() { this.closed = true; }
  wait() { return this.messages.length ? Promise.resolve(this.messages.at(-1)) : new Promise(resolve => { this.resolve = resolve; }); }
}

class FakeWorker {
  static workers = [];
  static autoReady = true;
  constructor(url, options = {}) { this.url = String(url); this.options = options; this.posts = []; this.terminated = false; FakeWorker.workers.push(this); }
  postMessage(message) {
    this.posts.push(message);
    if (message.type === 'fusor-ai-rayon-init' && FakeWorker.autoReady) {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'fusor-ai-rayon-ready' } }));
    }
    if (message.action === 'dispose') queueMicrotask(() => this.emit({ id: message.id, value: null }));
  }
  emit(data) { this.onmessage?.({ data }); }
  terminate() { this.terminated = true; }
}

test('validates the six-thread spawn envelope against the exact pinned local runtime paths', () => {
  const good = spawn(new FakePort());
  assert.deepEqual(validateComputeSpawn(good, { runtimeRoot, threads: 6 }), {
    workerUrl, mainJS, build,
  });
  const relative = validateComputeSpawn({
    ...good,
    url: `${build}/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.no-bundler.js`,
    mainJS: `${build}/lfm3_runtime.js`,
  }, { runtimeRoot, threads: 6 });
  assert.equal(relative.workerUrl, workerUrl);
  assert.equal(relative.mainJS, mainJS);
  assert.throws(() => validateComputeSpawn({ ...good, count: 5 }, { runtimeRoot, threads: 6 }), /exactly 6/);
  assert.throws(() => validateComputeSpawn({ ...good, url: 'https://elsewhere.test/worker.js' }, { runtimeRoot, threads: 6 }), /outside the pinned/);
  assert.throws(() => validateComputeSpawn({ ...good, mainJS: `${runtimeRoot}web-threaded/lfm3_runtime.js` }, { runtimeRoot, threads: 6 }), /do not match/);
  assert.throws(() => validateComputeSpawn({ ...good, url: `${runtimeRoot}web-single/worker.js` }, { runtimeRoot, threads: 6 }), /do not match/);
});

test('spawns six Rayon workers, answers ready, and terminates the full pool', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: FakeWorker, readyTimeoutMs: 100 });
  const port = new FakePort();
  await pool.spawn(spawn(port));
  assert.equal(FakeWorker.workers.length, 6);
  assert.deepEqual(port.messages, [{ ready: true }]);
  assert.equal(port.closed, true);
  assert.ok(FakeWorker.workers.every(worker => worker.posts[0].type === 'fusor-ai-rayon-init'));
  pool.terminate();
  assert.ok(FakeWorker.workers.every(worker => worker.terminated));
});

test('the ready reply reaches the peer before the handshake port closes', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: FakeWorker, readyTimeoutMs: 100 });
  const channel = new MessageChannel();
  try {
    const ready = new Promise(resolve => channel.port1.once('message', resolve));
    await pool.spawn(spawn(channel.port2));
    assert.deepEqual(await ready, { ready: true });
  } finally {
    pool.terminate();
    channel.port1.close();
  }
});

test('times out startup, sends a negative handshake, and terminates every partial worker', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = false;
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: FakeWorker, readyTimeoutMs: 5 });
  const port = new FakePort();
  await assert.rejects(pool.spawn(spawn(port)), /did not become ready/);
  assert.equal(port.messages.length, 1);
  assert.equal(port.messages[0].ready, false);
  assert.match(port.messages[0].error, /did not become ready/);
  assert.equal(port.closed, true);
  assert.equal(FakeWorker.workers.length, 6);
  assert.ok(FakeWorker.workers.every(worker => worker.terminated));
  FakeWorker.autoReady = true;
});

test('a Worker constructor failure is caught by Promise.all and terminates earlier workers', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  class ConstructorFailureWorker extends FakeWorker {
    constructor(url, options = {}) {
      if (options.name === 'fusor-ai-compute-2') throw new Error('worker constructor rejected');
      super(url, options);
    }
  }
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: ConstructorFailureWorker, readyTimeoutMs: 100 });
  const port = new FakePort();
  await assert.rejects(pool.spawn(spawn(port)), /worker constructor rejected/);
  assert.equal(port.messages[0].ready, false);
  assert.equal(FakeWorker.workers.length, 5);
  assert.ok(FakeWorker.workers.every(worker => worker.terminated));
});

test('post-ready Rayon errors notify the adapter failure hook and terminate all workers', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  const failures = [];
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: FakeWorker, onCrash: error => failures.push(error) });
  await pool.spawn(spawn(new FakePort()));
  FakeWorker.workers[0].emit({ type: 'fusor-ai-rayon-error', message: 'WASM thread trapped' });
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /WASM thread trapped/);
  assert.ok(FakeWorker.workers.every(worker => worker.terminated));
});

test('a second spawn cannot silently create a second six-worker pool', async () => {
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  const pool = new ComputePool({ runtimeRoot, threads: 6, WorkerClass: FakeWorker });
  await pool.spawn(spawn(new FakePort()));
  const secondPort = new FakePort();
  await assert.rejects(pool.spawn(spawn(secondPort)), /only be started once/);
  assert.deepEqual(secondPort.messages.map(message => message.ready), [false]);
  assert.equal(FakeWorker.workers.length, 6);
  assert.ok(FakeWorker.workers.every(worker => worker.terminated));
});

test('RPC routes spawn messages, preserves first-PCM notifications, and disposes the pool', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  globalThis.Worker = FakeWorker;
  try {
    const adapter = createLiquidCpuAdapter('audio', { origin, readyTimeoutMs: 100 });
    const initialize = adapter.initialize({ backend: 'cpu' });
    const engine = FakeWorker.workers.find(worker => !worker.options.name);
    const initMessage = engine.posts.find(message => message.action === 'initialize');
    const port = new FakePort();
    engine.emit(adapterSpawn(port));
    await port.wait();
    assert.equal(FakeWorker.workers.filter(worker => worker.options.name?.startsWith('fusor-ai-compute-')).length, 6);
    engine.emit({ id: initMessage.id, value: { status: 'measured', backendEffective: 'cpu/wasm' } });
    assert.equal((await initialize).backendEffective, 'cpu/wasm');

    let firstPcm = 0;
    const generated = adapter.generateChunk({ id: 0, text: 'Hello.' }, { onFirstPcm: () => firstPcm++ });
    const generateMessage = engine.posts.find(message => message.action === 'generate');
    engine.emit({ id: generateMessage.id, event: 'first-pcm' });
    engine.emit({ id: generateMessage.id, value: { parts: [Float32Array.of(0.1)], sampleRate: 24_000, completedChunkId: 0 } });
    assert.equal((await generated).completedChunkId, 0);
    assert.equal(firstPcm, 1);
    await adapter.dispose();
    assert.ok(FakeWorker.workers.every(worker => worker.terminated));
  } finally { globalThis.Worker = previousWorker; }
});

test('RPC initialization errors terminate compute children and the blocked engine worker', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  globalThis.Worker = FakeWorker;
  try {
    const adapter = createLiquidCpuAdapter('omni', { origin, readyTimeoutMs: 100 });
    const initialize = adapter.initialize({ backend: 'cpu' });
    const engine = FakeWorker.workers.find(worker => !worker.options.name);
    const initMessage = engine.posts.find(message => message.action === 'initialize');
    const port = new FakePort();
    engine.emit(adapterSpawn(port));
    await port.wait();
    engine.emit({ id: initMessage.id, error: 'runtime init failed' });
    await assert.rejects(initialize, /runtime init failed/);
    assert.ok(FakeWorker.workers.every(worker => worker.terminated));
    await adapter.dispose();
  } finally { globalThis.Worker = previousWorker; }
});

test('a post-ready compute error rejects pending RPC and terminates the blocked engine', async () => {
  const previousWorker = globalThis.Worker;
  FakeWorker.workers = [];
  FakeWorker.autoReady = true;
  globalThis.Worker = FakeWorker;
  try {
    const adapter = createLiquidCpuAdapter('audio', { origin, readyTimeoutMs: 100 });
    const initialize = adapter.initialize({ backend: 'cpu' });
    const engine = FakeWorker.workers.find(worker => !worker.options.name);
    const initMessage = engine.posts.find(message => message.action === 'initialize');
    const port = new FakePort();
    engine.emit(adapterSpawn(port));
    await port.wait();
    engine.emit({ id: initMessage.id, value: { status: 'measured' } });
    await initialize;
    const generated = adapter.generateChunk({ id: 0, text: 'Hello.' });
    const compute = FakeWorker.workers.find(worker => worker.options.name?.startsWith('fusor-ai-compute-'));
    compute.emit({ type: 'fusor-ai-rayon-error', message: 'post-ready thread trap' });
    await assert.rejects(generated, /compute worker failed.*post-ready thread trap/);
    await assert.rejects(adapter.generateChunk({ id: 1, text: 'No queue after abort.' }), /unavailable after failure/);
    assert.ok(FakeWorker.workers.every(worker => worker.terminated));
    await adapter.dispose();
  } finally { globalThis.Worker = previousWorker; }
});
