import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getAssetLock } from '../lib/catalog.mjs';
import { validateResult } from '../tools/results.mjs';
import { validateCampaignInputs } from '../tools/campaign-report.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reportTool = 'tools/campaign-report.mjs';

async function nativeResults(predicate) {
  const output = [];
  for (const name of await readdir(join(root, 'results'))) {
    try {
      const file = join(root, 'results', name, 'result.json');
      const data = validateResult(JSON.parse(await readFile(file)), { publication: true });
      if (data.origin === 'native' && predicate(data)) output.push({ file, data });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return output;
}

async function supertonicWarmPair() {
  const results = await nativeResults(data => data.cells.length === 1 && data.cells[0].model === 'supertonic-3' && data.protocol.scenario === 'warm');
  for (const cpu of results.filter(item => item.data.cells[0].backendRequested === 'cpu')) {
    const gpu = results.find(item => item.data.cells[0].backendRequested === 'webgpu' &&
      item.data.source.gitCommit === cpu.data.source.gitCommit &&
      item.data.source.manifestSha256 === cpu.data.source.manifestSha256);
    if (gpu) return [cpu, gpu];
  }
  throw new Error('Expected the committed Supertonic CPU/WebGPU warm receipts from one source cohort');
}

async function supertonicCachedDifferentSource(sourceCommit) {
  const results = await nativeResults(data => data.cells.length === 1 && data.cells[0].model === 'supertonic-3' &&
    data.protocol.scenario === 'cached' && data.protocol.id.endsWith('-resources') && data.cells[0].backendRequested === 'cpu');
  const row = results.find(item => item.data.source.gitCommit !== sourceCommit);
  if (!row) throw new Error('Expected the committed Supertonic cached RAM receipt from a different source cohort');
  return row;
}

async function woofUnsupportedCpuAndMeasuredGpu() {
  const results = await nativeResults(data => data.cells.length === 1 && data.cells[0].model === 'woof' &&
    data.protocol.scenario === 'cached' && data.protocol.id.endsWith('-resources'));
  const cpu = results.find(item => item.data.cells[0].backendRequested === 'cpu' && item.data.cells[0].status === 'unsupported');
  const gpu = results.find(item => item.data.cells[0].backendRequested === 'webgpu' && item.data.cells[0].status === 'measured');
  if (!cpu || !gpu || cpu.data.source.gitCommit !== gpu.data.source.gitCommit) {
    throw new Error('Expected one same-source Woof CPU unsupported and WebGPU measured resource receipt');
  }
  return [cpu, gpu];
}

function run(args) {
  return spawnSync(process.execPath, [reportTool, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

async function temporaryReports(t) {
  const reportsRoot = join(root, 'reports');
  await mkdir(reportsRoot, { recursive: true });
  const directory = join(reportsRoot, `campaign-report-test-${randomUUID().replaceAll('-', '').toLowerCase()}`);
  await mkdir(directory);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('campaign overview binds real receipts, renders all six panels and verifies its committed inputs', async t => {
  const pair = await supertonicWarmPair();
  const temp = await temporaryReports(t);
  const output = temp;
  const reportPath = `reports/${temp.slice(join(root, 'reports').length + 1)}`;
  const inputs = pair.map(item => item.file.replace(root + '/', '')).reverse();
  assert.notEqual(pair[0].data.environment.gpu, pair[1].data.environment.gpu,
    'the real CPU/GPU receipts should exercise the null-versus-adapter environment difference');
  for (const key of ['machineLabel', 'os', 'arch', 'cpu', 'logicalCores', 'ramBytes', 'chromeVersion', 'headless']) {
    assert.equal(pair[0].data.environment[key], pair[1].data.environment[key], `hardware field ${key}`);
  }

  const generated = run(['--out', reportPath, ...inputs]);
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const markdown = await readFile(join(output, 'overview.md'), 'utf8');
  const svg = await readFile(join(output, 'overview.svg'), 'utf8');
  const manifest = JSON.parse(await readFile(join(output, 'inputs.json'), 'utf8'));
  assert.equal(manifest.results.length, 2);
  assert.deepEqual(manifest.results.map(entry => entry.id), manifest.results.map(entry => entry.id).slice().sort());
  assert.match(markdown, /Warm generation/);
  assert.match(markdown, /mean Chrome RSS/);
  assert.match(markdown, /CPU cold HTTP bytes/);
  assert.match(markdown, /Not submitted/);
  assert.match(markdown, /Scenarios remain separate/);
  assert.match(markdown, /\.\.\/\.\.\/results\//);
  assert.match(svg, /aria-labelledby="campaign-title campaign-desc"/);
  for (const phrase of ['Warm generation median', 'First PCM median', 'Real-time factor median', 'Mean Chrome RSS during generation', 'Pinned model weights', 'CPU cold HTTP transfer']) {
    assert.ok(svg.includes(phrase), `missing SVG panel: ${phrase}`);
  }

  const checked = run(['--check', reportPath]);
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);

  const missingRoot = `reports/.campaign-report-missing-${randomUUID()}`;
  const changed = run(['--check-all', missingRoot]);
  assert.equal(changed.status, 0, changed.stderr || changed.stdout);

  const checkAll = run(['--check-all', 'reports']);
  assert.equal(checkAll.status, 0, checkAll.stderr || checkAll.stdout);

  await writeFile(join(output, 'overview.md'), markdown + '\nEdited after generation.\n');
  const stale = run(['--check', reportPath]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Stale campaign overview\.md/);
});

test('campaign overview rejects warm and cached RAM receipts from different source commits', async t => {
  const pair = await supertonicWarmPair();
  const cached = await supertonicCachedDifferentSource(pair[0].data.source.gitCommit);
  const temp = await temporaryReports(t);
  const reportPath = `reports/${temp.slice(join(root, 'reports').length + 1)}`;
  const inputs = [...pair, cached].map(item => item.file.replace(root + '/', ''));

  const rejected = run(['--out', reportPath, ...inputs]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /share one committed source and source fingerprint/);
});

test('campaign overview rejects duplicate results instead of pooling them', async t => {
  const [cpu] = await supertonicWarmPair();
  const temp = await temporaryReports(t);
  const reportPath = `reports/${temp.slice(join(root, 'reports').length + 1)}`;
  const input = cpu.file.replace(root + '/', '');

  const rejected = run(['--out', reportPath, input, input]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Duplicate result input/);
});

test('settings differences on an unsupported cell do not invalidate its measured backend', async () => {
  const rows = await woofUnsupportedCpuAndMeasuredGpu();
  const cpuSettings = { ...rows[0].data.cells[0].settings };
  const gpuSettings = { ...rows[1].data.cells[0].settings };
  delete cpuSettings.executionProviders;
  delete gpuSettings.executionProviders;
  assert.notDeepEqual(cpuSettings, gpuSettings);
  assert.doesNotThrow(() => validateCampaignInputs(rows));
});

test('campaign validator rejects model weight metadata that differs from manifest hashes', async () => {
  const [cpu] = await supertonicWarmPair();
  const tampered = structuredClone(cpu.data);
  const model = getAssetLock().models['supertonic-3'];
  const weight = model.assets.find(asset => asset.kind === 'model-weights');
  const asset = tampered.assets.find(item => item.id === weight.id);
  assert.ok(asset);
  asset.sha256 = '0'.repeat(64);
  assert.throws(() => validateCampaignInputs([{ data: tampered }]), /does not match pinned model weight/);
});
