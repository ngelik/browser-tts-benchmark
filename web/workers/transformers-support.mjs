import { env } from '/runtimes/transformers/3.5.1/transformers.min.js';
export function configureTransformers() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/models/';
  env.useBrowserCache = true;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.wasmPaths = '/runtimes/transformers/3.5.1/';
  env.backends.onnx.logLevel = 'error';
}
export async function verifySelectedGpu() {
  const device = await env.backends.onnx.webgpu.device;
  const adapter = env.backends.onnx.webgpu.adapter;
  const info = device?.adapterInfo ?? adapter?.info;
  if (info?.isFallbackAdapter || adapter?.isFallbackAdapter) throw new Error('Runtime selected a software WebGPU adapter');
  return info?.description || info?.vendor || 'ORT WebGPU device; description unavailable';
}
