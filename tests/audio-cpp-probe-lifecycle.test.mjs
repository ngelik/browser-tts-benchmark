import test from 'node:test';
import assert from 'node:assert/strict';
import { openDiagnosticAdapter } from '../web/audio-cpp-gguf/probe-lifecycle.mjs';

function config({ backend = 'webgpu', threads = 6, verified = true } = {}) {
  return {
    status: 'measured',
    backendEffective: backend,
    voice: 'US_James',
    precision: 'Q8_0 GGUF',
    gpu: backend === 'webgpu' ? 'Apple GPU' : undefined,
    settings: { language: 'en', threads, executionProviders: [backend] },
    capability: { gpuDispatchVerified: backend === 'webgpu' ? verified : null },
  };
}

test('GPU dispatch proof is disposed before a matching uninstrumented instance is opened', async () => {
  const events = [];
  const created = [];
  const factory = async options => {
    events.push(['factory', options]);
    const index = created.length;
    const engine = {
      async initialize(options) {
        events.push(['initialize', index, options.probe]);
        return config();
      },
      async dispose() { events.push(['dispose', index]); },
    };
    created.push(engine);
    return engine;
  };

  const opened = await openDiagnosticAdapter(factory, { backend: 'webgpu', threads: 6, diagnosticLogs: true });
  assert.equal(opened.engine, created[1]);
  assert.equal(opened.capabilityProbe.capability.gpuDispatchVerified, true);
  assert.equal(opened.configuration.capability.gpuDispatchVerified, true);
  assert.deepEqual(opened.configuration.settings, opened.capabilityProbe.settings);
  assert.deepEqual(events.map(event => event[0] === 'factory' ? event[0] : event.slice(0, 3)), [
    'factory', ['initialize', 0, true], ['dispose', 0], 'factory', ['initialize', 1, false],
  ]);
});

test('GPU probe rejects absent dispatch proof and disposes its worker', async () => {
  let disposed = false;
  const factory = () => ({
    async initialize() { return config({ verified: false }); },
    async dispose() { disposed = true; },
  });
  await assert.rejects(openDiagnosticAdapter(factory, { backend: 'webgpu' }), /real compute dispatch/);
  assert.equal(disposed, true);
});

test('clean GPU initialization must retain the proved settings and backend', async () => {
  let index = 0;
  let timedDisposed = false;
  const factory = () => {
    const current = index++;
    return {
      async initialize() { return config({ threads: current ? 2 : 6 }); },
      async dispose() { if (current) timedDisposed = true; },
    };
  };
  await assert.rejects(openDiagnosticAdapter(factory, { backend: 'webgpu' }), /changed backend, voice, precision/);
  assert.equal(timedDisposed, true);
});

test('CPU diagnostics use one clean worker and do not pay for a separate capability synthesis', async () => {
  const events = [];
  let created = 0;
  const factory = () => {
    created += 1;
    return {
      async initialize(options) { events.push(options.probe); return config({ backend: 'cpu' }); },
      async dispose() {},
    };
  };
  const opened = await openDiagnosticAdapter(factory, { backend: 'cpu', threads: 2 });
  assert.equal(created, 1);
  assert.deepEqual(events, [false]);
  assert.equal(opened.capabilityProbe, null);
});
