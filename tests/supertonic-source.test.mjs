import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TextToSpeech } from '../web/supertonic/helper.mjs';
import {
  EXECUTION_PROVIDERS,
  INNER_CHUNK_LIMIT,
  LANGUAGE,
  MODEL_REVISION,
  SAMPLE_RATE,
  SILENCE_DURATION,
  SPEED,
  TOTAL_STEP,
  VOICE,
} from '../web/supertonic/settings.mjs';
import { trimWaveToDuration } from '../web/supertonic/audio.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('Supertonic helper differs from pinned upstream only by its local runtime import and whitespace cleanup', async () => {
  const helper = await readFile(new URL('../web/supertonic/helper.mjs', import.meta.url), 'utf8');
  assert.match(helper, /^import \{ ort \} from '\.\/ort-runtime\.mjs';/);
  assert.doesNotMatch(helper, /[ \t]+$/m);
  const restored = helper.replace(
    "import { ort } from './ort-runtime.mjs';",
    "import * as ort from 'onnxruntime-web';",
  );
  assert.equal(hash(restored), '8d254a8e900a2553c987efbd8d9eabd084819e79a286f1a008e8c8ecdeabe08d');
});

test('Supertonic CPU and WebGPU settings keep voice, language, steps, speed and sample rate fixed', () => {
  assert.equal(MODEL_REVISION, '3cadd1ee6394adea1bd021217a0e650ede09a323');
  assert.equal(VOICE, 'M3 (Robert)');
  assert.equal(LANGUAGE, 'en');
  assert.equal(TOTAL_STEP, 8);
  assert.equal(SPEED, 1.05);
  assert.equal(SILENCE_DURATION, 0.3);
  assert.equal(SAMPLE_RATE, 44100);
  assert.deepEqual(EXECUTION_PROVIDERS.cpu, ['wasm']);
  assert.deepEqual(EXECUTION_PROVIDERS.webgpu, ['webgpu', 'wasm']);
  assert.equal(INNER_CHUNK_LIMIT, 300);
});

test('canonical fixture produces 111 official Supertonic utterances with 18 intra-span silence gaps', async () => {
  const manifest = JSON.parse(await readFile(new URL('../fixtures/en-20000.chunks.json', import.meta.url), 'utf8'));
  const article = await readFile(new URL('../fixtures/en-20000.txt', import.meta.url), 'utf8');
  assert.equal(manifest.chunks.length, 93);
  assert.ok(Math.max(...manifest.chunks.map(chunk => chunk.end - chunk.start)) <= INNER_CHUNK_LIMIT);

  const helper = Object.create(TextToSpeech.prototype);
  helper.sampleRate = SAMPLE_RATE;
  const style = { ttl: { dims: [1] } };
  let utteranceCount = 0;
  helper._infer = async textList => {
    assert.equal(textList.length, 1);
    utteranceCount++;
    return { wav: [0], duration: [0.001] };
  };
  const perSpan = [];
  for (const span of manifest.chunks) {
    const before = utteranceCount;
    await helper.call(article.slice(span.start, span.end), LANGUAGE, style, TOTAL_STEP, SPEED, SILENCE_DURATION);
    perSpan.push(utteranceCount - before);
  }
  assert.equal(utteranceCount, 111);
  assert.equal(perSpan.filter(count => count > 1).length, 18);
});

test('official demo output trimming uses floor(sampleRate times predicted duration)', () => {
  const source = [0, 0.25, 0.5, 0.75, 1];
  const output = trimWaveToDuration(source, 0.00006, SAMPLE_RATE);
  assert.ok(output instanceof Float32Array);
  assert.deepEqual(Array.from(output), [0, 0.25]);
  assert.equal(source.length, 5);
  assert.throws(() => trimWaveToDuration(source, Number.NaN, SAMPLE_RATE), /duration/);
  assert.throws(() => trimWaveToDuration(source, 1, 1), /sample rate/);
});
