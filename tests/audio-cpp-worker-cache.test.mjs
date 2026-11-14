import test from 'node:test';
import assert from 'node:assert/strict';
import { createMingGgufAdapter } from '../web/adapters/audio-cpp-gguf.mjs';

class StubWorker {
  static urls = [];

  constructor(url) {
    this.url = new URL(String(url));
    StubWorker.urls.push(this.url.href);
  }

  postMessage(message) {
    queueMicrotask(() => this.onmessage?.({
      data: {
        id: message.id,
        value: message.action === 'initialize'
          ? { status: 'measured', backendEffective: 'webgpu', settings: {} }
          : null,
      },
    }));
  }

  terminate() {}
}

test('Ming capability and clean workers share one cacheable script URL', async () => {
  const originalWorker = globalThis.Worker;
  StubWorker.urls = [];
  globalThis.Worker = StubWorker;
  try {
    const probe = createMingGgufAdapter();
    await probe.initialize({ backend: 'webgpu', probe: true });
    await probe.dispose();

    const clean = createMingGgufAdapter();
    await clean.initialize({ backend: 'webgpu', probe: false });
    await clean.dispose();

    assert.equal(StubWorker.urls.length, 2);
    assert.equal(StubWorker.urls[0], StubWorker.urls[1]);
    assert.equal(new URL(StubWorker.urls[0]).search, '');
  } finally {
    globalThis.Worker = originalWorker;
  }
});
