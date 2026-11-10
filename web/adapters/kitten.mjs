import { createRpcAdapter } from './rpc-bridge.mjs';
export function createKittenAdapter() { return createRpcAdapter(new URL('../workers/kitten.mjs', import.meta.url), 'Kitten'); }
