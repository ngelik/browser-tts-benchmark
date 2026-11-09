import { createRpcAdapter } from './rpc-bridge.mjs';
export function createLeokaniAdapter(model) {
  return createRpcAdapter(new URL('../workers/leokani.mjs', import.meta.url), 'Leokani', { model });
}
