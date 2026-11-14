// Local model files can exceed Chrome's per-entry HTTP cache limit.
// An explicit versioned cache also survives reopening the benchmark tab offline.
export async function fetchModelAsset(input, revision) {
  const url = new URL(input, self.location.href);
  if (url.origin !== self.location.origin || !/^\/(models|runtimes)\//.test(url.pathname)) {
    throw new Error('Assets must come from a local model or runtime directory');
  }
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error('A pinned model revision is required');

  const cache = await caches.open('tts-model-assets-v1-' + revision);
  const cached = await cache.match(url.href);
  if (cached) return cached;
  const response = await fetch(url.href);
  if (!response.ok) throw new Error('Model asset request returned ' + response.status + ' for ' + url.pathname);
  // Consume the response once. Cloning a large stream before the consumer starts
  // can buffer a second copy of the complete graph in the worker.
  await cache.put(url.href, response);
  const stored = await cache.match(url.href);
  if (!stored) throw new Error('Chrome did not retain the model asset ' + url.pathname);
  return stored;
}
