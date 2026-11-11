import { createRpcAdapter } from './rpc-bridge.mjs';
import { ComputePool, SPAWN_COMPUTE } from '../liquid-cpu/compute-pool.mjs';

const SPACE_REVISION = '572fc51e58808d3536bc8a8bea9d74a11b4b88bc';
const THREADS = 6;

export function createLiquidCpuAdapter(kind, { origin = globalThis.location?.origin, readyTimeoutMs = 60_000 } = {}) {
  if (!['audio', 'omni'].includes(kind)) throw new Error(`Unknown Liquid CPU variant: ${kind}`);
  if (typeof origin !== 'string') throw new Error('Liquid CPU adapter requires the local benchmark origin.');
  const runtimeRoot = new URL(`liquid-cpu/runtime/${SPACE_REVISION}/engine/dist/`, `${origin}/`).href;
  let adapter;
  const computePool = new ComputePool({
    runtimeRoot,
    threads: THREADS,
    readyTimeoutMs,
    onCrash: error => adapter?.abort(new Error(`Liquid ${kind} CPU compute worker failed: ${error.message}`)),
  });
  adapter = createRpcAdapter(
    new URL('../liquid-cpu/worker.mjs', import.meta.url),
    `Liquid ${kind} CPU`,
    { kind },
    {
      terminateOnFailure: true,
      onMessage(data) {
        if (data?.type !== SPAWN_COMPUTE) return false;
        computePool.spawn(data).catch(error => adapter?.abort(error));
        return true;
      },
      onRpcError(error) { adapter?.abort(error); },
      onFailure() { computePool.terminate(); },
      onDispose() { computePool.terminate(); },
    },
  );
  return adapter;
}
