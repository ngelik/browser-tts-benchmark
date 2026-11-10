import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  inflectPhonemeText,
  inflectSymbols,
  inflectTokenIds,
  normalizeInflect,
  splitInflectText,
} from '../web/inflect/frontend.mjs';
import { seededNormalNoise } from '../web/inflect/noise.mjs';

const workerSource = await readFile(new URL('../web/workers/inflect.mjs', import.meta.url), 'utf8');

test('Inflect numeric frontend covers dates, times, identifiers, money and ordinal order', () => {
  assert.equal(
    normalizeInflect('At 7:10, pay $43.75 for 26,000 items on 03/04/2020; meet Dr. Smith at gate A12.'),
    'At seven ten, pay forty three dollars and seventy five cents for two six zero zero zero items on March fourth two thousand and twenty; meet doctor Smith at gate ay twelve.',
  );
  assert.equal(normalizeInflect('The 1001st, 2101st, and 2100th examples.'),
    'The one thousand and first, two thousand one hundred and first, and two thousand one hundredth examples.');
  assert.equal(normalizeInflect('18, 1983, 22, then 7:10 each.'),
    'eighteen, one thousand nine hundred and eighty three, twenty two, then seven ten each.');
  assert.equal(normalizeInflect('Qwen3 uses PyTorch, SQLite, and USB-C.'),
    'Qwen three uses pie torch, ess cue lite, and you ess bee see.');
});

test('Inflect full canonical fixture normalization expands its numeric text', async () => {
  const source = await readFile(new URL('../fixtures/en-20000.txt', import.meta.url), 'utf8');
  const normalized = normalizeInflect(source);
  assert.doesNotMatch(normalized, /\d/u);
  assert.ok(normalized.length > source.length);
});

test('Inflect official splitter keeps punctuation-aware subspans within the 280-character limit', () => {
  assert.deepEqual(splitInflectText('A. B!'), ['A.', 'B!']);
  const text = ('word '.repeat(40) + ', ' + 'phrase '.repeat(20) + '; ' + 'tail '.repeat(30)).trim();
  const pieces = splitInflectText(text);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every(piece => piece.length <= 280));
  assert.equal(pieces.join(' '), text);
});

test('Inflect browser phonemizer preserves punctuation, stress and the two pinned overrides', async () => {
  const calls = [];
  const result = await inflectPhonemeText('Hello, world.', async (text, language) => {
    calls.push({ text, language });
    return [text === 'Hello' ? 'həlˈoʊ' : 'wɜːld'];
  });
  assert.equal(result.normalizedText, 'Hello, world.');
  assert.equal(result.phonemeText, 'həlˈoʊ, wɜːld.');
  assert.deepEqual(calls, [{ text: 'Hello', language: 'en-us' }, { text: 'world', language: 'en-us' }]);

  const overridden = await inflectPhonemeText('Saskatchewan fluorescent.', async () => ['sˈæskɐtʃˌuːən flʊɹɹˈɛsənt']);
  assert.equal(overridden.phonemeText, 'sɐskˈætʃəwən flʊˈɹɛsənt.');
});

test('Inflect symbol IDs match the pinned ordered inventory and blank insertion contract', () => {
  const symbols = inflectSymbols();
  assert.equal(symbols.length, 178);
  assert.equal(new Set(symbols).size, 177);
  assert.equal(symbols.indexOf(' '), 16);
  assert.equal(symbols.indexOf('ˈ'), 156);

  const mapped = inflectTokenIds('həlˈoʊ.');
  assert.equal(mapped.phonemeCount, 7);
  assert.equal(mapped.tokens.length, mapped.phonemeCount * 2 + 1);
  for (let index = 0; index < mapped.tokens.length; index += 2) assert.equal(mapped.tokens[index], 0n);
  assert.throws(() => inflectTokenIds('hello🙂'), /unsupported symbol/);
  assert.throws(() => inflectTokenIds(''), /no speakable tokens/);
});

test('Inflect deterministic Box-Muller noise is finite, shaped and seed-sensitive', () => {
  const a = seededNormalNoise([2, 2, 4], 0);
  const b = seededNormalNoise([2, 2, 4], 0);
  const c = seededNormalNoise([2, 2, 4], 1);
  assert.equal(a.length, 16);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every(Number.isFinite));
  assert.throws(() => seededNormalNoise([], 0), /invalid latent dimensions/);
});

test('Inflect worker pins local assets, explicit providers, CPU output and cleanup', () => {
  assert.match(workerSource, /MODEL_ROOT = '\/models\/inflect-micro-v2\/'/);
  assert.match(workerSource, /ORT_ROOT = '\/runtimes\/onnxruntime-web\/1\.23\.2\/'/);
  assert.match(workerSource, /executionProviders = backend === 'cpu' \? \['wasm'\] : \['webgpu', 'wasm'\]/);
  assert.match(workerSource, /ort\.env\.wasm\.numThreads = 1/);
  assert.match(workerSource, /preferredOutputLocation: 'cpu'/);
  assert.match(workerSource, /await output\.getData\(\)/);
  assert.match(workerSource, /const hook = backend === 'webgpu' \? dispatchProbe\(\) : null/);
  assert.match(workerSource, /await session\?\.release\(\)/);
  assert.match(workerSource, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(workerSource, /https?:\/\//);
});
