import { createRpcAdapter } from './rpc-bridge.mjs';

export function createInflectAdapter() {
  return createRpcAdapter(new URL('../workers/inflect.mjs', import.meta.url), 'Inflect');
}
