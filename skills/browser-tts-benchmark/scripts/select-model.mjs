#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const stable = x => JSON.stringify(canonical(x));
const digest = x => createHash('sha256').update(x).digest('hex');
export function selectModel(pool, seed = randomBytes(32).toString('hex')) {
  if (!pool || typeof pool.scope !== 'string' || !pool.scope.trim() || !Array.isArray(pool.candidates) || pool.candidates.length < 2 || pool.candidates.length > 10000) throw new Error('Pool needs a scope and 2–10000 candidates');
  if (!/^[a-f0-9]{64}$/.test(seed)) throw new Error('Seed must be 64 lowercase hexadecimal characters');
  const ids = new Set();
  for (const c of pool.candidates) {
    if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(c.id) || ids.has(c.id)) throw new Error('Candidate IDs must be unique safe identifiers');
    if (!/^https:\/\//.test(c.source) || !/^[a-f0-9]{40,64}$/.test(c.revision) || typeof c.reason !== 'string' || !c.reason.trim()) throw new Error('Candidate needs HTTPS source, immutable revision and eligibility reason');
    ids.add(c.id);
  }
  const poolSha256 = digest(stable(pool));
  const n = pool.candidates.length, limit = Math.floor(2 ** 32 / n) * n;
  let counter = 0, value;
  do { value = createHash('sha256').update(`${seed}:${poolSha256}:${counter++}`).digest().readUInt32BE(0); } while (value >= limit);
  const index = value % n;
  return { schemaVersion: 1, algorithm: 'sha256-seed-pool-counter-u32be-rejection-v1', seed, poolSha256, pool, index, selected: pool.candidates[index] };
}
export function verifySelection(receipt) {
  if (stable(selectModel(receipt.pool, receipt.seed)) !== stable(receipt)) throw new Error('Selection receipt differs from its reproducible draw');
  return receipt.selected;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--verify' && args.length === 2) {
    const selected = verifySelection(JSON.parse(await readFile(args[1], 'utf8')));
    console.log('PASS selection: ' + selected.id);
  } else {
    const opts = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--pool','--out','--seed'].includes(args[i]) || !args[i+1] || opts[args[i]]) throw new Error('Usage: select-model.mjs --pool candidates.json --out selection.json [--seed HEX]');
      opts[args[i]] = args[i+1];
    }
    if (!opts['--pool'] || !opts['--out']) throw new Error('--pool and --out are required');
    const receipt = selectModel(JSON.parse(await readFile(opts['--pool'], 'utf8')), opts['--seed']);
    await writeFile(opts['--out'], JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log('Selected ' + receipt.selected.id + '; retain ' + opts['--out'] + ' before benchmarking.');
  }
}
