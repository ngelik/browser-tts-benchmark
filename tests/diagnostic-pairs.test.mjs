import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { verifyPairs } from '../diagnostics/2026-11-multilingual/check-pairs.mjs';

const root = new URL('../diagnostics/2026-11-multilingual/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('audio.json', root)));
const report = JSON.parse(await readFile(new URL('observations.json', root)));
const pairedIds = new Set(report.observations.filter(row => row.comparison === 'matched').map(row => row.recording));
const receipts = await Promise.all(manifest.recordings.filter(record => pairedIds.has(record.id)).map(async record => JSON.parse(await readFile(new URL(record.receipt, root)))));

test('published first-span playback pairs share source, device, fixture and synthesis settings', () => verifyPairs(receipts));

test('an input or voice mismatch cannot appear as a matched diagnostic pair', () => {
  const [cpu,gpu] = receipts.filter(r=>r.model === 'audio8-realistic-0.6b-int4');
  assert.throws(()=>verifyPairs([cpu,{...gpu,sourceSha256:'other'}]),/sourceSha256/);
  assert.throws(()=>verifyPairs([cpu,{...gpu,configuration:{...gpu.configuration,voice:'other'}}]),/voice/);
  assert.throws(()=>verifyPairs([gpu]),/CPU and WebGPU/);
});
