import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadMemoryEvidence,validateMemoryEvidence,averageRssBytes} from '../tools/memory-evidence.mjs';
import {sha256} from '../tools/results.mjs';
import {referenceBlock,ramReferenceBlock,ramChart} from '../tools/reference.mjs';
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
test('historical memory stays separate and model size rejects unmatched weight receipts',()=>{
 const block=referenceBlock([result],getAssetLock().models);
 assert.ok(block.includes('| 64.51 |'));assert.ok(!block.includes('[1475.50]('));
 const other=structuredClone(result);other.id='different-warm-run';other.assets=[];
 const newBlock=referenceBlock([other],getAssetLock().models);
 assert.ok(newBlock.includes('Unknown'));assert.ok(!newBlock.includes('Not measured'));
});
test('RAM table keeps source and protocol cohorts separate and retains unsupported cells',()=>{
 const make=(id,backend,mean)=>{
  const d=structuredClone(result);d.id=id;d.origin='native';d.source.gitCommit='a'.repeat(40);d.protocol={...d.protocol,id:'browser-tts-v1-resources',scenario:'cached',repetitions:1,smoke:false};
  d.cells=[{model:'phonon',backendRequested:backend,status:'measured',trials:[{metrics:{generationMeanRssBytes:mean},memory:{}}]}];return d;
 };
 const cpu=make('cpu','cpu',100e6),gpu=make('gpu','webgpu',200e6);
 let block=ramReferenceBlock([cpu,gpu],getAssetLock().models);
 assert.equal((block.match(/\*\*RAM /g)||[]).length,1);assert.ok(block.includes('[100.00]'));assert.ok(block.includes('[200.00]'));
 const chart=ramChart([cpu,gpu],getAssetLock().models);assert.ok(chart.includes('100.00 MB'));assert.ok(chart.includes('200.00 MB'));assert.ok(!chart.includes('NaN'));assert.equal(ramChart([],getAssetLock().models),null);
 gpu.source.manifestSha256='f'.repeat(64);
 block=ramReferenceBlock([cpu,gpu],getAssetLock().models);assert.equal((block.match(/\*\*RAM /g)||[]).length,2);
 gpu.source.manifestSha256=cpu.source.manifestSha256;gpu.protocol.repetitions=2;
 block=ramReferenceBlock([cpu,gpu],getAssetLock().models);assert.equal((block.match(/\*\*RAM /g)||[]).length,2);
 gpu.protocol=cpu.protocol;gpu.cells[0].status='unsupported';gpu.cells[0].trials=[];
 assert.ok(ramReferenceBlock([cpu,gpu],getAssetLock().models).includes('[unsupported]'));
 cpu.cells[0].trials[0].metrics={};
 assert.ok(!ramReferenceBlock([cpu],getAssetLock().models).includes('[100.00]'));
});
