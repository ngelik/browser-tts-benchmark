import { createRpcAdapter } from './rpc-bridge.mjs';
export function createMachBoomAdapter() {
  return createRpcAdapter(new URL('../mach-boom/worker.mjs', import.meta.url), 'Mach Boom', {}, {terminateOnFailure:true});
}
