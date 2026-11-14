// Compare every prompt used for the scored fixture to native HF tokenizers IDs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {startServer} from '../lib/server.mjs';
import {findChrome} from '../lib/runner.mjs';

const root = process.cwd();
const article = await readFile('fixtures/en-20000.txt', 'utf8');
const {chunks} = JSON.parse(await readFile('fixtures/en-20000.chunks.json', 'utf8'));
const oracle = JSON.parse(await readFile('web/audio8/prompt-oracle.json', 'utf8'));
assert.equal(createHash('sha256').update(article).digest('hex'), oracle.fixtureSha256);
const server = await startServer(root);
let browser;
try {
  browser = await chromium.launch({executablePath:await findChrome(), headless:false, chromiumSandbox:true});
  const page = await browser.newPage();
  const external = [];
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(server.url).origin) external.push(request.url()); });
  await page.goto(server.url);
  const prompts = await page.evaluate(async texts => {
    const {PreTrainedTokenizer} = await import('/runtimes/transformers/3.5.1/transformers.min.js');
    const {promptTokens} = await import('/web/audio8/generation.mjs');
    const json = await (await fetch('/models/audio8-realistic/tokenizer/tokenizer.json')).json();
    const tokenizer = new PreTrainedTokenizer(json, {tokenizer_class:'PreTrainedTokenizer', unk_token:'<|endoftext|>'});
    return texts.map(text => promptTokens(tokenizer, text));
  }, chunks.map(c => article.slice(c.start, c.end)));
  for (const [i, ids] of prompts.entries()) {
    assert.equal(createHash('sha256').update(JSON.stringify(ids)).digest('hex'), oracle.promptSha256[i], `Prompt ${i} differs`);
    assert.ok(ids.length < 2048);
  }
  assert.equal(prompts.length, 93);
  assert.deepEqual(external, []);
  console.log(`PASS ${prompts.length} native/browser prompts, max ${Math.max(...prompts.map(ids => ids.length))} tokens, zero external fetches`);
} finally { await browser?.close(); await server.close(); }
