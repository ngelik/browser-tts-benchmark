import { createRpcAdapter } from './rpc-bridge.mjs';
export function createKokoroAdapter() { return createRpcAdapter(new URL('../workers/kokoro.mjs', import.meta.url), 'Kokoro'); }
