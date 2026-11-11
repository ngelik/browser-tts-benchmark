import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listModels } from '../lib/assets.mjs';

const root = resolve(import.meta.dirname, '..');

test('catalog entries match the pinned browser backends', () => {
  const models = listModels();
  assert.deepEqual(models.map(model => model.id), ['paradee', 'phonon', 'leokani-7m', 'leokani-4.5m', 'pivo-curated', 'woof', 'piper-en-gb-southern-english-female-low', 'supertonic-3', 'kokoro-82m', 'mms-english', 'kitten-nano-0.8', 'sano-amy', 'inflect-micro-v2', 'lfm3-audio-2b-gguf', 'lfm3-omni-2b-gguf']);
  assert.deepEqual(models[0].backends, ['cpu', 'webgpu']);
  assert.equal(models[0].modelRevision, 'ed2934d4df8a4fd891e29584c5e1104649409765');
  assert.deepEqual(models[1].backends, ['cpu', 'webgpu']);
  assert.equal(models[1].modelRevision, '92741c5b07d085ff840e26fea8ce43110b87852f');
  assert.deepEqual(models[2].backends, ['cpu', 'webgpu']);
  assert.deepEqual(models[3].backends, ['cpu', 'webgpu']);
  assert.deepEqual(models[4].backends, ['cpu', 'webgpu']);
  assert.deepEqual(models[5].backends, ['webgpu']);
  assert.deepEqual(models[6].backends, ['cpu', 'webgpu']);
  assert.equal(models[6].modelRevision, 'e7229f7d33a10e145e109b886d661984201ac3c4');
  assert.equal(models[6].license.requiresAcceptance, true);
  assert.deepEqual(models[7].backends,['cpu','webgpu']);
  assert.equal(models[7].support.voiceCount,10);
  assert.equal(models[7].support.languageCount,31);
  assert.equal(models[7].support.bundledVoiceCount,1);
  for (const id of ['lfm3-audio-2b-gguf','lfm3-omni-2b-gguf']) {
    const m=models.find(model=>model.id===id);assert.deepEqual(m.backends,['webgpu']);assert.equal(m.support.languageCount,18);assert.equal(m.support.voiceCount,null);
  }
});

test('Piper has voice and lineage cards plus immutable cache-only runtime pins', async () => {
  const lock = JSON.parse(await readFile(resolve(root, 'assets.lock.json'), 'utf8'));
  const model = lock.models['piper-en-gb-southern-english-female-low'];
  assert.equal(model.runtime.package, 'onnxruntime-web');
  assert.equal(model.runtime.version, '1.23.2');
  const assets = new Map(model.assets.map(asset => [asset.id, asset]));
  assert.equal(assets.get('piper-southern-english-female-low-voice').bytes, 63104526);
  assert.equal(assets.get('piper-southern-english-female-low-voice').sha256, 'f2f37aed1b3a093476f719d1379ba0c0b1b1cf6f1ef99288e2ebf502971a07c3');
  assert.equal(assets.get('piper-southern-english-female-low-model-card').bytes, 296);
  assert.equal(assets.get('piper-southern-english-female-low-ryan-ancestry-card').bytes, 263);
  for (const id of ['piper-browser-frontend', 'piper-espeak-module', 'piper-espeak-wasm', 'piper-espeak-data']) {
    assert.match(assets.get(id).url, /piper-samples\/da672d1157136d07365790f51da3357a17cf9650/);
  }
  for (const asset of model.assets.filter(asset => asset.id.startsWith('piper-') && asset.id !== 'piper-espeak-ng-license')) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
  }
  assert.equal(model.license.requiresAcceptance, true);
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
