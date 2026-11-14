import { createRpcAdapter } from './rpc-bridge.mjs';

export function createCosyVoice3Adapter() {
  return createRpcAdapter(new URL('../cosyvoice3/worker.mjs', import.meta.url), 'Fun-CosyVoice3');
}
