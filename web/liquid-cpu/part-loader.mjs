// Copyright (c) 2026 Fusor. HTTP-only port of selected parts of Fusor AI's pinned host/loader.js.
// Upstream source: fusorlabs/liquidai-lmf3-wasm Space revision 572fc51e58808d3536bc8a8bea9d74a11b4b88bc,
// engine/dist/host/loader.js (MIT). This deliberately omits its optional OPFS store while keeping
// the four parallel lanes, 4 MiB writes, and runtime.end_part size/BLAKE3 verification.
export const PARALLEL_PARTS = 4;
export const PUSH_BYTES = 4 << 20;
export const DEFAULT_PART_TIMEOUT_MS = 120_000;

function partFailure(part, error) {
  const message = String(error?.message ?? error);
  if (message.startsWith(`Fusor model part ${part.file}:`)) return error;
  return new Error(`Fusor model part ${part.file}: ${message}`, { cause: error });
}

function cancelBody(response, reason) {
  try { return response?.body?.cancel?.(reason) ?? Promise.resolve(); }
  catch { return Promise.resolve(); }
}

function checkedPartUrl(file, baseUrl) {
  const base = new URL(baseUrl);
  const url = new URL(file, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Part URL is outside its pinned model bundle: ${file}`);
  }
  return url;
}

export async function fetchOk(url, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    await cancelBody(response, error);
    throw error;
  }
  return response;
}

/** Stream a manifest directly to the runtime without OPFS; end_part remains the digest authority. */
export async function loadHttpParts({
  runtime,
  manifest,
  baseUrl,
  signal,
  fetchImpl = globalThis.fetch,
  onProgress,
  partTimeoutMs = DEFAULT_PART_TIMEOUT_MS,
} = {}) {
  if (!runtime || typeof runtime.write_part !== 'function' || typeof runtime.end_part !== 'function' || typeof runtime.restart_part !== 'function') {
    throw new Error('Fusor HTTP loader requires write_part, end_part and restart_part runtime methods.');
  }
  if (!manifest || !Array.isArray(manifest.parts) || manifest.parts.length === 0) throw new Error('Fusor HTTP loader requires model parts.');
  if (!Number.isSafeInteger(partTimeoutMs) || partTimeoutMs < 1) throw new Error('Fusor model-part timeout must be a positive integer.');

  const total = manifest.parts.reduce((sum, part) => {
    if (!part || typeof part.file !== 'string' || !Number.isSafeInteger(part.bytes) || part.bytes <= 0) {
      throw new Error('Fusor manifest contains an invalid model part.');
    }
    checkedPartUrl(part.file, baseUrl);
    const next = sum + part.bytes;
    if (!Number.isSafeInteger(next)) throw new Error('Fusor manifest part bytes exceed the safe integer range.');
    return next;
  }, 0);

  const controller = new AbortController();
  const progress = { done: 0, total, network: 0 };
  let firstFailure = null;
  const abortFor = (error, part = null) => {
    const contextual = part ? partFailure(part, error) : error instanceof Error ? error : new Error(String(error));
    if (!firstFailure) {
      firstFailure = contextual;
      controller.abort(contextual);
    }
    return firstFailure;
  };
  const onExternalAbort = () => abortFor(signal.reason ?? new Error('Fusor model loading was aborted.'));
  if (signal?.aborted) onExternalAbort();
  else signal?.addEventListener('abort', onExternalAbort, { once: true });

  const queue = manifest.parts.map((part, index) => ({ part, index }));
  const lane = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      if (controller.signal.aborted) return;
      const timer = setTimeout(() => abortFor(new Error(`loading exceeded ${partTimeoutMs} ms timeout`), item.part), partTimeoutMs);
      try {
        const bytes = await loadPart({
          runtime,
          item,
          baseUrl,
          signal: controller.signal,
          fetchImpl,
          onBytes(amount) {
            progress.done += amount;
            progress.network += amount;
            onProgress?.({ ...progress, part: item.part.file, source: 'network' });
          },
        });
        if (bytes !== item.part.bytes) throw new Error(`received ${bytes} bytes, expected ${item.part.bytes}`);
      } catch (error) {
        throw abortFor(error, item.part);
      } finally {
        clearTimeout(timer);
      }
    }
  };

  try {
    const settled = await Promise.allSettled(Array.from({ length: PARALLEL_PARTS }, lane));
    if (firstFailure) throw firstFailure;
    const rejected = settled.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    if (signal?.aborted) throw signal.reason ?? new Error('Fusor model loading was aborted.');
    return progress;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function loadPart({ runtime, item: { part, index }, baseUrl, signal, fetchImpl, onBytes }) {
  const url = checkedPartUrl(part.file, baseUrl);
  let wroteBytes = false;
  try {
    const response = await fetchOk(url, { fetchImpl, signal });
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined) {
      const declared = Number(contentLength);
      if (!Number.isSafeInteger(declared) || declared !== part.bytes) {
        const error = new Error(`Content-Length ${contentLength} does not match expected ${part.bytes} bytes`);
        await cancelBody(response, error);
        throw error;
      }
    }
    if (!response.body || typeof response.body.getReader !== 'function') throw new Error('response has no readable body');
    const pushed = await pushStream({
      runtime,
      index,
      part,
      stream: response.body,
      signal,
      onWrite(bytes) { wroteBytes = true; onBytes(bytes); },
    });
    if (pushed !== part.bytes) throw new Error(`received ${pushed} bytes, expected ${part.bytes}`);
    runtime.end_part(index); // The pinned runtime verifies the part's BLAKE3 digest here.
    return pushed;
  } catch (error) {
    if (wroteBytes) {
      try { runtime.restart_part(index); } catch {}
    }
    throw error;
  }
}

async function pushStream({ runtime, index, part, stream, signal, onWrite }) {
  const reader = stream.getReader();
  let pending = [];
  let pendingBytes = 0;
  let written = 0;
  const flush = () => {
    if (!pendingBytes) return;
    const bytes = pending.length === 1 ? pending[0] : concat(pending, pendingBytes);
    runtime.write_part(index, bytes);
    written += bytes.length;
    onWrite(bytes.length);
    pending = [];
    pendingBytes = 0;
  };
  try {
    for (;;) {
      if (signal.aborted) throw signal.reason ?? new Error('Fusor model loading was aborted.');
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('response stream yielded a non-byte chunk');
      if (written + pendingBytes + value.byteLength > part.bytes) {
        throw new Error(`stream exceeded expected ${part.bytes} bytes`);
      }
      pending.push(value);
      pendingBytes += value.byteLength;
      if (pendingBytes >= PUSH_BYTES) flush();
    }
    flush();
    if (written !== part.bytes) throw new Error(`stream ended after ${written} bytes, expected ${part.bytes}`);
    return written;
  } catch (error) {
    try { await reader.cancel(error); } catch {}
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function concat(chunks, length) {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
