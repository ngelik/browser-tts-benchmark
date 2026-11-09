import { createRpcAdapter } from './rpc-bridge.mjs';
export function createParadeeAdapter() {
  return createRpcAdapter(new URL('../workers/paradee.mjs', import.meta.url), 'Paradee');
}
