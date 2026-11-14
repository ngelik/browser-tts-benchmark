import { createRpcAdapter } from './rpc-bridge.mjs';

export function createAudio8Adapter() {
  return createRpcAdapter(new URL('../workers/audio8.mjs', import.meta.url), 'Audio8 Realistic');
}
