export function createPivoAdapter() {
  let worker = null;
  let failed = false;
  let serial = 0;
  let initializeResolve;
  let initializeReject;
  let disposeResolve;
  const jobs = new Map();

  function rejectOutstanding(error) {
    initializeReject?.(error);
    initializeReject = null;
    for (const job of jobs.values()) job.reject(error);
    jobs.clear();
  }

  function handleMessage({ data }) {
    if (data.type === 'ready') {
      initializeResolve?.(data.info);
      initializeResolve = null;
      initializeReject = null;
    } else if (data.type === 'error') {
      const error = new Error(data.message || 'PiVo worker failed');
      if (data.jobId != null && jobs.has(data.jobId)) {
        jobs.get(data.jobId).reject(error);
        jobs.delete(data.jobId);
      } else {
        failed = true;
        rejectOutstanding(error);
      }
    } else if (data.type === 'pcm') {
      const job = jobs.get(data.jobId);
      if (!job) return;
      if (data.pcm?.length) job.onFirstPcm?.();
      job.sampleRate = data.sampleRate;
      job.parts.push({ offset: data.sampleOffset, pcm: data.pcm });
    } else if (data.type === 'chunk-done') {
      const job = jobs.get(data.jobId);
      if (!job) return;
      jobs.delete(data.jobId);
      const ordered = job.parts.sort((a, b) => a.offset - b.offset);
      const samples = ordered.reduce((sum, part) => sum + part.pcm.length, 0);
      let offset = 0;
      for (const part of ordered) {
        if (part.offset !== offset) {
          job.reject(new Error('PiVo PCM stream contained a gap or overlap'));
          return;
        }
        offset += part.pcm.length;
      }
      if (data.samples !== samples) {
        job.reject(new Error('PiVo completed sample count did not match its PCM stream'));
        return;
      }
      job.resolve({ parts: ordered.map(part => part.pcm), sampleRate: job.sampleRate, completedChunkId: data.chunkId });
    } else if (data.type === 'disposed') {
      disposeResolve?.();
      disposeResolve = null;
    }
  }

  return {
    async initialize(options) {
      if (worker) throw new Error('PiVo adapter is already initialized');
      worker = new Worker(new URL('../workers/pivo.mjs', import.meta.url), { type: 'module' });
      worker.onmessage = handleMessage;
      worker.onerror = event => {
        failed = true;
        rejectOutstanding(new Error(event.message || 'PiVo worker failed'));
      };
      worker.onmessageerror = () => {
        failed = true;
        rejectOutstanding(new Error('PiVo worker returned an unreadable message'));
      };
      const ready = new Promise((resolve, reject) => {
        initializeResolve = resolve;
        initializeReject = reject;
      });
      worker.postMessage({ type: 'init', caseId: 'pivo-curated', options });
      return ready;
    },

    async generateChunk(chunk, { onFirstPcm } = {}) {
      if (!worker || failed) throw new Error('PiVo worker is not ready');
      const jobId = ++serial;
      const result = new Promise((resolve, reject) => jobs.set(jobId, { resolve, reject, onFirstPcm, parts: [] }));
      worker.postMessage({ type: 'synthesize', jobId, chunk });
      return result;
    },

    async dispose() {
      if (!worker) return;
      const active = worker;
      try {
        if (!failed) {
          const disposed = new Promise(resolve => {
            const timer = setTimeout(() => {
              disposeResolve = null;
              resolve();
            }, 5000);
            disposeResolve = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          active.postMessage({ type: 'dispose' });
          await disposed;
        }
      } finally {
        active.terminate();
        worker = null;
        disposeResolve = null;
        rejectOutstanding(new Error('PiVo adapter disposed'));
      }
    },
  };
}
