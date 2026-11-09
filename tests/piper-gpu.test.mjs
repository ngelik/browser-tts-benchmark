import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { observeComputeDispatches, requestHardwareWebGpuAdapter } from '../web/piper/webgpu.mjs';

const lock = JSON.parse(await readFile(new URL('../assets.lock.json', import.meta.url), 'utf8'));
const piper = lock.models['piper-en-gb-southern-english-female-low'];

test('Piper pins the WebGPU bundle and asyncify fallback while retaining only CPU and WebGPU', () => {
  assert.deepEqual(piper.backends, ['cpu', 'webgpu']);
  const paths = new Set(piper.runtime.files.map(file => file.path));
  assert.ok(paths.has('dist/ort.webgpu.min.mjs'));
  assert.ok(paths.has('dist/ort-wasm-simd-threaded.asyncify.mjs'));
  assert.ok(paths.has('dist/ort-wasm-simd-threaded.asyncify.wasm'));
});

test('Piper adapter requires an available WebGPU adapter and rejects software fallback', async () => {
  assert.equal((await requestHardwareWebGpuAdapter(null)).reason, 'Chrome does not expose WebGPU');
  assert.equal((await requestHardwareWebGpuAdapter({ requestAdapter: async () => null })).reason, 'No WebGPU adapter is available');
  const fallback = { info: { isFallbackAdapter: true, description: 'Software adapter' } };
  assert.equal((await requestHardwareWebGpuAdapter({ requestAdapter: async () => fallback })).reason,
    'Software WebGPU fallback adapters are not benchmarked');
  const hardware = { info: { isFallbackAdapter: false, description: 'Test GPU', vendor: 'Test vendor' } };
  const selected = await requestHardwareWebGpuAdapter({ requestAdapter: async () => hardware });
  assert.equal(selected.adapter, hardware);
  assert.equal(selected.description, 'Test GPU');
});

test('Piper dispatch observer counts compute work and restores the original methods', () => {
  const previous = globalThis.GPUComputePassEncoder;
  class Encoder {
    dispatchWorkgroups() { return 'direct'; }
    dispatchWorkgroupsIndirect() { return 'indirect'; }
  }
  const direct = Encoder.prototype.dispatchWorkgroups;
  const indirect = Encoder.prototype.dispatchWorkgroupsIndirect;
  try {
    globalThis.GPUComputePassEncoder = Encoder;
    const observer = observeComputeDispatches();
    const encoder = new Encoder();
    assert.equal(encoder.dispatchWorkgroups(1), 'direct');
    assert.equal(encoder.dispatchWorkgroupsIndirect({}, 0), 'indirect');
    assert.equal(observer.stop(), 2);
    assert.equal(Encoder.prototype.dispatchWorkgroups, direct);
    assert.equal(Encoder.prototype.dispatchWorkgroupsIndirect, indirect);
    assert.equal(observer.stop(), 2);
  } finally {
    if (previous === undefined) delete globalThis.GPUComputePassEncoder;
    else globalThis.GPUComputePassEncoder = previous;
  }
});
