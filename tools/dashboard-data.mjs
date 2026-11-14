import { readFile } from 'node:fs/promises';
import { getAssetLock } from '../lib/catalog.mjs';
import { readResult, resultPaths, sha256, median } from './results.mjs';
import { verifySource } from './provenance.mjs';
import { checkAudio } from './audio.mjs';
import { outputLengthNotes } from './output-notes.mjs';

const BACKENDS = ['cpu', 'webgpu'];
const ENVIRONMENT_COHORT_FIELDS = ['machineLabel', 'os', 'arch', 'cpu', 'logicalCores', 'ramBytes', 'chromeVersion', 'headless'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const stable = value => JSON.stringify(canonical(value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const latestOrder = (a, b) => a.result.createdAt.localeCompare(b.result.createdAt) || a.result.id.localeCompare(b.result.id);
const receiptUrl = id => `https://github.com/ngelik/tts-bench/blob/main/results/${id}/summary.md`;
const missingMetric = (reason, fields) => ({
  status: 'unavailable', reason, resultId: null, reportUrl: null, origin: null,
  createdAt: null, protocolId: null, sourceCommit: null, sourceFingerprint: null,
  environment: null, cohortKey: null, ...fields,
});

function cohortKey(result) {
  return sha256(stable({
    // Comparison cohorts omit environment.gpu so CPU null and the compatible
    // WebGPU adapter observation still group together.
    environment: Object.fromEntries(ENVIRONMENT_COHORT_FIELDS.map(key => [key, result.environment[key]])),
    sourceCommit: result.source.gitCommit,
    sourceFingerprint: result.source.manifestSha256,
    protocol: result.protocol,
    fixture: result.fixture,
  }));
}

function metricBase(result, cell) {
  return {
    status: cell.status,
    reason: cell.reason,
    resultId: result.id,
    reportUrl: receiptUrl(result.id),
    origin: result.origin,
    createdAt: result.createdAt,
    protocolId: result.protocol.id,
    sourceCommit: result.source.gitCommit,
    sourceFingerprint: result.source.manifestSha256,
    environment: structuredClone(result.environment),
    cohortKey: cohortKey(result),
  };
}

/**
 * Pick the preferred measured attempt (native before historical), unless a
 * later non-measured attempt exists. This keeps native evidence preferred
 * without hiding a later unsupported/error result.
 */
export function selectLatestAttempt(candidates) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort(latestOrder);
  const measured = sorted.filter(candidate => candidate.cell.status === 'measured');
  const preferred = [...measured].reverse().find(candidate => candidate.result.origin === 'native') ?? measured.at(-1) ?? null;
  const latestFailure = [...sorted].reverse().find(candidate => candidate.cell.status !== 'measured') ?? null;
  if (!preferred) return latestFailure ?? sorted.at(-1);
  if (latestFailure && latestOrder(latestFailure, preferred) > 0) return latestFailure;
  return preferred;
}

function collectByModelBackend(results, predicate) {
  const grouped = new Map();
  for (const result of results) {
    if (!predicate(result)) continue;
    for (const cell of result.cells) {
      const key = `${cell.model}/${cell.backendRequested}`;
      const entries = grouped.get(key) ?? [];
      entries.push({ result, cell });
      grouped.set(key, entries);
    }
  }
  return grouped;
}

function createWarmMetric(candidate) {
  if (!candidate) return missingMetric('No warm result has been submitted.', {
    medianSeconds: null, minSeconds: null, maxSeconds: null, n: null,
    firstPcmMs: null, rtf: null, audioSeconds: null,
  });
  const { result, cell } = candidate;
  const base = metricBase(result, cell);
  if (cell.status !== 'measured') return {
    ...base, medianSeconds: null, minSeconds: null, maxSeconds: null, n: null,
    firstPcmMs: null, rtf: null, audioSeconds: null,
  };
  const trials = cell.trials;
  const generationMs = trials.map(trial => trial.generationMs);
  const firstPcm = trials.map(trial => trial.metrics?.firstPcmMs).filter(finite);
  const rtfs = trials.map(trial => trial.generationMs / (trial.samples / trial.sampleRate * 1000));
  const durations = trials.map(trial => trial.samples / trial.sampleRate);
  const outputNotes = outputLengthNotes(cell);
  return {
    ...base,
    ...(outputNotes ? { outputNotes } : {}),
    medianSeconds: median(generationMs) / 1000,
    minSeconds: Math.min(...generationMs) / 1000,
    maxSeconds: Math.max(...generationMs) / 1000,
    n: trials.length,
    firstPcmMs: firstPcm.length ? median(firstPcm) : null,
    rtf: median(rtfs),
    audioSeconds: median(durations),
  };
}

export function summarizeMemoryTrials(trials) {
  const means = [];
  let peakRss = 0;
  let sampleCount = 0;
  for (const trial of trials) {
    if (trial.memory?.availability !== 'measured' || !finite(trial.metrics?.generationMeanRssBytes)) return null;
    means.push(trial.metrics.generationMeanRssBytes);
    const start = trial.memory.generationStartedAtEpochMs;
    const end = trial.memory.finalPcmAtEpochMs;
    for (const [at, rss] of trial.memory.samples) {
      if (at >= start && at <= end) {
        peakRss = Math.max(peakRss, rss);
        sampleCount++;
      }
    }
  }
  if (!means.length || !sampleCount) return null;
  return {
    meanMB: mean(means) / 1_000_000,
    peakMB: peakRss / 1_000_000,
    n: means.length,
    sampleCount,
  };
}

function createMemoryMetric(candidate) {
  if (!candidate) return missingMetric('No native cached resource result has been submitted.', {
    meanMB: null, peakMB: null, n: null, sampleCount: null, generationSeconds: null, audioSeconds: null,
  });
  const { result, cell } = candidate;
  const base = metricBase(result, cell);
  if (cell.status !== 'measured') return {
    ...base, meanMB: null, peakMB: null, n: null, sampleCount: null, generationSeconds: null, audioSeconds: null,
  };
  const summary = summarizeMemoryTrials(cell.trials);
  if (!summary) return {
    ...base, status: 'unavailable', reason: 'Generation RSS evidence is missing, unmeasured, or has no in-window samples.',
    evidenceStatus: cell.status, meanMB: null, peakMB: null, n: null, sampleCount: null, generationSeconds: null, audioSeconds: null,
  };
  return {
    ...base,
    ...summary,
    generationSeconds: median(cell.trials.map(trial => trial.generationMs / 1000)),
    audioSeconds: median(cell.trials.map(trial => trial.samples / trial.sampleRate)),
  };
}

function describeMissingScore(metric, model, backend, scenario, resource) {
  if (metric.resultId) return metric;
  if (!model.backends.includes(backend)) {
    const onlyBackend = model.backends.length === 1 && model.backends[0];
    const label = onlyBackend === 'cpu' ? 'CPU only' : onlyBackend === 'webgpu' ? 'WebGPU only' : 'No backend';
    return { ...metric, displayStatus: label, reason: 'The registered configuration supports ' +
      model.backends.map(b => b === 'cpu' ? 'CPU' : 'WebGPU').join(' and ') + '.' };
  }
  if (scenario === 'warm') {
    const reason = resource.status === 'measured'
      ? 'A full-article memory run is available in the model details. The repeated warm generation score has not been published.'
      : 'No repeated warm generation score has been published for this configuration and backend.';
    return { ...metric, displayStatus: 'No warm score', reason };
  }
  return { ...metric, displayStatus: 'No memory run' };
}

function sameSettings(a, b) {
  const { executionProviders: ignoredA, ...settingsA } = a.settings;
  const { executionProviders: ignoredB, ...settingsB } = b.settings;
  return a.voice === b.voice && a.precision === b.precision && stable(settingsA) === stable(settingsB);
}

function pairedWarm(cpu, webgpu) {
  if (!cpu || !webgpu) return false;
  const a = cpu.result, b = webgpu.result;
  const ac = cpu.cell, bc = webgpu.cell;
  if (a.origin !== 'native' || b.origin !== 'native' || ac.status !== 'measured' || bc.status !== 'measured') return false;
  if (stable(a.protocol) !== stable(b.protocol) || stable(a.fixture) !== stable(b.fixture)) return false;
  if (a.source.manifestSha256 !== b.source.manifestSha256) return false;
  for (const key of ['machineLabel', 'os', 'arch', 'cpu', 'logicalCores', 'ramBytes', 'chromeVersion', 'headless']) {
    if (a.environment[key] !== b.environment[key]) return false;
  }
  const gpuNames = new Set([a.environment.gpu, b.environment.gpu].filter(Boolean));
  if (gpuNames.size > 1) return false;
  const assets = new Map();
  for (const asset of a.assets) assets.set(asset.id, `${asset.sha256}/${asset.bytes}`);
  for (const asset of b.assets) {
    const previous = assets.get(asset.id);
    if (previous && previous !== `${asset.sha256}/${asset.bytes}`) return false;
  }
  return sameSettings(ac, bc);
}

function verifiedModelMB(model, candidates) {
  const weights = model.assets.filter(asset => asset.kind === 'model-weights');
  if (!weights.length) return null;
  const qualifying = candidates.filter(candidate => candidate?.result.origin === 'native');
  const hasVerifiedSet = qualifying.some(({ result }) => weights.every(weight =>
    result.assets.some(asset => asset.id === weight.id && asset.sha256 === weight.sha256 && asset.bytes === weight.bytes)));
  return hasVerifiedSet ? weights.reduce((sum, asset) => sum + asset.bytes, 0) / 1_000_000 : null;
}

function officialSourceUrl(model) {
  const source = model.support.sources.find(url => typeof url === 'string' && url.startsWith('https://huggingface.co/')) ?? model.support.sources[0];
  if (!source) return null;
  const match = source.match(/^(https:\/\/huggingface\.co\/[^/]+\/[^/]+)(?:\/(?:blob|tree|resolve|raw)\/[^/]+(?:\/.*)?)?$/);
  return match?.[1] ?? source;
}

function enrichAudio(entries, resultsById, selectedWarm) {
  return entries.map(entry => {
    const result = resultsById.get(entry.resultId);
    if (!result) throw new Error(`Audio manifest refers to missing result ${entry.resultId}`);
    const selected = selectedWarm.get(`${entry.model}/${entry.backend}`);
    return {
      ...structuredClone(entry),
      scenario: result.protocol.scenario,
      sourceCreatedAt: result.createdAt,
      sourceOrigin: result.origin,
      matchesSelectedWarm: selected?.result.id === entry.resultId,
      reportUrl: receiptUrl(entry.resultId),
    };
  });
}

/** Pure assembly helper. Inputs must already be validated receipts and audio entries. */
export function assembleDashboardData({ results, models, audioEntries = [] }) {
  const warmCandidates = collectByModelBackend(results, result => result.protocol.scenario === 'warm');
  const memoryCandidates = collectByModelBackend(results, result =>
    result.origin === 'native' && result.protocol.scenario === 'cached' && result.protocol.id.endsWith('-resources'));
  const selectedWarm = new Map();
  const selectedMemory = new Map();
  for (const [id, model] of Object.entries(models)) {
    for (const backend of BACKENDS) {
      const key = `${id}/${backend}`;
      selectedWarm.set(key, selectLatestAttempt((warmCandidates.get(key) ?? []).filter(x => x.cell.backendRequested === backend)));
      selectedMemory.set(key, selectLatestAttempt((memoryCandidates.get(key) ?? []).filter(x => x.cell.backendRequested === backend)));
    }
  }
  const resultsById = new Map(results.map(result => [result.id, result]));
  const audio = enrichAudio(audioEntries, resultsById, selectedWarm);
  const byModelAudio = new Map();
  for (const entry of audio) {
    const list = byModelAudio.get(entry.model) ?? [];
    list.push(entry);
    byModelAudio.set(entry.model, list);
  }
  for (const list of byModelAudio.values()) list.sort((a, b) =>
    b.sourceCreatedAt.localeCompare(a.sourceCreatedAt) || b.resultId.localeCompare(a.resultId) || a.backend.localeCompare(b.backend));

  const outputModels = Object.entries(models).sort(([a], [b]) => a.localeCompare(b)).map(([id, model]) => {
    const warm = Object.fromEntries(BACKENDS.map(backend => [backend, createWarmMetric(selectedWarm.get(`${id}/${backend}`))]));
    const memory = Object.fromEntries(BACKENDS.map(backend => [backend, createMemoryMetric(selectedMemory.get(`${id}/${backend}`))]));
    for (const backend of BACKENDS) {
      warm[backend] = describeMissingScore(warm[backend], model, backend, 'warm', memory[backend]);
      memory[backend] = describeMissingScore(memory[backend], model, backend, 'memory');
    }
    const selectedWarmCandidates = BACKENDS.map(backend => selectedWarm.get(`${id}/${backend}`));
    const preferredAudio = Object.fromEntries(BACKENDS.map(backend => [
      backend,
      (byModelAudio.get(id) ?? []).find(entry => entry.backend === backend && entry.matchesSelectedWarm) ?? null,
    ]));
    return {
      id,
      name: model.displayName,
      modelMB: verifiedModelMB(model, [...selectedWarmCandidates, ...BACKENDS.map(backend => selectedMemory.get(`${id}/${backend}`))]),
      license: { model: model.license.model, code: model.license.runtime ?? model.license.frontend ?? null },
      support: structuredClone(model.support),
      sourceUrl: officialSourceUrl(model),
      warm,
      memory,
      pairedWarm: pairedWarm(selectedWarm.get(`${id}/cpu`), selectedWarm.get(`${id}/webgpu`)),
      audio: byModelAudio.get(id) ?? [],
      preferredAudio,
    };
  });
  const retainedDates = [];
  for (const candidate of [...selectedWarm.values(), ...selectedMemory.values()]) {
    if (candidate) retainedDates.push(candidate.result.createdAt);
  }
  return {
    schemaVersion: 1,
    updatedAt: retainedDates.length ? retainedDates.sort().at(-1) : null,
    models: outputModels,
  };
}

export function verifySourcesOnce(results, cwd = process.cwd(), verifier = verifySource) {
  const seen = new Set();
  const cache = new Map();
  for (const result of results) {
    if (result.origin !== 'native') continue;
    // Call for each receipt so its claimed fingerprint is checked; the shared
    // cache still computes the committed source manifest only once per commit.
    verifier(result, cwd, cache);
    seen.add(result.source.gitCommit);
  }
  return seen.size;
}

export async function buildDashboardData() {
  const lock = getAssetLock();
  const paths = await resultPaths('results');
  const results = await Promise.all(paths.map(path => readResult(path, { publication: true })));
  const resultIds = new Set();
  for (const result of results) {
    if (resultIds.has(result.id)) throw new Error(`Duplicate result id: ${result.id}`);
    resultIds.add(result.id);
  }
  const audioManifest = JSON.parse(await readFile('audio/manifest.json', 'utf8'));
  if (audioManifest.schemaVersion !== 1 || !Array.isArray(audioManifest.entries)) throw new Error('Invalid audio manifest');
  // Existing audio validation also verifies every clip, its manifest provenance,
  // attribution and the source receipt. Reuse it rather than duplicating those rules.
  await checkAudio();
  verifySourcesOnce(results);
  return assembleDashboardData({ results, models: lock.models, audioEntries: audioManifest.entries });
}
