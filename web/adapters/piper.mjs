import { createRpcAdapter } from './rpc-bridge.mjs';

export function createPiperAdapter() {
  return createRpcAdapter(new URL('../workers/piper.mjs', import.meta.url), 'Piper');
}
