// Check the pinned WASM entry, voice catalog, and a negative part-integrity case without synthesis.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {prepareAssets} from '../lib/assets.mjs';
import {BUNDLE_REVISION, MODEL_ID, SPACE_REVISION} from '../web/ming/config.mjs';
import {validateMingManifest} from '../web/ming/contract.mjs';

if (process.argv[2] !== '--accept-license') throw new Error('Pass --accept-license after reviewing the Ming terms');
await prepareAssets(MODEL_ID, {mode:'verify', acceptLicense:true});
const staged = resolve('.cache/public');
const base = resolve(staged, 'models', MODEL_ID, BUNDLE_REVISION);
const runtime = resolve(staged, 'runtimes/ming-fusor', SPACE_REVISION, 'engine/dist/web-threaded-relaxed');
globalThis.self = globalThis;
globalThis.addEventListener = () => {}; // No thread pool is started by this metadata and integrity check.
const glue = await import(pathToFileURL(resolve(runtime, 'ming_runtime.js')));
glue.initSync({module:await readFile(resolve(runtime, 'ming_runtime_bg.wasm'))});
const voices = JSON.parse(glue.voices()).map(v=>v.id);
assert.deepEqual(voices, ['US_James','US_Emma','US_Stella','UK_George','UK_Charlotte','灵小柔','灵楷']);
const text = await readFile(resolve(base, 'manifest.json'), 'utf8');
const manifest = JSON.parse(text);
validateMingManifest(manifest);
const rt = new glue.Runtime(text);
try {
  const index = manifest.parts.findIndex(p=>p.file === 'tokenizer.json');
  const tokenizer = await readFile(resolve(base, 'tokenizer.json'));
  tokenizer[0] ^= 1;
  rt.write_part(index, tokenizer);
  assert.throws(()=>rt.end_part(index), /"kind":"integrity".*BLAKE3/);
  rt.restart_part(index);
  tokenizer[0] ^= 1;
  rt.write_part(index, tokenizer);
  assert.equal(rt.end_part(index),false); // Model weight parts remain unloaded.
} finally { rt.free(); }
console.log('PASS pinned archive, seven voices, SHA-256 receipts, and WASM BLAKE3 rejection/recovery');
