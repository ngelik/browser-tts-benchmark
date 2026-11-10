// Untimed proof of actual browser inference dispatch; never used around scored work.
export function dispatchProbe() {
  let count = 0; const originals = [];
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) {
    const proto = globalThis.GPUComputePassEncoder?.prototype;
    if (typeof proto?.[name] !== 'function') continue;
    const fn = proto[name]; originals.push([proto, name, fn]);
    proto[name] = function (...args) { count++; return fn.apply(this, args); };
  }
  return { stop() { for (const [proto, name, fn] of originals) proto[name] = fn; return count; } };
}
export async function hardwareGpu() {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) return null;
  return adapter.info?.description || adapter.info?.vendor || 'Hardware WebGPU adapter';
}
