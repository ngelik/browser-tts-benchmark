import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');

test('canonical English fixture has its published 20,000-character identity', async () => {
  const bytes = await readFile(resolve(root, 'fixtures/en-20000.txt'));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const meta = JSON.parse(await readFile(resolve(root, 'fixtures/en-20000.meta.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(root, 'fixtures/en-20000.chunks.json'), 'utf8'));
  assert.equal(bytes.length, 20000);
  assert.equal(text.length, 20000);
  assert.equal(meta.license, 'MIT');
  assert.equal(meta.sha256, '4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b');
  assert.equal(digest(bytes), meta.sha256);
  assert.equal(manifest.articleSha256, meta.sha256);
  assert.equal(manifest.chunks.length, 93);
});

test('canonical chunks are contiguous, individually hashed, and reconstruct the source', async () => {
  const bytes = await readFile(resolve(root, 'fixtures/en-20000.txt'));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const manifest = JSON.parse(await readFile(resolve(root, 'fixtures/en-20000.chunks.json'), 'utf8'));
  let offset = 0;
  let rebuilt = '';
  for (let i = 0; i < manifest.chunks.length; i++) {
    const span = manifest.chunks[i];
    const chunk = text.slice(span.start, span.end);
    assert.equal(span.id, i);
    assert.equal(span.start, offset);
    assert.equal(span.end - span.start, span.characters);
    assert.equal(digest(Buffer.from(chunk, 'utf8')), span.sha256);
    rebuilt += chunk;
    offset = span.end;
  }
  assert.equal(offset, text.length);
  assert.equal(rebuilt, text);
});
