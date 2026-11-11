import { createRpcAdapter } from './rpc-bridge.mjs';

export function createPocketAdapter() {
  return createRpcAdapter(new URL('../workers/pocket.mjs', import.meta.url), 'Pocket TTS');
}
