import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateResult, median } from './results.mjs';
import { renderReport } from './report.mjs';
const historical=JSON.parse(await readFile(new URL('../results/historical-2026-11-08-m1pro-gpu-warm/result.json',import.meta.url)));
const nativeReceipt=JSON.parse(await readFile(new URL('../results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/result.json',import.meta.url)));
const native=()=>structuredClone(nativeReceipt);
test('historical provenance preserves all six measured GPU cells',()=>{assert.equal(validateResult(historical,{publication:true}).cells.length,6);});
test('smoke and dirty-source measurements cannot be published',()=>{for(const modify of[d=>d.protocol.smoke=true,d=>d.source.dirty=true]){const d=native();modify(d);assert.throws(()=>validateResult(d,{publication:true}));}});
test('native publication cannot change fixture ID, hash, length or chunk count to bypass the canonical check',()=>{const d=native();d.fixture={id:'alternate-article-v1',sha256:'b'.repeat(64),characters:19999,chunks:92};assert.throws(()=>validateResult(d,{publication:true}),/canonical fixture/);});
test('native audio-derived metrics reconcile when supplied',()=>{for(const [key,value] of [['audioSeconds',999],['realTimeFactor',999],['firstPcmMs',999999],['firstSourceChunkCompletedMs',999999]]){const d=native();d.cells[0].trials[0].metrics[key]=value;assert.throws(()=>validateResult(d),new RegExp(key));}const partial=native();delete partial.cells[0].trials[0].metrics.audioSeconds;delete partial.cells[0].trials[0].metrics.firstPcmMs;assert.doesNotThrow(()=>validateResult(partial));const missing=native();delete missing.cells[0].trials[0].metrics;assert.doesNotThrow(()=>validateResult(missing));});
test('native download estimate reconciles with byte count when both are supplied',()=>{const d=native();for(const t of d.cells[0].trials){t.metrics.downloadBytes=1000;t.metrics.idealDownloadSecondsAt1Mbps=1000/125000;}assert.doesNotThrow(()=>validateResult(d));d.cells[0].trials[0].metrics.idealDownloadSecondsAt1Mbps=99;assert.throws(()=>validateResult(d),/idealDownloadSecondsAt1Mbps/);const fractional=native();fractional.cells[0].trials[0].metrics.downloadBytes=1.5;assert.throws(()=>validateResult(fractional),/downloadBytes/);const bytesOnly=native();bytesOnly.cells[0].trials[0].metrics.downloadBytes=1000;assert.doesNotThrow(()=>validateResult(bytesOnly));const nullEstimate=native();nullEstimate.cells[0].trials[0].metrics.idealDownloadSecondsAt1Mbps=null;assert.doesNotThrow(()=>validateResult(nullEstimate));const partial=native();partial.cells[0].trials[0].metrics.idealDownloadSecondsAt1Mbps=99;assert.throws(()=>validateResult(partial),/requires integer downloadBytes/);});
test('native measured backend labels must match the requested backend',()=>{for(const [requested,effective] of [['cpu','webgpu'],['webgpu','cpu/wasm']]){const d=native();d.cells[0].backendRequested=requested;d.cells[0].backendEffective=effective;assert.throws(()=>validateResult(d),/Effective backend/);}for(const [requested,effective] of [['webgpu','webgpu+wasm']]){const d=native();d.cells[0].backendRequested=requested;d.cells[0].backendEffective=effective;d.cells[0].capability.gpuDispatchVerified=true;assert.doesNotThrow(()=>validateResult(d));}});
test('historical imports retain their original metrics without native reconciliation rules',()=>{const d=structuredClone(historical);const t=d.cells.find(c=>c.status==='measured').trials[0];t.metrics={audioSeconds:999,realTimeFactor:999,firstPcmMs:999,firstSourceChunkCompletedMs:999,downloadBytes:100,idealDownloadSecondsAt1Mbps:999};assert.doesNotThrow(()=>validateResult(d));});
test('GPU interface availability cannot substitute for actual dispatch',()=>{const d=native();d.cells[0].backendRequested='webgpu';d.cells[0].backendEffective='webgpu+wasm';d.cells[0].capability.gpuDispatchVerified=false;assert.throws(()=>validateResult(d,{publication:true}),/dispatch/);});
test('incomplete full article and missing repetition cannot pass',()=>{for(const modify of[d=>d.cells[0].trials[0].validation.chunkCount=92,d=>d.cells[0].trials.pop(),d=>d.cells[0].warmup=[]]){const d=native();modify(d);assert.throws(()=>validateResult(d,{publication:true}));}});
test('empty, negative and nonfinite scores are rejected',()=>{for(const value of[0,-1,NaN,Infinity]){const d=native();d.cells[0].trials[0].generationMs=value;assert.throws(()=>validateResult(d));}});
test('unknown payloads and private paths are rejected',()=>{const d=native();d.environment.machineLabel=['','Users','private','machine'].join('/');assert.throws(()=>validateResult(d),/Private/);const e=native();e.credentials='hidden';assert.throws(()=>validateResult(e),/unexpected/);});
test('native trials cannot substitute a WAV hash for missing float PCM evidence',()=>{const d=native();d.cells[0].trials[0].pcmSha256=null;assert.throws(()=>validateResult(d));});
test('report is deterministic, escapes labels and never plots unsupported as zero',()=>{const d=structuredClone(historical);d.environment.machineLabel='<script>alert(1)</script>';d.cells[0].status='unsupported';d.cells[0].trials=[];d.cells[0].reason='Unavailable diagnostic';const a=renderReport(d);assert.deepEqual(a,renderReport(d));assert.ok(a.svg.includes('&lt;script&gt;'));assert.ok(!a.svg.includes('<script>'));assert.ok(a.svg.includes('unsupported — no score'));assert.equal(median([9,1,4,2,3]),3);});
test('chart truncates long model labels accessibly and preserves short labels exactly',()=>{
 const d=native();
 const short=renderReport(d).svg;
 assert.ok(short.includes('<text x="24" y="115" font-size="14">paradee</text>'));
 assert.ok(!short.includes('aria-label="paradee"'));
 const model='piper-en-gb-southern-english-female-low';
 d.cells[0].model=model;
 const svg=renderReport(d).svg;
 assert.ok(svg.includes(`aria-label="${model}"`));
 assert.ok(svg.includes(`<title>${model}</title>${model.slice(0,25)}…`));
});
test('overview CPU/GPU labels and medians reconcile with distinct historical protocols',async()=>{
 const overview=JSON.parse(await readFile(new URL('../docs/reference-data.json',import.meta.url)));
 const old=JSON.parse(await readFile(new URL('../results/historical-2026-11-08-m1pro-primary-warm/result.json',import.meta.url)));
 for(const row of overview.rows){const cpu=old.cells.find(c=>c.model===row.caseId&&c.backendRequested==='cpu');const gpu=historical.cells.find(c=>c.model===row.caseId&&c.backendRequested==='webgpu');if(cpu)assert.ok(Math.abs(row.cpuWarmSeconds-median(cpu.trials.map(t=>t.generationMs))/1000)<1e-6);else assert.equal(row.cpuWarmSeconds,null);assert.ok(Math.abs(row.gpuWarmSeconds-median(gpu.trials.map(t=>t.generationMs))/1000)<1e-6);}
});
