import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getAssetLock } from '../lib/catalog.mjs';
import { MAX_RESOURCE_RECEIPT_BYTES, validateResult, sha256, median } from './results.mjs';
import { verifySource } from './provenance.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKENDS = ['cpu', 'webgpu'];
const SCENARIOS = ['warm', 'cached', 'cold'];
const ENVIRONMENT_KEYS = ['machineLabel', 'os', 'arch', 'cpu', 'logicalCores', 'ramBytes', 'chromeVersion', 'headless'];
const fail = message => { throw new Error(message); };
const ensure = (condition, message) => { if (!condition) fail(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const markdownText = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', ' ');
const xml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const format = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : null;
const medianPresent = values => values.length ? median(values) : null;
const divideOrMissing = (value, divisor) => Number.isFinite(value) ? value / divisor : null;

function assertNoSymlink(path) {
  const rel = relative(ROOT, path);
  ensure(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'Paths must stay inside this checkout');
  let current = ROOT;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) fail('Symlink paths are not allowed in campaign reports or submitted results');
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

// Synchronous lstat keeps the path walk above simple and runs only on small Git paths.
import { lstatSync } from 'node:fs';

function repoPath(value, prefix) {
  ensure(typeof value === 'string' && value.length > 0 && !isAbsolute(value), 'Use a checkout-relative path');
  const path = resolve(ROOT, value);
  const rel = relative(ROOT, path).split(sep).join('/');
  ensure(rel === prefix || rel.startsWith(prefix + '/'), `Path must be inside ${prefix}`);
  assertNoSymlink(path);
  return path;
}

async function committedResult(id, expectedHash = null) {
  ensure(typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(id), 'Invalid result ID in campaign input manifest');
  const file = resolve(ROOT, 'results', id, 'result.json');
  assertNoSymlink(file);
  const bytes = await readFile(file);
  ensure(bytes.length < MAX_RESOURCE_RECEIPT_BYTES, `Result ${id} exceeds the public receipt size limit`);
  const digest = sha256(bytes);
  if (expectedHash !== null) ensure(digest === expectedHash, `Committed result hash changed: ${id}`);
  let data;
  try { data = validateResult(JSON.parse(bytes), { publication: true }); }
  catch (error) { throw new Error(`Invalid submitted result ${id}: ${error.message}`); }
  ensure(data.id === id, `Result directory/id mismatch for ${id}`);
  return { data, digest, file };
}

async function suppliedResult(file) {
  const absolute = resolve(process.cwd(), file);
  assertNoSymlink(absolute);
  ensure(relative(resolve(ROOT, 'results'), absolute).startsWith('..') === false,
    'Campaign inputs must be submitted receipts under results/<id>/result.json');
  const raw = await readFile(absolute);
  ensure(raw.length < MAX_RESOURCE_RECEIPT_BYTES, 'Result file exceeds the public receipt size limit');
  let data;
  try { data = validateResult(JSON.parse(raw), { publication: true }); }
  catch (error) { throw new Error(`Invalid submitted result ${file}: ${error.message}`); }
  ensure(absolute === resolve(ROOT, 'results', data.id, 'result.json'), 'Campaign inputs must be the committed results/<id>/result.json path');
  const actual = await realpath(absolute);
  ensure(actual === absolute, 'Submitted result paths must not resolve through symlinks');
  return { data, digest: sha256(raw), file: absolute };
}

function modelWeights(modelId, manifest, entries) {
  const model = manifest[modelId];
  ensure(model, `Model is absent from assets.lock.json: ${modelId}`);
  const weights = model.assets?.filter(asset => asset.kind === 'model-weights') ?? [];
  ensure(weights.length > 0, `No pinned model-weight assets in manifest for ${modelId}`);
  for (const entry of entries) {
    for (const weight of weights) {
      ensure(entry.data.assets.some(asset => asset.id === weight.id && asset.sha256 === weight.sha256 && asset.bytes === weight.bytes),
        `Result ${entry.data.id} does not match pinned model weight ${weight.id}`);
    }
  }
  return weights.reduce((total, asset) => total + asset.bytes, 0);
}

export function validateCampaignInputs(entries, manifest = getAssetLock().models, { sourceCache = new Map(), cwd = ROOT } = {}) {
  ensure(Array.isArray(entries) && entries.length > 0, 'Provide at least one submitted result');
  const byKey = new Map(), settingsByModel = new Map(), protocolByScenario = new Map(), gpuNames = new Set();
  let base = null;
  const modelEntries = new Map();

  for (const entry of entries) {
    const data = validateResult(entry.data, { publication: true });
    ensure(data.origin === 'native', 'Campaign overview accepts native submitted results only');
    verifySource(data, cwd, sourceCache);
    if (!base) base = data;
    else {
      ensure(data.source.gitCommit === base.source.gitCommit && data.source.manifestSha256 === base.source.manifestSha256,
        'Campaign receipts must share one committed source and source fingerprint');
      for (const key of ENVIRONMENT_KEYS) ensure(data.environment[key] === base.environment[key], `Campaign receipts must share the exact recorded environment (${key})`);
      ensure(stable(data.fixture) === stable(base.fixture), 'Campaign receipts must share one fixture');
    }
    if (data.environment.gpu) gpuNames.add(data.environment.gpu);
    ensure(gpuNames.size <= 1, 'Campaign receipts report different GPU adapters');

    const scenario = data.protocol.scenario;
    ensure(SCENARIOS.includes(scenario), `Campaign overview does not combine ${scenario} results`);
    const previousProtocol = protocolByScenario.get(scenario);
    if (previousProtocol) ensure(stable(previousProtocol) === stable(data.protocol), `Protocol or timing boundaries differ within ${scenario}`);
    else protocolByScenario.set(scenario, data.protocol);

    if (scenario === 'warm') {
      ensure(data.protocol.warmupRuns === 1 && data.protocol.repetitions >= 5, 'Warm campaign results require one full warm-up and at least five scored repetitions');
      ensure(!data.protocol.id.endsWith('-resources'), 'Warm score cells cannot substitute for cached resource measurements');
    } else if (scenario === 'cached') {
      ensure(data.protocol.id.endsWith('-resources'), 'Cached campaign results must use the --resources protocol');
      ensure(data.protocol.warmupRuns === 0 && data.protocol.repetitions === 1, 'Cached resource diagnostics require one full article and no warm-up');
    } else {
      ensure(data.protocol.warmupRuns === 0 && data.protocol.repetitions === 1, 'Cold transfer diagnostics require one article and no warm-up');
    }

    const localCellIds = new Set();
    for (const cell of data.cells) {
      ensure(data.protocol.scenario !== 'cold' || cell.backendRequested === 'cpu', 'Cold transfer cells must use CPU only');
      const key = `${cell.model}/${cell.backendRequested}/${scenario}`;
      ensure(!byKey.has(key) && !localCellIds.has(key), `More than one submitted result for ${key}`);
      localCellIds.add(key);
      const model = manifest[cell.model];
      ensure(model, `Model is absent from assets.lock.json: ${cell.model}`);
      ensure(cell.status !== 'measured' || model.backends.includes(cell.backendRequested), `Manifest does not declare measured ${cell.backendRequested} for ${cell.model}`);
      if (scenario === 'cached' && cell.status === 'measured') {
        ensure(cell.trials.length === 1 && cell.trials[0].memory?.availability === 'measured' &&
          Number.isFinite(cell.trials[0].metrics?.generationMeanRssBytes),
        `Cached measured result ${data.id} lacks a measured generation-RAM average`);
      }

      const modelRows = modelEntries.get(cell.model) ?? [];
      modelRows.push({ ...entry, data, cell, scenario });
      modelEntries.set(cell.model, modelRows);

      if (cell.status === 'measured') {
        const { executionProviders, ...nonBackendSettings } = cell.settings;
        const signature = stable({ voice: cell.voice, precision: cell.precision, settings: nonBackendSettings });
        const prior = settingsByModel.get(cell.model);
        if (prior) ensure(prior === signature, `Voice, precision or non-backend settings differ across protocols for ${cell.model}`);
        else settingsByModel.set(cell.model, signature);
      }

      byKey.set(key, { ...entry, data, cell, scenario });
    }
    ensure(localCellIds.size > 0, `Result ${data.id} has no cells`);
  }

  const modelData = new Map();
  for (const [modelId, rows] of modelEntries) {
    const weights = modelWeights(modelId, manifest, rows);
    modelData.set(modelId, { id: modelId, manifest: manifest[modelId], weights, rows });
  }
  const models = [...modelData.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { base, models, byKey, modelData, gpuNames: [...gpuNames].sort() };
}

function statusLabel(row) {
  if (!row) return 'Not submitted';
  if (row.cell.status === 'unsupported') return 'Unsupported';
  if (row.cell.status === 'error') return 'Error';
  return 'Measured';
}

function outcomeNotes(byKey) {
  const unique = new Map();
  for (const row of byKey.values()) {
    if (row.cell.status === 'measured') continue;
    const detail = String(row.cell.reason ?? 'No reason recorded');
    const signature = JSON.stringify([row.cell.model, row.cell.backendRequested, row.cell.status, detail]);
    if (!unique.has(signature)) unique.set(signature, { row, detail });
  }
  return [...unique.values()].sort((a, b) =>
    a.row.cell.model.localeCompare(b.row.cell.model) ||
    a.row.cell.backendRequested.localeCompare(b.row.cell.backendRequested) ||
    a.row.cell.status.localeCompare(b.row.cell.status) ||
    a.detail.localeCompare(b.detail));
}

function summarizeWarm(row) {
  if (!row || row.cell.status !== 'measured') return null;
  const trials = row.cell.trials;
  const generation = trials.map(trial => trial.generationMs / 1000);
  const firstPcm = trials.map(trial => trial.metrics?.firstPcmMs).filter(Number.isFinite);
  const audio = trials.map(trial => trial.samples / trial.sampleRate);
  const rtf = trials.map((trial, index) => trial.generationMs / (audio[index] * 1000));
  return {
    n: trials.length,
    generationMedianSeconds: median(generation),
    generationMinSeconds: Math.min(...generation),
    generationMaxSeconds: Math.max(...generation),
    firstPcmMedianMs: medianPresent(firstPcm),
    firstPcmN: firstPcm.length,
    audioMedianSeconds: median(audio),
    rtfMedian: median(rtf),
  };
}

function summarizeCached(row) {
  if (!row) return null;
  if (row.cell.status !== 'measured') return null;
  const trial = row.cell.trials[0];
  if (!trial) return null;
  if (trial.memory?.availability !== 'measured' || !Number.isFinite(trial.metrics?.generationMeanRssBytes)) return null;
  const peakRss = trial.memory.samples.reduce((peak, sample) => Math.max(peak, sample[1]), 0);
  return { n: row.cell.trials.length, meanRssBytes: trial.metrics.generationMeanRssBytes,
    peakRssBytes: peakRss,
    sampleCount: trial.metrics.generationRssSampleCount };
}

function summarizeCold(row) {
  if (!row || row.cell.status !== 'measured' || !row.cell.trials.length) return null;
  const trials = row.cell.trials;
  const med = key => medianPresent(trials.map(trial => trial.metrics?.[key]).filter(Number.isFinite));
  return { n: trials.length, downloadBytes: med('downloadBytes'), idealSeconds: med('idealDownloadSecondsAt1Mbps'), loadMs: med('loadMs') };
}

function displayCell(row, value, unit, digits = 2) {
  if (!row) return 'Not submitted';
  if (row.cell.status !== 'measured') return markdownText(statusLabel(row));
  if (!Number.isFinite(value)) return 'Not recorded';
  return `${format(value, digits)} ${unit}`;
}

function resultLink(reportDir, row) {
  if (!row) return 'Not submitted';
  const target = resolve(ROOT, 'results', row.data.id, 'summary.md');
  const href = relative(reportDir, target).split(sep).join('/');
  return `[Report](${href})`;
}

function markdownReport(prepared, reportDir) {
  const { base, models, byKey, gpuNames } = prepared;
  const hasCold = [...byKey.values()].some(row => row.scenario === 'cold');
  const cell = (model, backend, scenario) => byKey.get(`${model}/${backend}/${scenario}`) ?? null;
  const warm = (model, backend) => summarizeWarm(cell(model, backend, 'warm'));
  const cached = (model, backend) => summarizeCached(cell(model, backend, 'cached'));
  const cold = model => summarizeCold(cell(model, 'cpu', 'cold'));
  const weightMB = model => model.weights / 1_000_000;
  const links = (model, backend, scenario) => resultLink(reportDir, cell(model, backend, scenario));
  const gpuAvailability = model => model.manifest.backends.includes('webgpu') ? null : 'Unsupported (not declared in manifest)';

  let md = `# Browser TTS campaign overview\n\n`;
  md += `**Cohort:** native headed-Chrome results from source commit \`${base.source.gitCommit}\` (source fingerprint \`${base.source.manifestSha256}\`), on ${markdownText(base.environment.machineLabel)} · ${markdownText(base.environment.os)} · ${markdownText(base.environment.cpu)} · ${markdownText(base.environment.chromeVersion)} · GPU ${markdownText(gpuNames.join(', ') || 'not reported')}. Fixture: \`${base.fixture.id}\`, ${base.fixture.characters.toLocaleString('en-US')} characters / ${base.fixture.chunks} chunks, SHA-256 \`${base.fixture.sha256}\`.\n\n`;
  md += `The included receipts share one source, exact environment and fixture; voice, precision and non-backend settings are checked per model. The recorded non-backend model settings match; \`executionProviders\` identifies the requested runtime providers. Scenarios remain separate and are never pooled. Model support and terms: [voice/language counts](../../docs/MODEL_SUPPORT.md) · [licensing and publication boundaries](../../docs/LICENSING.md).\n\n`;
  md += `## Warm generation\n\n`;
  md += `Full warm workload: one excluded full-article warm-up and at least five scored 20,000-character / 93-chunk repetitions. Generation is the benchmark timer; values summarize scored repetitions only. First PCM is median of recorded per-trial values. Audio duration and RTF are reconciled from output samples, sample rate and generation time.\n\n`;
  md += `| Model | CPU generation median (min–max) | WebGPU generation median (min–max) | CPU first PCM median | WebGPU first PCM median | CPU audio / RTF median | WebGPU audio / RTF median |\n|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const model of models) {
    const cpuEntry = cell(model.id, 'cpu', 'warm'), gpuEntry = cell(model.id, 'webgpu', 'warm');
    const cpu = warm(model.id, 'cpu'), gpu = warm(model.id, 'webgpu');
    const generation = (entry, summary) => {
      if (!entry) return 'Not submitted';
      if (entry.cell.status !== 'measured') return markdownText(statusLabel(entry));
      if (!summary) return 'Not recorded';
      return `${format(summary.generationMedianSeconds)} s (${format(summary.generationMinSeconds)}–${format(summary.generationMaxSeconds)}; n=${summary.n})`;
    };
    const firstPcm = (entry, summary) => {
      if (!entry) return 'Not submitted';
      if (entry.cell.status !== 'measured') return markdownText(statusLabel(entry));
      return summary?.firstPcmMedianMs === null || !summary ? 'Not recorded' : `${format(summary.firstPcmMedianMs)} ms (n=${summary.firstPcmN})`;
    };
    const audioRtf = (entry, summary, backend) => {
      if (!entry) return backend === 'webgpu' ? gpuAvailability(model) ?? 'Not submitted' : 'Not submitted';
      if (entry.cell.status !== 'measured') return markdownText(statusLabel(entry));
      return summary ? `${format(summary.audioMedianSeconds)} s / ${format(summary.rtfMedian, 3)}` : 'Not recorded';
    };
    const gpuGeneration = gpuEntry ? generation(gpuEntry, gpu) : gpuAvailability(model) ?? 'Not submitted';
    const gpuFirst = gpuEntry ? firstPcm(gpuEntry, gpu) : gpuAvailability(model) ?? 'Not submitted';
    const gpuAudio = gpuEntry ? audioRtf(gpuEntry, gpu, 'webgpu') : gpuAvailability(model) ?? 'Not submitted';
    md += `| ${markdownText(model.manifest.displayName ?? model.id)} | ${generation(cpuEntry, cpu)} | ${gpuGeneration} | ${firstPcm(cpuEntry, cpu)} | ${gpuFirst} | ${audioRtf(cpuEntry, cpu, 'cpu')} | ${gpuAudio} |\n`;
  }

  const resourceHeading = hasCold ? 'Resource and cold-initialization diagnostics' : 'Resource diagnostics';
  const resourceIntro = hasCold
    ? 'Cached RAM is the mean process-tree RSS sampled during one full generation in a separate one-tab Chrome session. It includes browser baseline and inference workers, may double-count shared pages, and is not model-only RAM or VRAM. The peak column is the largest RSS sample inside the same generation window; process RSS does not measure total CPU plus GPU allocations. Cold initialization measures timed model/runtime initialization after page open against the local loopback asset server; it excludes page boot and internet download. HTTP byte counts include harness/runtime assets served during initialization, not only model weights. Decimal MB = 1,000,000 bytes; ideal 1 Mbps transfer time is bytes / 125,000 and is an estimate, not observed network time.'
    : 'Cached RAM is the mean process-tree RSS sampled during one full generation in a separate one-tab Chrome session. It includes browser baseline and inference workers, may double-count shared pages, and is not model-only RAM or VRAM. The peak column is the largest RSS sample inside the same generation window; process RSS does not measure total CPU plus GPU allocations. Decimal MB = 1,000,000 bytes.';
  md += `\n## ${resourceHeading}\n\n${resourceIntro}\n\n`;
  const resourceHeaders = ['Model', 'CPU mean Chrome RSS', 'CPU max sampled RSS', 'WebGPU mean Chrome RSS', 'WebGPU max sampled RSS', 'Pinned model weights'];
  if (hasCold) resourceHeaders.push('CPU cold init HTTP bytes', 'Ideal 1 Mbps estimate', 'Observed CPU cold init');
  md += `|${resourceHeaders.map(value => ` ${value} `).join('|')}|\n|${resourceHeaders.map((_, index) => index === 0 ? '---' : '---:').join('|')}|\n`;
  for (const model of models) {
    const cpuCacheEntry = cell(model.id, 'cpu', 'cached'), gpuCacheEntry = cell(model.id, 'webgpu', 'cached'), coldEntry = cell(model.id, 'cpu', 'cold');
    const cpuRam = cached(model.id, 'cpu'), gpuRam = cached(model.id, 'webgpu'), coldData = cold(model.id);
    const ram = (entry, summary, backend) => {
      if (!entry) return backend === 'webgpu' && !model.manifest.backends.includes('webgpu') ? 'Unsupported (not declared in manifest)' : 'Not submitted';
      if (entry.cell.status !== 'measured') return markdownText(statusLabel(entry));
      if (!summary) return `Unavailable (${markdownText(entry.cell.trials[0]?.memory?.availability ?? 'missing memory evidence')})`;
      return `${format(summary.meanRssBytes / 1_000_000)} MB (n=1; ${summary.sampleCount} samples)`;
    };
    const ramPeak = (entry, summary, backend) => {
      if (!entry) return backend === 'webgpu' && !model.manifest.backends.includes('webgpu') ? 'Unsupported (not declared in manifest)' : 'Not submitted';
      if (entry.cell.status !== 'measured') return markdownText(statusLabel(entry));
      if (!summary) return `Unavailable (${markdownText(entry.cell.trials[0]?.memory?.availability ?? 'missing memory evidence')})`;
      return `${format(summary.peakRssBytes / 1_000_000)} MB (sampled max; n=1; ${summary.sampleCount} samples)`;
    };
    const coldValue = (value, unit, digits = 2) => {
      if (!coldEntry) return 'Not submitted';
      if (coldEntry.cell.status !== 'measured') return markdownText(statusLabel(coldEntry));
      return Number.isFinite(value) ? `${format(value, digits)} ${unit} (n=${coldData?.n ?? 0})` : 'Not recorded';
    };
    const resourceCells = [
      markdownText(model.manifest.displayName ?? model.id),
      ram(cpuCacheEntry, cpuRam, 'cpu'),
      ramPeak(cpuCacheEntry, cpuRam, 'cpu'),
      ram(gpuCacheEntry, gpuRam, 'webgpu'),
      ramPeak(gpuCacheEntry, gpuRam, 'webgpu'),
      `${format(weightMB(model))} MB`,
    ];
    if (hasCold) resourceCells.push(
      coldValue((coldData?.downloadBytes ?? NaN) / 1_000_000, 'MB'),
      coldValue(coldData?.idealSeconds ?? NaN, 's', 3),
      coldValue((coldData?.loadMs ?? NaN) / 1000, 's'),
    );
    md += `|${resourceCells.map(value => ` ${value} `).join('|')}|\n`;
  }

  md += `\n## Submitted receipts\n\nEach cell links to its submitted receipt and full per-run report. Missing entries are labeled, not treated as zero.\n\n`;
  const receiptHeaders = ['Model', 'Warm CPU', 'Warm WebGPU', 'Cached CPU RAM', 'Cached WebGPU RAM'];
  if (hasCold) receiptHeaders.push('Cold CPU');
  receiptHeaders.push('Support', 'License');
  md += `|${receiptHeaders.map(value => ` ${value} `).join('|')}|\n|${receiptHeaders.map(() => '---').join('|')}|\n`;
  for (const model of models) {
    const gpuWarm = cell(model.id, 'webgpu', 'warm'), gpuCache = cell(model.id, 'webgpu', 'cached');
    const receiptCells = [
      markdownText(model.manifest.displayName ?? model.id),
      links(model.id, 'cpu', 'warm'),
      gpuWarm ? resultLink(reportDir, gpuWarm) : model.manifest.backends.includes('webgpu') ? 'Not submitted' : 'Unsupported (manifest)',
      links(model.id, 'cpu', 'cached'),
      gpuCache ? resultLink(reportDir, gpuCache) : model.manifest.backends.includes('webgpu') ? 'Not submitted' : 'Unsupported (manifest)',
    ];
    if (hasCold) receiptCells.push(links(model.id, 'cpu', 'cold'));
    receiptCells.push(`[Support details](../../docs/MODEL_SUPPORT.md#${model.id})`, '[Terms](../../docs/LICENSING.md)');
    md += `|${receiptCells.map(value => ` ${value} `).join('|')}|\n`;
  }
  const outcomes = outcomeNotes(byKey);
  md += `\n## Unsupported and error outcomes\n\n`;
  if (!outcomes.length) md += `All submitted cells are measured.\n\n`;
  else {
    md += `Reasons are listed once per model, backend, status and reason; the receipt table above retains links for every submitted cell.\n\n`;
    md += `| Model | Backend | Status | Reason | Source receipt |\n|---|---|---|---|---|\n`;
    for (const { row, detail } of outcomes) {
      md += `| ${markdownText(row.cell.model)} | ${row.cell.backendRequested} | ${statusLabel(row)} | ${markdownText(detail)} | ${resultLink(reportDir, row)} |\n`;
    }
    md += `\n`;
  }
  md += `\n![Campaign metrics chart](overview.svg)\n\n`;
  md += `This overview reports measured browser execution and resource diagnostics only. It does not rank speech quality or establish intelligibility. Compare scenarios only within their named protocol boundaries; unsupported, unavailable, unrecorded and not-submitted values remain distinct.\n`;
  return md;
}

function svgNumber(value) {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.1) return value.toFixed(3);
  return value.toPrecision(2);
}

function chartReport(prepared) {
  const { models, byKey } = prepared;
  const hasCold = [...byKey.values()].some(row => row.scenario === 'cold');
  const get = (model, backend, scenario) => byKey.get(`${model}/${backend}/${scenario}`) ?? null;
  const panelSpecs = [
    { title: 'Warm generation median', unit: 'seconds', scenario: 'warm', value: (row, summary) => summary?.generationMedianSeconds, summarize: summarizeWarm, key: 'generationMedianSeconds' },
    { title: 'First PCM median', unit: 'milliseconds', scenario: 'warm', value: (row, summary) => summary?.firstPcmMedianMs, summarize: summarizeWarm, key: 'firstPcmMedianMs' },
    { title: 'Real-time factor median', unit: 'ratio', scenario: 'warm', value: (row, summary) => summary?.rtfMedian, summarize: summarizeWarm, key: 'rtfMedian' },
    { title: 'Warm output audio duration median', unit: 'seconds', scenario: 'warm', value: (row, summary) => summary?.audioMedianSeconds, summarize: summarizeWarm },
    { title: 'Mean Chrome RSS during generation', unit: 'decimal MB', scenario: 'cached', value: (row, summary) => summary ? summary.meanRssBytes / 1_000_000 : null, summarize: summarizeCached, key: 'meanRssBytes' },
    { title: 'Pinned model weights', unit: 'decimal MB', scenario: 'size', single: true, value: model => model.weights / 1_000_000 },
    ...(hasCold ? [
    { title: 'CPU cold initialization HTTP bytes', unit: 'loopback-served decimal MB · label shows ideal 1 Mbps estimate', scenario: 'cold', single: true, value: (model, row) => divideOrMissing(summarizeCold(row)?.downloadBytes, 1_000_000), text: (model, row) => {
      const summary = summarizeCold(row);
      if (!summary || !Number.isFinite(summary.downloadBytes)) return null;
      const ideal = Number.isFinite(summary.idealSeconds) ? `${svgNumber(summary.idealSeconds)} s ideal` : 'ideal time not recorded';
      return `${svgNumber(summary.downloadBytes / 1_000_000)} MB · ${ideal}`;
    } },
    { title: 'Observed CPU cold initialization time', unit: 'seconds after page open', scenario: 'cold', single: true, value: (model, row) => {
      const summary = summarizeCold(row);
      return divideOrMissing(summary?.loadMs, 1000);
    }, text: (model, row) => {
      const summary = summarizeCold(row);
      return Number.isFinite(summary?.loadMs) ? `${svgNumber(summary.loadMs / 1000)} s observed` : null;
    } },
    ] : []),
  ];
  const width = 1440, panelW = 684, gapX = 24, gapY = 20, top = 122;
  const rowHeight = 56, panelH = 120 + models.length * rowHeight;
  const panelRows = Math.ceil(panelSpecs.length / 2);
  const height = top + panelH * panelRows + gapY * (panelRows - 1) + 34;
  const outputs = [];
  for (let panelIndex = 0; panelIndex < panelSpecs.length; panelIndex++) {
    const spec = panelSpecs[panelIndex];
    const col = panelIndex % 2, rowIndex = Math.floor(panelIndex / 2);
    const x = 24 + col * (panelW + gapX), y = top + rowIndex * (panelH + gapY);
    const labelW = 175, plotX = x + labelW, plotW = panelW - labelW - 28, labelRoom = 190, barAreaW = plotW - labelRoom;
    const series = [];
    for (const model of models) {
      if (spec.single && spec.scenario === 'size') series.push({ model, backend: 'model', value: spec.value(model), status: 'Measured', label: `${model.manifest.displayName ?? model.id}` });
      else if (spec.single) {
        const entry = get(model.id, 'cpu', spec.scenario);
        const value = spec.value(model, entry);
        const status = !entry ? 'Not submitted' : entry.cell.status === 'measured' ? Number.isFinite(value) ? 'Measured' : 'Not recorded'
          : entry.cell.status === 'unsupported' ? 'Unsupported' : 'Error';
        series.push({ model, backend: 'cpu', value: Number.isFinite(value) ? value : null,
          status, label: spec.text(model, entry) });
      } else {
        for (const backend of BACKENDS) {
          const entry = get(model.id, backend, spec.scenario);
          const summary = entry ? spec.summarize(entry) : null;
          const value = entry ? spec.value(entry, summary) : null;
          const unavailable = !entry && backend === 'webgpu' && !model.manifest.backends.includes('webgpu')
            ? 'Unsupported (manifest)' : !entry ? 'Not submitted' : entry.cell.status === 'measured' ? 'Not recorded' : entry.cell.status === 'unsupported' ? 'Unsupported' : 'Error';
          series.push({ model, backend, value: Number.isFinite(value) ? value : null, status: unavailable });
        }
      }
    }
    const values = series.map(item => item.value).filter(Number.isFinite).filter(value => value > 0);
    const max = values.length ? Math.max(...values) : 0;
    const position = value => {
      if (!Number.isFinite(value) || value <= 0 || !values.length) return 0;
      return max === 0 ? 0 : value / max * barAreaW;
    };
    outputs.push(`<g><rect x="${x}" y="${y}" width="${panelW}" height="${panelH}" rx="18" fill="#ffffff" stroke="#d9e0de"/><text x="${x + 20}" y="${y + 31}" font-size="20" font-weight="700" fill="#183b35">${xml(spec.title)}</text><text x="${x + 20}" y="${y + 51}" font-size="12" fill="#60716d">${xml(spec.unit)} · zero-baseline linear scale</text>`);
    if (!values.length) outputs.push(`<text x="${plotX}" y="${y + 100}" font-size="14" fill="#667773">No measured values</text>`);
    const axisY = y + 76;
    if (values.length) {
      const ticks = [0, max / 2, max];
      for (const tick of ticks) {
        const px = max ? tick / max * barAreaW : 0;
        outputs.push(`<path d="M${plotX + px} ${axisY}V${y + panelH - 20}" stroke="#e8eeeb"/><text x="${plotX + px}" y="${axisY - 7}" text-anchor="middle" font-size="10" fill="#667773">${tick === 0 ? '0' : svgNumber(tick)}</text>`);
      }
    }
    for (const [modelIndex, model] of models.entries()) {
      const cy = y + 100 + modelIndex * rowHeight;
      const displayName = model.manifest.displayName ?? model.id;
      outputs.push(`<text x="${x + 18}" y="${cy + 10}" font-size="12" font-weight="600" fill="#243f39"><title>${xml(displayName)}</title>${xml(displayName.length > 24 ? displayName.slice(0, 23) + '…' : displayName)}</text>`);
      const cells = series.filter(item => item.model.id === model.id);
      for (const [seriesIndex, item] of cells.entries()) {
        const barY = cy + (spec.single ? 23 : 17 + seriesIndex * 16);
        const barH = spec.single ? 13 : 10;
        const color = item.backend === 'webgpu' ? '#bf6a2f' : item.backend === 'cpu' ? '#27786b' : '#4b708e';
        const seriesLabel = item.backend === 'webgpu' ? 'WebGPU' : item.backend === 'cpu' ? 'CPU' : 'Weights';
        outputs.push(`<text x="${x + 18}" y="${barY + 9}" font-size="9" fill="#78847f">${seriesLabel}</text>`);
        if (item.value !== null) {
          const barW = Math.max(1, position(item.value));
          const label = spec.text && spec.single ? item.label : `${svgNumber(item.value)} ${spec.unit}`;
          outputs.push(`<rect x="${plotX}" y="${barY}" width="${barW.toFixed(2)}" height="${barH}" rx="5" fill="${color}"/><text x="${plotX + barAreaW + 8}" y="${barY + 9}" font-size="10" fill="#263d37"><title>${xml(label)}</title>${xml(label)}</text>`);
        } else {
          outputs.push(`<text x="${plotX + 3}" y="${barY + 9}" font-size="10" fill="#83908b">${xml(item.status)}</text>`);
        }
      }
    }
    outputs.push('</g>');
  }

  const panelNames = panelSpecs.map(spec => spec.title).join(', ');
  const coldDescription = hasCold
    ? ' Cold panels report CPU initialization after page open against the local loopback server; HTTP bytes include harness assets, and the 1 Mbps figure is an estimate.'
    : '';
  const footer = hasCold
    ? 'MB uses decimal bytes. RSS includes Chrome baseline and workers; peak is the largest generation-window sample. HTTP transfer includes harness assets. RSS is not total CPU plus GPU memory; missing and unsupported values are not zero.'
    : 'MB uses decimal bytes. RSS includes Chrome baseline and workers; peak is the largest generation-window sample. RSS is not total CPU plus GPU memory; missing and unsupported values are not zero.';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="campaign-title campaign-desc"><title id="campaign-title">Browser TTS campaign metrics</title><desc id="campaign-desc">${panelSpecs.length} separate panels show ${xml(panelNames)}. CPU and WebGPU bars appear when measured; unsupported and missing evidence are labeled. Scenarios are not pooled and this chart does not rate speech quality.${xml(coldDescription)}</desc><rect width="100%" height="100%" fill="#f4f7f4"/><g font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fill="#183b35"><text x="34" y="48" font-size="30" font-weight="750">Browser TTS · campaign overview</text><text x="34" y="77" font-size="14" fill="#526c65">${xml(prepared.base.environment.machineLabel)} · ${xml(prepared.base.environment.chromeVersion)} · ${xml(prepared.base.fixture.characters.toLocaleString('en-US'))} characters / ${xml(prepared.base.fixture.chunks)} chunks</text><text x="34" y="99" font-size="12" fill="#62736d">CPU / WASM · WebGPU with allowed CPU fallback · not a quality ranking</text>${outputs.join('')}<text x="30" y="${height - 17}" font-size="11" fill="#64746f">${xml(footer)}</text></g></svg>\n`;
}

export function renderCampaignOverview(entries, { reportDir, manifest = getAssetLock().models, cwd = ROOT, sourceCache = new Map() } = {}) {
  const sortedEntries = [...entries].sort((a, b) => a.data.id.localeCompare(b.data.id));
  const prepared = validateCampaignInputs(sortedEntries, manifest, { cwd, sourceCache });
  return {
    overviewMd: markdownReport(prepared, reportDir),
    overviewSvg: chartReport(prepared),
  };
}

function inputsManifest(entries) {
  return { schemaVersion: 1, results: entries.map(entry => ({ id: entry.data.id, sha256: entry.digest })).sort((a, b) => a.id.localeCompare(b.id)) };
}
function checksumsFor(markdown, svg, inputsBytes) {
  return { 'overview.md': sha256(Buffer.from(markdown)), 'overview.svg': sha256(Buffer.from(svg)), 'inputs.json': sha256(inputsBytes) };
}
function outputChecksums(entries) { return Buffer.from(JSON.stringify(entries, null, 2) + '\n'); }

async function ensureNoUnexpectedFiles(directory) {
  const names = (await readdir(directory)).sort();
  ensure(JSON.stringify(names) === JSON.stringify(['checksums.json', 'inputs.json', 'overview.md', 'overview.svg']),
    'Campaign report directory must contain exactly checksums.json, inputs.json, overview.md and overview.svg');
}

async function writeCampaignReport(outValue, inputFiles) {
  const out = repoPath(outValue, 'reports');
    ensure(relative(ROOT, out).split(sep).length === 2 && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(relative(ROOT, out).split(sep)[1]),
    'Campaign report output must be reports/<safe-name>');
  const entries = [];
  for (const file of inputFiles) entries.push(await suppliedResult(file));
  const seenIds = new Set();
  for (const entry of entries) { ensure(!seenIds.has(entry.data.id), `Duplicate result input: ${entry.data.id}`); seenIds.add(entry.data.id); }
  const rendered = renderCampaignOverview(entries, { reportDir: out });
  const manifest = inputsManifest(entries);
  const inputsBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const checksums = checksumsFor(rendered.overviewMd, rendered.overviewSvg, inputsBytes);
  await mkdir(out, { recursive: true });
  for (const name of await readdir(out)) ensure(['checksums.json', 'inputs.json', 'overview.md', 'overview.svg'].includes(name), `Refusing to overwrite unrelated file in ${out}`);
  await writeFile(join(out, 'overview.md'), rendered.overviewMd);
  await writeFile(join(out, 'overview.svg'), rendered.overviewSvg);
  await writeFile(join(out, 'inputs.json'), inputsBytes);
  await writeFile(join(out, 'checksums.json'), outputChecksums(checksums));
  return { out, resultCount: entries.length, models: new Set(entries.flatMap(entry => entry.data.cells.map(cell => cell.model))).size };
}

async function checkCampaignReport(reportValue, { log = true } = {}) {
  const directory = repoPath(reportValue, 'reports');
  ensure(relative(ROOT, directory).split(sep).length === 2 && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(relative(ROOT, directory).split(sep)[1]),
    'Campaign report path must be reports/<safe-name>');
  await ensureNoUnexpectedFiles(directory);
  const inputsBytes = await readFile(join(directory, 'inputs.json'));
  let manifest;
  try { manifest = JSON.parse(inputsBytes); } catch { fail('Invalid campaign inputs.json'); }
  ensure(object(manifest) && manifest.schemaVersion === 1 && Array.isArray(manifest.results) && manifest.results.length > 0,
    'Invalid campaign input manifest');
  const ids = manifest.results.map(entry => entry?.id);
  ensure(ids.every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(id)), 'Invalid campaign input result ID');
  ensure(JSON.stringify(ids) === JSON.stringify([...new Set(ids)].sort((a, b) => a.localeCompare(b))), 'Campaign input IDs must be unique and sorted');
  for (const entry of manifest.results) ensure(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), 'Invalid campaign input digest');
  const sourceCache = new Map();
  const entries = [];
  for (const entry of manifest.results) entries.push(await committedResult(entry.id, entry.sha256));
  const rendered = renderCampaignOverview(entries, { reportDir: directory, sourceCache });
  ensure(await readFile(join(directory, 'overview.md'), 'utf8') === rendered.overviewMd, 'Stale campaign overview.md');
  ensure(await readFile(join(directory, 'overview.svg'), 'utf8') === rendered.overviewSvg, 'Stale campaign overview.svg');
  const expected = checksumsFor(rendered.overviewMd, rendered.overviewSvg, inputsBytes);
  const checksums = JSON.parse(await readFile(join(directory, 'checksums.json'), 'utf8'));
  ensure(stable(checksums) === stable(expected), 'Campaign report checksum mismatch');
  if (log) console.log(`PASS campaign report ${relative(ROOT, directory).split(sep).join('/')}: ${entries.length} receipts`);
  return entries.length;
}

async function checkAllReports(rootValue) {
  const root = repoPath(rootValue, 'reports');
  let children;
  try { children = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') { console.log('No campaign reports found'); return 0; } throw error; }
  let count = 0;
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    ensure(!child.isSymbolicLink(), 'Campaign report symlinks are not permitted');
    if (!child.isDirectory()) continue;
    count += await checkCampaignReport(`${rootValue.replace(/[\\/]$/, '')}/${child.name}`, { log: true });
  }
  if (!count) console.log('No campaign reports found');
  return count;
}

export { writeCampaignReport, checkCampaignReport, checkAllReports };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--out') {
    ensure(args.length >= 4, 'Usage: node tools/campaign-report.mjs --out reports/NAME results/ID/result.json [...]');
    const result = await writeCampaignReport(args[1], args.slice(2));
    console.log(`Campaign overview written to ${relative(ROOT, result.out).split(sep).join('/')} from ${result.resultCount} receipts across ${result.models} models`);
  } else if (args[0] === '--check') {
    ensure(args.length === 2, 'Usage: node tools/campaign-report.mjs --check reports/NAME');
    await checkCampaignReport(args[1]);
  } else if (args[0] === '--check-all') {
    ensure(args.length <= 2, 'Usage: node tools/campaign-report.mjs --check-all [reports]');
    await checkAllReports(args[1] ?? 'reports');
  } else fail('Usage: node tools/campaign-report.mjs --out reports/NAME result.json [...] | --check reports/NAME | --check-all [reports]');
}
