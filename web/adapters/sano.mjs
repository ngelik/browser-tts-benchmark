export function createSanoAdapter() {
  let worker = null;
  let serial = 0;
  let failed = false;
  const pending = new Map();

  function rejectPending(error) {
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  }

  function request(action, payload = {}) {
    if (!worker) return Promise.reject(new Error('Sano worker is not running.'));
    if (failed) return Promise.reject(new Error('Sano worker has failed.'));
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = action === 'dispose'
        ? setTimeout(() => { pending.delete(id); reject(new Error('Sano dispose timed out.')); }, 5000)
        : null;
      pending.set(id, {
        resolve(value) { if (timer) clearTimeout(timer); resolve(value); },
        reject(error) { if (timer) clearTimeout(timer); reject(error); },
      });
      try { worker.postMessage({ id, action, ...payload }); }
      catch (error) {
        pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(error);
      }
    });
  }

  return {
    async initialize(options = {}) {
      if (worker) await this.dispose();
      failed = false;
      if (options.backend !== 'cpu') {
        return {
          status: 'unsupported',
          reason: 'The official Sano browser runtime uses WebAssembly on CPU and does not provide a WebGPU path.',
          backendEffective: 'none',
          voice: 'Amy (English)',
          precision: 'FP32 browser voice bundle',
          settings: { voiceKey: 'amy', language: 'en', runtime: 'sanotts-web@0.3.0', executionProviders: [] },
          capability: {
            gpuDispatchVerified: false,
            description: 'No official Sano WebGPU backend is available to probe.',
          },
        };
      }

      worker = new Worker(new URL('../workers/sano.js', import.meta.url), { name: 'Sano TTS' });
      worker.onmessage = ({ data }) => {
        const call = pending.get(data?.id);
        if (!call) return;
        pending.delete(data.id);
        if (data.error) call.reject(new Error(data.error));
        else call.resolve(data.value);
      };
      worker.onerror = event => {
        failed = true;
        const details = [event?.message, event?.filename, event?.lineno && `line ${event.lineno}`, event?.colno && `column ${event.colno}`]
          .filter(Boolean).join(' ');
        rejectPending(new Error('Sano worker failed' + (details ? ': ' + details : '.')));
      };
      worker.onmessageerror = () => {
        failed = true;
        rejectPending(new Error('Sano worker message could not be deserialized.'));
      };

      try { return await request('initialize', { options }); }
      catch (error) {
        await this.dispose().catch(() => {});
        throw error;
      }
    },

    async generateChunk(chunk, { onFirstPcm } = {}) {
      const response = await request('generate', { chunk });
      if (response.parts?.some(part => part.length > 0)) onFirstPcm?.();
      return response;
    },

    async dispose() {
      const current = worker;
      if (!current) return;
      try {
        if (!failed) await request('dispose');
      } finally {
        current.terminate();
        if (worker === current) worker = null;
        rejectPending(new Error('Sano worker disposed.'));
      }
    },
  };
}
