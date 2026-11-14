import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BpeTokenizer } from '../web/cosyvoice3/tokenizer.mjs';
import { prepareText } from '../web/cosyvoice3/generate.mjs';

const revision = 'dcdb9df4bce4a47d318f5f8736de0b080efd944f';
const tokenizerJson = JSON.parse(await readFile(`.cache/public/models/cosyvoice3/${revision}/tokenizer.json`, 'utf8'));
const tokenizer = BpeTokenizer.fromJSON(tokenizerJson);
const article = await readFile('fixtures/en-20000.txt', 'utf8');
const fixture = JSON.parse(await readFile('fixtures/en-20000.chunks.json', 'utf8'));
assert.equal(createHash('sha256').update(article).digest('hex'), fixture.articleSha256);
const amounts = ["$26,000", "$1.8 million", "$2.40"];
assert.deepEqual(amounts.map(text => prepareText(text, tokenizer).join(' ')), [
  'twenty six thousand dollars.', 'one point eight million dollars.', 'two dollars and forty cents.',
]);
const utterances = [];
for (const span of fixture.chunks) {
  const source = article.slice(span.start, span.end);
  assert.equal(createHash('sha256').update(source).digest('hex'), span.sha256);
  for (const text of prepareText(source, tokenizer)) {
    const ids = tokenizer.encode(text);
    assert.ok(ids.length > 0 && ids.every(id => Number.isInteger(id) && id >= 0 && id < 151936));
    utterances.push({span: span.id, text, ids});
  }
}
const digest = createHash('sha256').update(JSON.stringify(utterances)).digest('hex');
// Pinned after independent Hugging Face tokenizers 0.22.2 reproduction on all spans.
assert.equal(digest, '0359c3be9f2fb6d830813bdae919c445fcd060fd9646291278287ae118eb8cf3');
if (process.argv.includes('--dump')) console.log(JSON.stringify(utterances));
else console.log(JSON.stringify({sourceSpans: fixture.chunks.length, utterances: utterances.length, maxTextTokens: Math.max(...utterances.map(u => u.ids.length)), sha256: digest}));
