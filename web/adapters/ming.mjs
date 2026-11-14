import { createRpcAdapter } from './rpc-bridge.mjs';
import { ComputePool, SPAWN_COMPUTE } from '../liquid-cpu/compute-pool.mjs';
import { THREADS, runtimeRoot } from '../ming/config.mjs';

export function createMingAdapter({ origin = globalThis.location?.origin, readyTimeoutMs = 60_000 } = {}) {
  if (typeof origin !== 'string') throw new Error('Ming adapter requires the local benchmark origin.');
  const dist = runtimeRoot(origin);
  let adapter;
  const computePool = new ComputePool({
    runtimeRoot: dist.href,
    glueName: 'ming_runtime.js',
    threads: THREADS,
    readyTimeoutMs,
    onCrash: error => adapter?.abort(new Error(`Ming CPU compute worker failed: ${error.message}`)),
  });
  adapter = createRpcAdapter(
    new URL('../ming/worker.mjs', import.meta.url),
    'Ming 3.0 TTS CPU',
    {},
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
