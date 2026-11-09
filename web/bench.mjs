import { createPhononAdapter } from './adapters/phonon.mjs';
import { createParadeeAdapter } from './adapters/paradee.mjs';

const statusNode = document.querySelector('#status');
const state = { fixture: null, chunks: null, engine: null, model: null, backend: null, smoke: false };
const FACTORIES = { phonon: createPhononAdapter, paradee: createParadeeAdapter };
let canonical = null;

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function loadCanonical() {
  if (canonical) return canonical;
  const [articleResponse, manifestResponse, metaResponse] = await Promise.all([
    fetch('/fixtures/en-20000.txt', { cache: 'no-store' }),
    fetch('/fixtures/en-20000.chunks.json', { cache: 'no-store' }),
    fetch('/fixtures/en-20000.meta.json', { cache: 'no-store' }),
  ]);
  if (!articleResponse.ok || !manifestResponse.ok || !metaResponse.ok) throw new Error('Could not load the local canonical fixture files.');
  const bytes = new Uint8Array(await articleResponse.arrayBuffer());
  const article = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const manifest = await manifestResponse.json();
  const meta = await metaResponse.json();
  const digest = await sha256(bytes);
  if (article.length !== 20000 || digest !== manifest.articleSha256 || digest !== meta.sha256) {
    throw new Error('The canonical article length or SHA-256 does not match its metadata.');
  }
  if (manifest.targetCharacters !== 20000 || manifest.chunks.length !== 93 || meta.chunkCount !== 93) {
    throw new Error('The canonical fixture must contain exactly 20,000 characters across 93 chunks.');
  }
  let cursor = 0;
  const chunks = [];
  for (let i = 0; i < manifest.chunks.length; i++) {
    const span = manifest.chunks[i];
    const text = article.slice(span.start, span.end);
    if (span.id !== i || span.start !== cursor || span.end <= span.start || span.characters !== text.length) {
      throw new Error('Invalid canonical chunk span at index ' + i + '.');
    }
    if (await sha256(new TextEncoder().encode(text)) !== span.sha256) throw new Error('Canonical chunk SHA-256 mismatch at index ' + i + '.');
    chunks.push({ id: span.id, start: span.start, end: span.end, text, sha256: span.sha256 });
    cursor = span.end;
  }
  if (cursor !== article.length || chunks.map(chunk => chunk.text).join('') !== article) {
    throw new Error('Canonical source chunks do not reconstruct the full article.');
  }
  canonical = {
    fixture: { id: 'english-20k-v1', sha256: digest, characters: article.length, chunks: chunks.length },
    chunks,
  };
  return canonical;
}

async function canonicalFixture(smoke = false) {
  const full = await loadCanonical();
  if (!smoke) return full;
  const selected = full.chunks.slice(0, 3);
  const text = selected.map(chunk => chunk.text).join('');
  const smokeBytes = new TextEncoder().encode(text);
  return {
    fixture: { id: 'english-20k-smoke-v1', sha256: await sha256(smokeBytes), characters: text.length, chunks: selected.length },
    chunks: selected,
  };
}

export async function fixture(smoke = false) {
  const loaded = await canonicalFixture(Boolean(smoke));
  state.fixture = loaded.fixture;
  state.chunks = loaded.chunks;
  return { ...loaded.fixture };
}

export async function initialize({ model = 'phonon', backend = 'cpu', smoke = false, probe = false } = {}) {
  await dispose();
  state.model = model;
  state.backend = backend;
  state.smoke = Boolean(smoke);
  const loaded = await canonicalFixture(Boolean(smoke));
  state.fixture = loaded.fixture;
  state.chunks = loaded.chunks;
  const factory = FACTORIES[model];
  if (!factory) {
    return {
      status: 'unsupported',
      reason: 'No browser adapter is registered for ' + model + '.',
      backendEffective: 'none',
      voice: 'unknown',
      precision: 'unknown',
      settings: {},
      capability: { gpuDispatchVerified: false, description: 'No model adapter is registered.' },
    };
  }
  state.engine = await factory();
  setStatus('Loading ' + model + ' assets and initializing the local browser runtime…');
  try {
    const result = await state.engine.initialize({
      backend,
      cache: true,
      probe,
      probeText: state.chunks[0]?.text ?? 'A short browser speech check.',
    });
    if (result.status === 'unsupported') {
      await dispose();
      setStatus(result.reason);
      return result;
    }
    setStatus(model + ' is ready on ' + result.backendEffective + '.');
    return result;
  } catch (error) {
    await dispose();
    setStatus('Initialization failed: ' + String(error?.message ?? error));
    throw error;
  }
}

function joinPcm(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function encodeWavBase64(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const putText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  putText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  putText(8, 'WAVE');
  putText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  putText(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

export async function generate({ index = 1, smoke = state.smoke, saveAudio = false } = {}) {
  if (!state.engine) throw new Error('Initialize a model before generation.');
  const loaded = await canonicalFixture(Boolean(smoke));
  const chunks = loaded.chunks;
  state.fixture = loaded.fixture;
  state.chunks = chunks;
  const parts = [];
  const sampleCounts = [];
  const completedIds = [];
  const sampleRates = new Set();
  let firstChunkMs = null;
  let firstPcmMs = null;
  let started = 0;
  setStatus('Generating ' + loaded.fixture.characters.toLocaleString() + ' characters in ' + chunks.length + ' ordered chunks…');
  started = performance.now();
  for (let i = 0; i < chunks.length; i++) {
    const response = await state.engine.generateChunk(chunks[i], {
      onFirstPcm: () => { firstPcmMs ??= performance.now() - started; },
    });
    const chunkParts = response.parts ?? [];
    const count = chunkParts.reduce((sum, part) => sum + part.length, 0);
    sampleCounts.push(count);
    if (response.sampleRate != null) sampleRates.add(response.sampleRate);
    for (const pcm of chunkParts) parts.push(pcm);
    if (i === 0) firstChunkMs = performance.now() - started;
    completedIds.push(response.completedChunkId);
  }
  const ended = performance.now();
  const generationMs = ended - started;
  for (let i = 0; i < chunks.length; i++) {
    if (sampleCounts[i] < 1) throw new Error('Source chunk ' + i + ' returned no PCM samples.');
    if (completedIds[i] !== chunks[i].id) throw new Error('Completed source chunk ID does not match request at index ' + i);
  }
  const pcm = joinPcm(parts);
  if (sampleRates.size !== 1) throw new Error('Generated chunks did not use one consistent sample rate.');
  const sampleRate = [...sampleRates][0];
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Engine returned an invalid sample rate.');
  let finitePcm = pcm.length > 0;
  for (let i = 0; finitePcm && i < pcm.length; i++) finitePcm = Number.isFinite(pcm[i]);
  if (!finitePcm) throw new Error('Generated PCM is empty or contains a non-finite sample.');
  const pcmSha256 = await sha256(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  const receipt = {
    index,
    generationMs,
    samples: pcm.length,
    sampleRate,
    pcmSha256,
    validation: { finitePcm: true, chunkCount: chunks.length, nonemptyChunks: sampleCounts.every(count => count > 0) },
    metrics: {
      firstPcmMs,
      firstSourceChunkCompletedMs: firstChunkMs,
      audioSeconds: pcm.length / sampleRate,
      realTimeFactor: generationMs / (pcm.length / sampleRate * 1000),
      minSamplesPerChunk: Math.min(...sampleCounts),
      maxSamplesPerChunk: Math.max(...sampleCounts),
    },
  };
  if (saveAudio) receipt.audioWavBase64 = encodeWavBase64(pcm, sampleRate);
  state.chunks = null;
  setStatus('Generated ' + receipt.samples.toLocaleString() + ' samples in ' + (generationMs / 1000).toFixed(2) + ' seconds.');
  return receipt;
}

export async function dispose() {
  const engine = state.engine;
  state.engine = null;
  if (engine) await engine.dispose();
}

window.bench = { fixture, initialize, generate, dispose };
setStatus('Ready. All page code and assets are served from the local benchmark checkout.');
