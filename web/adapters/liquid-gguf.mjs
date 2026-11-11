import { createRpcAdapter } from './rpc-bridge.mjs';
export function createLiquidGgufAdapter(kind) {
  return createRpcAdapter(new URL('../liquid-gguf/worker.mjs',import.meta.url),'Liquid '+kind,{kind});
}
