// Original worker bridge. Third-party frontend sources retain their own licenses.
export function createRpcAdapter(workerUrl, label, fixedOptions = {}) {
  let worker = null;
  let serial = 0;
  let failed = false;
  const pending = new Map();
  function request(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = action === 'dispose' ? setTimeout(() => { pending.delete(id); reject(new Error(label + ' dispose timed out')); }, 5000) : null;
      pending.set(id, { resolve(value) { if (timer) clearTimeout(timer); resolve(value); }, reject(error) { if (timer) clearTimeout(timer); reject(error); } });
      worker.postMessage({ id, action, ...payload });
    });
  }
  return {
    async initialize(options) {
      worker = new Worker(workerUrl, { type: 'module' });
      worker.onmessage = ({ data }) => {
        const call = pending.get(data.id);
        if (!call) return;
        pending.delete(data.id);
        if (data.error) call.reject(new Error(data.error));
        else call.resolve(data.value);
      };
      worker.onerror = event => {
        failed = true;
        for (const call of pending.values()) call.reject(new Error(event.message || label + ' worker failed'));
        pending.clear();
      };
      return request('initialize', { options: { ...options, ...fixedOptions } });
    },
    async generateChunk(chunk, { onFirstPcm } = {}) {
      const response = await request('generate', { chunk });
      if (response.parts.some(part => part.length > 0)) onFirstPcm?.();
      return response;
    },
    async dispose() {
      if (!worker) return;
      try { if (!failed) await request('dispose'); }
      finally {
        worker.terminate();
        worker = null;
        for (const call of pending.values()) call.reject(new Error(label + ' disposed'));
        pending.clear();
      }
    },
  };
}
