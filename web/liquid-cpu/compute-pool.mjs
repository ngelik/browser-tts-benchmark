// Narrow MIT-licensed port of fusor-ai/packages/host/compute.js from the pinned Fusor AI
// submodule. It preserves the wasm-bindgen-rayon 1.3.0 message ABI and fixes post-ready
// RAYON_ERROR reporting, readiness timeouts and idempotent teardown for this benchmark worker.
export const SPAWN_COMPUTE = 'fusor-ai-spawn-compute';
const RAYON_INIT = 'fusor-ai-rayon-init';
const RAYON_READY = 'fusor-ai-rayon-ready';
const RAYON_ERROR = 'fusor-ai-rayon-error';

function parsePinnedUrl(raw, runtimeRoot) {
  if (typeof raw !== 'string') throw new Error('Fusor compute worker URL is missing.');
  const url = new URL(raw, runtimeRoot);
  const root = new URL(runtimeRoot);
  if (url.origin !== root.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(root.pathname)) {
    throw new Error('Fusor compute worker URL is outside the pinned runtime asset prefix.');
  }
  return { url, relative: url.pathname.slice(root.pathname.length) };
}

export function validateComputeSpawn(message, { runtimeRoot, threads }) {
  if (message?.type !== SPAWN_COMPUTE) throw new Error('Unexpected Fusor worker message.');
  if (!Number.isSafeInteger(threads) || threads < 1 || message.count !== threads) {
    throw new Error(`Fusor requested ${String(message.count)} compute workers; this protocol requires exactly ${threads}.`);
  }
  if (!message.port || typeof message.port.postMessage !== 'function') throw new Error('Fusor compute worker handshake port is missing.');
  if (!message.module || !message.memory || !Number.isSafeInteger(message.receiver) || message.receiver < 0 || typeof message.mainJS !== 'string') {
    throw new Error('Fusor compute worker initialization payload is invalid.');
  }
  const { url: workerUrl, relative: workerPath } = parsePinnedUrl(message.url, runtimeRoot);
  const { url: mainUrl, relative: mainPath } = parsePinnedUrl(message.mainJS, runtimeRoot);
  const workerBuild = workerPath.match(/^(web-threaded(?:-relaxed)?)\/snippets\/wasm-bindgen-rayon-38edf6e439f6d70d\/src\/workerHelpers\.no-bundler\.js$/)?.[1];
  const mainBuild = mainPath.match(/^(web-threaded(?:-relaxed)?)\/lfm3_runtime\.js$/)?.[1];
  if (!workerBuild || workerBuild !== mainBuild) throw new Error('Fusor compute worker modules do not match the pinned threaded runtime build.');
  return { workerUrl: workerUrl.href, mainJS: mainUrl.href, build: workerBuild };
}

export class ComputePool {
  #runtimeRoot;
  #threads;
  #Worker;
  #onCrash;
  #readyTimeoutMs;
  #workers = new Set();
  #pendingStarts = new Set();
  #spawned = false;
  #terminated = false;
  #crashed = false;

  constructor({ runtimeRoot, threads, onCrash, WorkerClass = globalThis.Worker, readyTimeoutMs = 60_000 }) {
    this.#runtimeRoot = runtimeRoot;
    this.#threads = threads;
    this.#onCrash = onCrash;
    this.#Worker = WorkerClass;
    this.#readyTimeoutMs = readyTimeoutMs;
  }

  async spawn(message) {
    const port = message?.port;
    try {
      const { workerUrl, mainJS } = validateComputeSpawn(message, { runtimeRoot: this.#runtimeRoot, threads: this.#threads });
      if (this.#spawned || this.#terminated) throw new Error('Fusor compute pool may only be started once.');
      if (typeof this.#Worker !== 'function') throw new Error('Web Workers are unavailable for the Fusor CPU pool.');
      this.#spawned = true;
      await Promise.all(Array.from({ length: this.#threads }, (_, index) => this.#start(index, workerUrl, mainJS, message)));
      if (this.#terminated) throw new Error('Fusor compute pool stopped before all workers became ready.');
      port.postMessage({ ready: true });
    } catch (error) {
      this.terminate(error);
      try { port?.postMessage({ ready: false, error: String(error?.message ?? error) }); } catch {}
      throw error;
    } finally {
      try { port?.close?.(); } catch {}
    }
  }

  terminate(reason = new Error('Fusor compute pool terminated.')) {
    if (this.#terminated) return;
    this.#terminated = true;
    for (const cancel of [...this.#pendingStarts]) cancel(reason);
    for (const worker of this.#workers) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    this.#workers.clear();
  }

  #fatal(error) {
    if (this.#terminated || this.#crashed) return;
    this.#crashed = true;
    this.terminate(error);
    this.#onCrash?.(error);
  }

  #start(index, url, mainJS, message) {
    return new Promise((resolve, reject) => {
      let worker = null;
      let ready = false;
      let timer = null;
      const clearStartup = () => {
        if (timer) clearTimeout(timer);
        this.#pendingStarts.delete(cancelStartup);
      };
      const fail = error => {
        if (ready) this.#fatal(error);
        else {
          clearStartup();
          if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
          }
          reject(error);
        }
      };
      const cancelStartup = reason => {
        if (ready || !this.#pendingStarts.has(cancelStartup)) return;
        clearStartup();
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
        }
        reject(reason);
      };
      try {
        worker = new this.#Worker(url, { type: 'module', name: `fusor-ai-compute-${index}` });
        this.#workers.add(worker);
        timer = setTimeout(() => fail(new Error(`Fusor compute worker ${index} did not become ready within ${this.#readyTimeoutMs} ms.`)), this.#readyTimeoutMs);
        this.#pendingStarts.add(cancelStartup);
        worker.onmessage = ({ data }) => {
          if (data?.type === RAYON_READY && !ready) {
            ready = true;
            clearStartup();
            resolve();
          } else if (data?.type === RAYON_ERROR) {
            fail(new Error(data.message || `Fusor compute worker ${index} failed.`));
          }
        };
        worker.onerror = event => fail(new Error(event?.message || `Fusor compute worker ${index} failed.`));
        worker.onmessageerror = () => fail(new Error(`Fusor compute worker ${index} message could not be deserialized.`));
        worker.postMessage({
          type: RAYON_INIT,
          module: message.module,
          memory: message.memory,
          receiver: message.receiver,
          mainJS,
        });
      } catch (error) {
        if (worker) fail(error);
        else reject(error);
      }
    });
  }
}
