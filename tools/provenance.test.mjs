import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { committedManifest, verifySource } from './provenance.mjs';
const result = JSON.parse(await readFile(new URL('../results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/result.json', import.meta.url)));
test('published native source fingerprint reconstructs from its immutable Git tree', () => {
 assert.equal(committedManifest(result.source.gitCommit), result.source.manifestSha256);
 assert.doesNotThrow(() => verifySource(result));
 const changed = structuredClone(result);changed.source.manifestSha256 = '0'.repeat(64);
 assert.throws(() => verifySource(changed), /fingerprint/);
});
test('missing or malformed source revision cannot pass provenance verification', () => {
 assert.throws(() => committedManifest('f'.repeat(40)), /unavailable/);
 assert.throws(() => committedManifest('HEAD:README.md'), /Invalid/);
});
