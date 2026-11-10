import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadMemoryEvidence,validateMemoryEvidence,averageRssBytes} from '../tools/memory-evidence.mjs';
import {sha256} from '../tools/results.mjs';
import {referenceBlock} from '../tools/reference.mjs';
import {getAssetLock} from '../lib/catalog.mjs';
const path='results/historical-2026-11-08-m1pro-primary-warm/result.json';
const bytes=await readFile(path), result=JSON.parse(bytes), evidence=await loadMemoryEvidence();
const plain=()=>{const {path,...e}=evidence[0];return structuredClone(e);};
test('average gives trials equal weight and excludes boundary observations',()=>{
 assert.equal(averageRssBytes({trials:[{samples:[[1,100],[2,300]],boundarySamples:[[-1,9999],[3,9999]]},{samples:[[1,1000]]}]}),600);
});
test('historical sample evidence binds every trial to the unchanged result and published peaks',()=>{
 assert.equal(evidence.length,6);
 for(const e of evidence){validateMemoryEvidence(e,result,sha256(bytes));assert.ok(averageRssBytes(e)>0);assert.equal(e.trials.length,5);}
 for(const mutate of [e=>e.trials.pop(),e=>e.resultSha256='0'.repeat(64),e=>e.trials[0].wavSha256='0'.repeat(64),e=>e.trials[0].samples[0][0]=-1,e=>e.trials[0].samples[0][1]=Infinity,e=>e.trials[0].endEpochMs+=100,e=>e.trials[0].samples[0][1]=Number.MAX_SAFE_INTEGER,e=>e.trials[0].boundarySamples[0][0]=1]){
  const e=plain();mutate(e);assert.throws(()=>validateMemoryEvidence(e,result,sha256(bytes)));
 }
});
test('memory never leaks into a different run and model size rejects unmatched weight receipts',()=>{
 const block=referenceBlock([result],getAssetLock().models,[],[],evidence);
 assert.ok(block.includes('| 64.51 |'));assert.ok(block.includes('[1475.50]('));
 const other=structuredClone(result);other.id='different-warm-run';other.assets=[];
 const newBlock=referenceBlock([other],getAssetLock().models,[],[],evidence);
 assert.ok(newBlock.includes('Not measured'));assert.ok(newBlock.includes('Unknown'));assert.ok(!newBlock.includes('[1475.50]('));
});
