import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listModels } from '../lib/assets.mjs';

const root = resolve(import.meta.dirname, '..');

test('catalog entries match the pinned browser backends', () => {
  const models = listModels();
  assert.deepEqual(models.map(model => model.id), ['paradee', 'phonon', 'leokani-7m', 'leokani-4.5m', 'pivo-curated', 'woof']);
  assert.deepEqual(models[0].backends, ['cpu', 'webgpu', 'webgl']);
  assert.equal(models[0].modelRevision, 'ed2934d4df8a4fd891e29584c5e1104649409765');
  assert.deepEqual(models[1].backends, ['cpu', 'webgpu']);
  assert.equal(models[1].modelRevision, '92741c5b07d085ff840e26fea8ce43110b87852f');
  assert.deepEqual(models[2].backends, ['cpu', 'webgpu']);
  assert.deepEqual(models[3].backends, ['cpu', 'webgpu']);
  assert.deepEqual(models[4].backends, ['cpu', 'webgpu', 'webgl']);
  assert.deepEqual(models[5].backends, ['webgpu']);
});

test('asset lock pins content and permits only identical shared runtime targets', async () => {
  const lock = JSON.parse(await readFile(resolve(root, 'assets.lock.json'), 'utf8'));
  const phonon = lock.models.phonon;
  const paradee = lock.models.paradee;
  assert.equal(lock.schemaVersion, 1);
  assert.equal(phonon.runtime.package, 'phonon-tts');
  assert.equal(phonon.runtime.version, '0.6.0');
  assert.equal(paradee.runtime.package, 'onnxruntime-web');
  assert.equal(paradee.runtime.version, '1.23.2');
  const ids = new Set();
  const targets = new Map();
  for (const model of Object.values(lock.models)) {
    const runtimeFiles = new Set(model.runtime.files);
    for (const asset of [...model.runtime.files, ...model.assets]) {
      assert.ok(asset.path || asset.target);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
      if (asset.id) {
        assert.ok(!ids.has(asset.id), 'duplicate asset id: ' + asset.id);
        ids.add(asset.id);
      }
      const isPinnedNpmRuntime = runtimeFiles.has(asset)
        && Boolean(asset.package ?? model.runtime.package)
        && Boolean(asset.version ?? model.runtime.version);
      assert.ok(asset.url || asset.sourcePath || isPinnedNpmRuntime,
        'asset needs a pinned URL, checked-in source, or package-pinned runtime path: ' + asset.target);
      const existing = targets.get(asset.target);
      if (existing) {
        assert.equal(asset.bytes, existing.bytes, 'shared target byte count differs: ' + asset.target);
        assert.equal(asset.sha256, existing.sha256, 'shared target hash differs: ' + asset.target);
      } else {
        targets.set(asset.target, { bytes: asset.bytes, sha256: asset.sha256 });
      }
      if (asset.url) assert.equal(new URL(asset.url).protocol, 'https:');
    }
  }
  const phonemizer = paradee.runtime.files.find(file => file.package === 'phonemizer');
  assert.equal(phonemizer.version, '1.2.1');
  assert.equal(phonemizer.target, 'runtimes/phonemizer/1.2.1/phonemizer.js');
  assert.equal(lock.models['leokani-7m'].license.requiresAcceptance, true);
  assert.equal(lock.models['leokani-4.5m'].license.requiresAcceptance, true);
  assert.equal(lock.models.woof.license.requiresAcceptance, true);
  assert.equal(lock.models['leokani-4.5m'].assets.find(asset => asset.id === 'leokani-4-5m-config').sourcePath, 'web/data/leokani/config-4.5m.json');
});

test('browser entry points contain no implicit network or audio save path', async () => {
  const source = await readFile(resolve(root, 'web/bench.mjs'), 'utf8');
  assert.match(source, /window\.bench = \{ fixture, initialize, generate, dispose \}/);
  assert.match(source, /if \(saveAudio\) receipt\.audioWavBase64/);
  assert.doesNotMatch(source, /https?:\/\//);
});
