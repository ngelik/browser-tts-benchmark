import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHttpParts, PARALLEL_PARTS } from '../web/liquid-cpu/part-loader.mjs';

const baseUrl = 'http://127.0.0.1:51291/liquid-cpu/omni/rev/model/';
function part(index, bytes) {
  const hash = String(index + 1).padStart(64, '0');
  return { file: `parts/${hash}.bin`, blake3: hash, bytes };
}
function splitBytes(bytes, size = 3) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, Math.min(bytes.length, i + size)));
  return chunks;
}
function response(chunks, { contentLength = null, onCancel, onComplete, delayMs = 0 } = {}) {
  let index = 0;
  let finished = false;
  const body = new ReadableStream({
    async pull(controller) {
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else { finished = true; controller.close(); onComplete?.(); }
    },
    cancel(reason) { onCancel?.(reason); },
  });
  return {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-length' ? contentLength : null; } },
    body,
    get finished() { return finished; },
  };
}
function runtimeFor(expected, { badIndex = -1 } = {}) {
  const writes = new Map();
  const ended = [];
  const restarted = [];
  return {
    writes, ended, restarted,
    write_part(index, bytes) {
      const previous = writes.get(index) ?? [];
      writes.set(index, [...previous, ...bytes]);
    },
    end_part(index) {
      ended.push(index);
      if (index === badIndex) throw new Error('{"kind":"integrity","message":"BLAKE3 mismatch"}');
      assert.deepEqual(writes.get(index), [...expected[index]]);
    },
    restart_part(index) { restarted.push(index); writes.delete(index); },
  };
}

test('streams exact bytes in at most four lanes and invokes runtime digest checks', async () => {
  const parts = Array.from({ length: 6 }, (_, i) => part(i, i + 7));
  const expected = parts.map((item, i) => Uint8Array.from({ length: item.bytes }, (_, j) => i * 20 + j));
  const runtime = runtimeFor(expected);
  let active = 0;
  let maxActive = 0;
  const progress = [];
  const loaded = await loadHttpParts({
    runtime,
    manifest: { parts },
    baseUrl,
    fetchImpl: async url => {
      const file = new URL(url).pathname.split('/').at(-1);
      const index = parts.findIndex(item => item.file.endsWith(file));
      assert.notEqual(index, -1);
      active++;
      maxActive = Math.max(maxActive, active);
      return response(splitBytes(expected[index]), {
        contentLength: String(parts[index].bytes),
        delayMs: 2,
        onComplete() { active--; },
        onCancel() { active--; },
      });
    },
    onProgress: item => progress.push(item),
  });
  assert.equal(PARALLEL_PARTS, 4);
  assert.equal(maxActive, 4);
  assert.equal(loaded.total, parts.reduce((sum, item) => sum + item.bytes, 0));
  assert.equal(loaded.done, loaded.total);
  assert.equal(loaded.network, loaded.total);
  assert.deepEqual([...runtime.ended].sort((a, b) => a - b), parts.map((_, i) => i));
  assert.equal(runtime.restarted.length, 0);
  assert.ok(progress.every(item => item.source === 'network' && item.part.startsWith('parts/')));
});

test('rejects a mismatched Content-Length before writing and cancels the response body', async () => {
  const modelPart = part(0, 6);
  const runtime = runtimeFor([new Uint8Array(6)]);
  let cancelled = false;
  await assert.rejects(loadHttpParts({
    runtime,
    manifest: { parts: [modelPart] },
    baseUrl,
    fetchImpl: async () => response([new Uint8Array(6)], {
      contentLength: '5',
      onCancel() { cancelled = true; },
    }),
  }), new RegExp(`${modelPart.file.replaceAll('/', '\\/')}.*Content-Length`));
  assert.equal(cancelled, true);
  assert.equal(runtime.writes.size, 0);
  assert.deepEqual(runtime.ended, []);
});

test('rejects short and overlong bodies, restarts partial runtime parts, and cancels excess streams', async () => {
  const shortPart = part(0, 8);
  const shortRuntime = runtimeFor([new Uint8Array(8)]);
  await assert.rejects(loadHttpParts({
    runtime: shortRuntime,
    manifest: { parts: [shortPart] },
    baseUrl,
    fetchImpl: async () => response([new Uint8Array([1, 2, 3, 4])]),
  }), /stream ended after 4 bytes, expected 8/);
  assert.deepEqual(shortRuntime.restarted, [0]);
  assert.deepEqual(shortRuntime.ended, []);

  const longPart = part(0, 3);
  const longRuntime = runtimeFor([new Uint8Array(3)]);
  let cancelled = false;
  await assert.rejects(loadHttpParts({
    runtime: longRuntime,
    manifest: { parts: [longPart] },
    baseUrl,
    fetchImpl: async () => response([new Uint8Array([1, 2]), new Uint8Array([3, 4])], {
      onCancel() { cancelled = true; },
    }),
  }), /exceeded expected 3 bytes/);
  assert.equal(cancelled, true);
  assert.deepEqual(longRuntime.restarted, []);
  assert.deepEqual(longRuntime.ended, []);
});

test('uses runtime end_part as the BLAKE3 authority and aborts sibling streams on digest failure', async () => {
  const badPart = part(0, 2);
  const heldPart = part(1, 8);
  const runtime = runtimeFor([new Uint8Array([1, 2]), new Uint8Array(8)], { badIndex: 0 });
  let siblingCancelled = false;
  await assert.rejects(loadHttpParts({
    runtime,
    manifest: { parts: [badPart, heldPart] },
    baseUrl,
    fetchImpl: async (url, { signal }) => {
      if (new URL(url).pathname.endsWith(badPart.file.split('/').at(-1))) {
        return response([new Uint8Array([1, 2])]);
      }
      let reads = 0;
      const body = {
        getReader() {
          return {
            read() {
              if (reads++ === 0) return Promise.resolve({ done: false, value: new Uint8Array([3, 4]) });
              return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
            },
            async cancel() { siblingCancelled = true; return { done: true }; },
            releaseLock() {},
          };
        },
      };
      return { ok: true, status: 200, headers: { get: () => null }, body };
    },
  }), /BLAKE3 mismatch/);
  assert.deepEqual(runtime.ended, [0]);
  assert.deepEqual(runtime.restarted, [0]);
  assert.equal(siblingCancelled, true);
});

test('aborts a stalled part after its bounded load timeout with file context', async () => {
  const modelPart = part(0, 10);
  const runtime = runtimeFor([new Uint8Array(10)]);
  await assert.rejects(loadHttpParts({
    runtime,
    manifest: { parts: [modelPart] },
    baseUrl,
    partTimeoutMs: 20,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), error => error.message.includes(modelPart.file) && error.message.includes('20 ms timeout'));
  assert.deepEqual(runtime.restarted, []);
});

test('aborts immediately if the caller cancels loading', async () => {
  const modelPart = part(0, 10);
  const runtime = runtimeFor([new Uint8Array(10)]);
  const controller = new AbortController();
  const loading = loadHttpParts({
    runtime,
    manifest: { parts: [modelPart] },
    baseUrl,
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  setTimeout(() => controller.abort(new Error('test cancel')), 5);
  await assert.rejects(loading, /test cancel/);
});
