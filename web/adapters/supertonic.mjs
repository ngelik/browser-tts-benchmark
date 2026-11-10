import { createRpcAdapter } from './rpc-bridge.mjs';

export function createSupertonicAdapter() {
  return createRpcAdapter(new URL('../workers/supertonic.mjs', import.meta.url), 'Supertonic 3');
}
