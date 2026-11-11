// Original worker bridge. Third-party frontend sources retain their own licenses.
export function createRpcAdapter(workerUrl, label, fixedOptions = {}) {
  let worker = null;
  let serial = 0;
  let failed = false;
  const pending = new Map();
  function request(action, payload = {}, onFirstPcm) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = action === 'dispose' ? setTimeout(() => { pending.delete(id); reject(new Error(label + ' dispose timed out')); }, 5000) : null;
      pending.set(id, { onFirstPcm, resolve(value) { if (timer) clearTimeout(timer); resolve(value); }, reject(error) { if (timer) clearTimeout(timer); reject(error); } });
      worker.postMessage({ id, action, ...payload });
    });
  }
  return {
    async initialize(options) {
      worker = new Worker(workerUrl, { type: 'module' });
      worker.onmessage = ({ data }) => {
        const call = pending.get(data.id);
        if (!call) return;
        if (data.event === 'first-pcm') { call.onFirstPcm?.(); return; }
        pending.delete(data.id);
        if (data.error) call.reject(new Error(data.error));
        else call.resolve(data.value);
      };
      worker.onerror = event => {
        failed = true;
        const details = [event?.message, event?.filename, event?.lineno && `line ${event.lineno}`, event?.colno && `column ${event.colno}`].filter(Boolean).join(' ');
        const error = new Error(label + ' worker failed' + (details ? ': ' + details : '.'));
        for (const call of pending.values()) call.reject(error);
        pending.clear();
      };
      worker.onmessageerror = () => {
        failed = true;
        const error = new Error(label + ' worker message could not be deserialized.');
        for (const call of pending.values()) call.reject(error);
        pending.clear();
      };
      return request('initialize', { options: { ...options, ...fixedOptions } });
    },
    async generateChunk(chunk, { onFirstPcm } = {}) {
      let reported = false;
      const first = () => { if (!reported) { reported = true; onFirstPcm?.(); } };
      const response = await request('generate', { chunk }, first);
      if (response.parts.some(part => part.length > 0)) first();
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
