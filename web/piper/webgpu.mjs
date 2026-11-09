export async function requestHardwareWebGpuAdapter(gpu) {
  if (!gpu?.requestAdapter) return { reason: 'Chrome does not expose WebGPU' };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { reason: 'No WebGPU adapter is available' };
  let info = adapter.info ?? null;
  if (!info && typeof adapter.requestAdapterInfo === 'function') {
    try { info = await adapter.requestAdapterInfo(); }
    catch { /* Adapter details are optional; fallback flags are checked when exposed. */ }
  }
  if (adapter.isFallbackAdapter === true || info?.isFallbackAdapter === true) {
    return { reason: 'Software WebGPU fallback adapters are not benchmarked' };
  }
  return {
    adapter,
    info,
    description: info?.description || info?.vendor || 'WebGPU adapter (description unavailable)',
  };
}

export function observeComputeDispatches(scope = globalThis) {
  let count = 0;
  let stopped = false;
  const original = [];
  const prototype = scope.GPUComputePassEncoder?.prototype;
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    if (typeof prototype?.[name] !== 'function') continue;
    const method = prototype[name];
    original.push([prototype, name, method]);
    prototype[name] = function (...args) {
      count++;
      return method.apply(this, args);
    };
  }
  return {
    stop() {
      if (!stopped) {
        for (const [proto, name, method] of original) proto[name] = method;
        stopped = true;
      }
      return count;
    },
  };
}
