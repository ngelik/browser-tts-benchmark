import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assembleDashboardData, buildDashboardData, selectLatestAttempt, summarizeMemoryTrials, verifySourcesOnce } from '../tools/dashboard-data.mjs';
import { resultPaths, readResult } from '../tools/results.mjs';
import { getAssetLock } from '../lib/catalog.mjs';

let dashboard;
let results;
let manifestEntries;

before(async () => {
  dashboard = await buildDashboardData();
  const paths = await resultPaths('results');
  results = await Promise.all(paths.map(path => readResult(path, { publication: true })));
  manifestEntries = JSON.parse(await readFile('audio/manifest.json', 'utf8')).entries;
});

test('exports all catalog models with explicit warm, memory, license, and support fields', () => {
  const catalog = getAssetLock().models;
  assert.equal(dashboard.schemaVersion, 1);
  assert.equal(dashboard.models.length, Object.keys(catalog).length);
  assert.deepEqual(dashboard.models.map(model => model.id).sort(), Object.keys(catalog).sort());
  assert.ok(Date.parse(dashboard.updatedAt));
  for (const model of dashboard.models) {
    assert.equal(model.name, catalog[model.id].displayName);
    if (model.modelMB !== null) assert.ok(Number.isFinite(model.modelMB) && model.modelMB > 0, `${model.id} model size is tied to a selected receipt`);
    assert.equal(model.license.model, catalog[model.id].license.model);
    assert.equal(model.license.code, catalog[model.id].license.runtime ?? catalog[model.id].license.frontend ?? null);
    assert.deepEqual(model.support, catalog[model.id].support);
    if (model.sourceUrl) assert.match(model.sourceUrl, /^https:\/\//);
    for (const backend of ['cpu', 'webgpu']) {
      assert.ok(['measured', 'unsupported', 'error', 'unavailable'].includes(model.warm[backend].status));
      assert.ok(['measured', 'unsupported', 'error', 'unavailable'].includes(model.memory[backend].status));
      assert.ok('cohortKey' in model.warm[backend] && 'cohortKey' in model.memory[backend]);
      if (model.warm[backend].status !== 'measured') {
        assert.equal(model.warm[backend].medianSeconds, null);
        assert.equal(model.warm[backend].n, null);
      } else {
        const receipt = results.find(result => result.id === model.warm[backend].resultId);
        const cell = receipt.cells.find(value => value.model === model.id && value.backendRequested === backend);
        assert.equal(model.warm[backend].n, cell.trials.length);
        assert.ok(model.warm[backend].n >= 1);
        assert.ok(model.warm[backend].medianSeconds > 0);
      }
      if (model.memory[backend].status === 'measured') {
        const receipt = results.find(result => result.id === model.memory[backend].resultId);
        const cell = receipt.cells.find(value => value.model === model.id && value.backendRequested === backend);
        assert.equal(model.memory[backend].n, cell.trials.length);
        assert.ok(model.memory[backend].n >= 1);
        assert.ok(model.memory[backend].sampleCount >= 2);
        const middle = [Math.floor((cell.trials.length - 1) / 2), Math.floor(cell.trials.length / 2)];
        for (const [field, values] of [
          ['generationSeconds', cell.trials.map(t => t.generationMs / 1000)],
          ['audioSeconds', cell.trials.map(t => t.samples / t.sampleRate)],
        ]) {
          values.sort((a, b) => a - b);
          assert.equal(model.memory[backend][field], (values[middle[0]] + values[middle[1]]) / 2);
        }
        assert.ok(model.memory[backend].meanMB > 0);
        assert.ok(model.memory[backend].peakMB >= model.memory[backend].meanMB);
      } else {
        assert.equal(model.memory[backend].generationSeconds, null);
        assert.equal(model.memory[backend].audioSeconds, null);
        assert.equal(model.memory[backend].meanMB, null);
        assert.equal(model.memory[backend].peakMB, null);
      }
    }
  }
});

test('keeps unsupported cells, historical warm provenance, and independent RAM provenance', () => {
  const byId = Object.fromEntries(dashboard.models.map(model => [model.id, model]));
  assert.equal(byId['sano-amy'].warm.webgpu.status, 'unsupported');
  assert.match(byId['sano-amy'].warm.webgpu.reason, /WebGPU|GPU|unsupported/i);
  assert.match(byId['sano-amy'].license.code, /GPL/i);
  assert.match(byId['piper-en-gb-southern-english-female-low'].license.code, /GPL/i);
  assert.equal(byId.woof.warm.cpu.status, 'unavailable');
  assert.equal(byId.woof.memory.cpu.status, 'unsupported');

  const leokani = byId['leokani-4.5m'];
  assert.equal(leokani.warm.cpu.origin, 'historical-import');
  assert.equal(leokani.memory.cpu.origin, 'native');
  assert.notEqual(leokani.warm.cpu.sourceCommit, leokani.memory.cpu.sourceCommit);
  assert.equal(leokani.warm.cpu.reportUrl, `https://github.com/ngelik/tts-bench/blob/main/results/${leokani.warm.cpu.resultId}/summary.md`);
});

test('forms comparison-compatible cohorts and only pairs matching measured native warm receipts', () => {
  const models = Object.fromEntries(dashboard.models.map(model => [model.id, model]));
  const kokoro = models['kokoro-82m'];
  assert.equal(kokoro.pairedWarm, true);
  assert.equal(kokoro.warm.cpu.cohortKey, kokoro.warm.webgpu.cohortKey);
  assert.equal(models['sano-amy'].pairedWarm, false);
  assert.equal(models['leokani-4.5m'].pairedWarm, false);
});

test('keeps every verified audio example and marks exact warm matches separately', () => {
  const expectedCount = manifestEntries.length;
  assert.equal(dashboard.models.reduce((sum, model) => sum + model.audio.length, 0), expectedCount);
  for (const model of dashboard.models) {
    for (const backend of ['cpu', 'webgpu']) {
      const preferred = model.preferredAudio[backend];
      if (preferred) {
        assert.equal(preferred.backend, backend);
        assert.equal(preferred.matchesSelectedWarm, true);
        assert.equal(preferred.resultId, model.warm[backend].resultId);
      }
    }
    for (const entry of model.audio) {
      assert.equal(typeof entry.scenario, 'string');
      assert.equal(typeof entry.sourceCreatedAt, 'string');
      assert.ok(['native', 'historical-import'].includes(entry.sourceOrigin));
      assert.ok(entry.reportUrl.startsWith('https://github.com/ngelik/tts-bench/blob/main/results/'));
      assert.ok(Array.isArray(entry.sourceUrls) && entry.sourceUrls.length > 0);
      const warm = model.warm[entry.backend];
      assert.equal(entry.matchesSelectedWarm, warm.status === 'measured' && entry.resultId === warm.resultId);
      if (entry.scenario !== 'warm') assert.equal(entry.matchesSelectedWarm, false);
    }
  }
  const cachedExamples = dashboard.models.flatMap(model => model.audio).filter(entry => entry.scenario === 'cached');
  assert.ok(cachedExamples.length > 0);
  assert.ok(cachedExamples.every(entry => entry.matchesSelectedWarm === false));
});

test('a later failed attempt supersedes a prior score without emitting zero metrics', () => {
  const successful = results.find(result => result.id === dashboard.models.find(model => model.id === 'paradee').warm.cpu.resultId);
  const successfulCell = successful.cells.find(cell => cell.model === 'paradee' && cell.backendRequested === 'cpu');
  const failure = {
    result: { ...successful, id: 'test-only-later-failure', createdAt: '2099-01-01T00:00:00.000Z' },
    cell: { ...successfulCell, status: 'error', reason: 'synthetic selection test only', warmup: [], trials: [] },
  };
  failure.result.cells = [failure.cell];
  const selected = selectLatestAttempt([{ result: successful, cell: successfulCell }, failure]);
  assert.equal(selected.result.id, failure.result.id);
  assert.equal(selected.cell.status, 'error');

  const assembled = assembleDashboardData({
    results: [successful, failure.result],
    models: { paradee: getAssetLock().models.paradee },
    audioEntries: [],
  });
  const metric = assembled.models[0].warm.cpu;
  assert.equal(metric.status, 'error');
  assert.equal(metric.resultId, failure.result.id);
  assert.equal(metric.medianSeconds, null);
  assert.equal(metric.n, null);
});

test('averages article memory means equally and derives peak only from in-window samples', () => {
  const trials = [
    {
      metrics: { generationMeanRssBytes: 300_000_000 },
      memory: { availability: 'measured', generationStartedAtEpochMs: 100, finalPcmAtEpochMs: 200, samples: [[150, 300_000_000]] },
    },
    {
      metrics: { generationMeanRssBytes: 100_000_000 },
      memory: { availability: 'measured', generationStartedAtEpochMs: 100, finalPcmAtEpochMs: 200, samples: [[110, 100_000_000], [190, 100_000_000], [201, 900_000_000]] },
    },
  ];
  assert.deepEqual(summarizeMemoryTrials(trials), { meanMB: 200, peakMB: 300, n: 2, sampleCount: 3 });
});

test('source verification checks every native receipt while deduplicating commit keys', () => {
  const native = results.filter(result => result.origin === 'native');
  const expected = new Set(native.map(result => result.source.gitCommit));
  const calls = [];
  const count = verifySourcesOnce(results, '/unused-in-test', result => calls.push(result.source.gitCommit));
  assert.equal(count, expected.size);
  assert.equal(calls.length, native.length);
  assert.deepEqual(new Set(calls), expected);
});

test('checks each receipt fingerprint even when source commits share the cache key', () => {
  const first = results.find(result => result.origin === 'native');
  const changed = structuredClone(first);
  changed.source.manifestSha256 = '0'.repeat(64);
  assert.throws(() => verifySourcesOnce([first, changed], process.cwd()), /fingerprint does not match/);
});
