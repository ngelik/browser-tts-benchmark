// Original worker bridge. Third-party frontend sources retain their own licenses.
export function createRpcAdapter(workerUrl, label, fixedOptions = {}, hooks = {}) {
  let worker = null;
  let serial = 0;
  let failed = false;
  const pending = new Map();
  function fail(error) {
    if (failed) return;
    failed = true;
    for (const call of pending.values()) call.reject(error);
    pending.clear();
    try { hooks.onFailure?.(error); } catch {}
    if (hooks.terminateOnFailure) worker?.terminate();
  }
  function rpcError(error, action) {
    try { hooks.onRpcError?.(error, action); } catch (hookError) { fail(hookError); }
  }
  function request(action, payload = {}, onFirstPcm) {
    return new Promise((resolve, reject) => {
      if (failed || !worker) {
        reject(new Error(label + ' worker is unavailable after failure or disposal'));
        return;
      }
      const id = ++serial;
      const timer = action === 'dispose' ? setTimeout(() => { pending.delete(id); reject(new Error(label + ' dispose timed out')); }, 5000) : null;
      const call = { action, onFirstPcm, resolve(value) { if (timer) clearTimeout(timer); resolve(value); }, reject(error) { if (timer) clearTimeout(timer); reject(error); } };
      pending.set(id, call);
      try { worker.postMessage({ id, action, ...payload }); }
      catch (error) { pending.delete(id); call.reject(error); rpcError(error, action); }
    });
  }
  return {
    async initialize(options) {
      worker = new Worker(workerUrl, { type: 'module' });
      worker.onmessage = ({ data }) => {
        try { if (hooks.onMessage?.(data) === true) return; }
        catch (error) { fail(error); return; }
        const call = pending.get(data.id);
        if (!call) return;
        if (data.event === 'first-pcm') { call.onFirstPcm?.(); return; }
        pending.delete(data.id);
        if (data.error) {
          const error = new Error(data.error);
          call.reject(error);
          rpcError(error, call.action);
        }
        else call.resolve(data.value);
      };
      worker.onerror = event => {
        const details = [event?.message, event?.filename, event?.lineno && `line ${event.lineno}`, event?.colno && `column ${event.colno}`].filter(Boolean).join(' ');
        fail(new Error(label + ' worker failed' + (details ? ': ' + details : '.')));
      };
      worker.onmessageerror = () => {
        fail(new Error(label + ' worker message could not be deserialized.'));
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
        try { hooks.onDispose?.(); } catch {}
        worker.terminate();
        worker = null;
        for (const call of pending.values()) call.reject(new Error(label + ' disposed'));
        pending.clear();
      }
    },
    abort(error) { fail(error instanceof Error ? error : new Error(String(error))); },
  };
}
