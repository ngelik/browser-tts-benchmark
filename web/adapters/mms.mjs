import { createRpcAdapter } from './rpc-bridge.mjs';
export function createMMSAdapter() { return createRpcAdapter(new URL('../workers/mms.mjs', import.meta.url), 'MMS'); }
