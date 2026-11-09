import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listModels } from '../lib/assets.mjs';

const root = resolve(import.meta.dirname, '..');

test('catalog entries match the pinned browser backends', () => {
  const models = listModels();
  assert.deepEqual(models.map(model => model.id), ['paradee', 'phonon']);
  assert.deepEqual(models[0].backends, ['cpu', 'webgpu', 'webgl']);
  assert.equal(models[0].modelRevision, 'ed2934d4df8a4fd891e29584c5e1104649409765');
  assert.deepEqual(models[1].backends, ['cpu', 'webgpu']);
  assert.equal(models[1].modelRevision, '92741c5b07d085ff840e26fea8ce43110b87852f');
});

test('asset lock pins unique paths, immutable revisions, sizes, hashes and runtime version', async () => {
  const lock = JSON.parse(await readFile(resolve(root, 'assets.lock.json'), 'utf8'));
  const phonon = lock.models.phonon;
  const paradee = lock.models.paradee;
  assert.equal(lock.schemaVersion, 1);
  assert.equal(phonon.runtime.package, 'phonon-tts');
  assert.equal(phonon.runtime.version, '0.6.0');
  assert.equal(paradee.runtime.package, 'onnxruntime-web');
  assert.equal(paradee.runtime.version, '1.23.2');
  const ids = new Set();
  const targets = new Set();
  for (const asset of [...phonon.runtime.files, ...phonon.assets, ...paradee.runtime.files, ...paradee.assets]) {
    assert.ok(asset.path || asset.target);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
    assert.ok(!targets.has(asset.target));
    targets.add(asset.target);
  }
  for (const asset of phonon.assets) {
    assert.ok(!ids.has(asset.id));
    ids.add(asset.id);
    assert.equal(new URL(asset.url).hostname, 'huggingface.co');
    assert.ok(asset.url.includes('/resolve/' + phonon.modelRevision + '/'));
  }
  for (const asset of paradee.assets) {
    assert.ok(!ids.has(asset.id));
    ids.add(asset.id);
    assert.equal(new URL(asset.url).hostname, 'huggingface.co');
    assert.ok(asset.url.includes('/resolve/' + paradee.modelRevision + '/'));
  }
  const phonemizer = paradee.runtime.files.find(file => file.package === 'phonemizer');
  assert.equal(phonemizer.version, '1.2.1');
  assert.equal(phonemizer.target, 'runtimes/phonemizer/1.2.1/phonemizer.js');
});

test('browser entry points contain no implicit network or audio save path', async () => {
  const source = await readFile(resolve(root, 'web/bench.mjs'), 'utf8');
  assert.match(source, /window\.bench = \{ fixture, initialize, generate, dispose \}/);
  assert.match(source, /if \(saveAudio\) receipt\.audioWavBase64/);
  assert.doesNotMatch(source, /https?:\/\//);
});
