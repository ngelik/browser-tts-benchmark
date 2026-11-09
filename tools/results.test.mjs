import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateResult, median } from './results.mjs';
import { renderReport } from './report.mjs';
const historical=JSON.parse(await readFile(new URL('../results/historical-2026-11-08-m1pro-gpu-warm/result.json',import.meta.url)));
const native=()=>{const d=structuredClone(historical);d.origin='native';d.source.gitCommit='a'.repeat(40);d.protocol.id='browser-tts-warm-v1';d.cells=d.cells.filter(c=>c.status==='measured').slice(0,1);return d;};
test('historical provenance preserves real GPU evidence and unsupported cells',()=>{assert.equal(validateResult(historical,{publication:true}).cells.length,12);});
test('smoke and dirty-source measurements cannot be published',()=>{for(const modify of[d=>d.protocol.smoke=true,d=>d.source.dirty=true]){const d=native();modify(d);assert.throws(()=>validateResult(d,{publication:true}));}});
test('GPU interface availability cannot substitute for actual dispatch',()=>{const d=native();d.cells[0].capability.gpuDispatchVerified=false;assert.throws(()=>validateResult(d,{publication:true}),/dispatch/);});
test('incomplete full article and missing repetition cannot pass',()=>{for(const modify of[d=>d.cells[0].trials[0].validation.chunkCount=92,d=>d.cells[0].trials.pop(),d=>d.cells[0].warmup=[]]){const d=native();modify(d);assert.throws(()=>validateResult(d,{publication:true}));}});
test('empty, negative and nonfinite scores are rejected',()=>{for(const value of[0,-1,NaN,Infinity]){const d=native();d.cells[0].trials[0].generationMs=value;assert.throws(()=>validateResult(d));}});
test('unknown payloads and private paths are rejected',()=>{const d=native();d.environment.machineLabel=['','Users','private','machine'].join('/');assert.throws(()=>validateResult(d),/Private/);const e=native();e.credentials='hidden';assert.throws(()=>validateResult(e),/unexpected/);});
test('native trials cannot substitute a WAV hash for missing float PCM evidence',()=>{const d=native();d.cells[0].trials[0].pcmSha256=null;assert.throws(()=>validateResult(d));});
test('report is deterministic, escapes labels and never plots unsupported as zero',()=>{const d=structuredClone(historical);d.environment.machineLabel='<script>alert(1)</script>';const a=renderReport(d);assert.deepEqual(a,renderReport(d));assert.ok(a.svg.includes('&lt;script&gt;'));assert.ok(!a.svg.includes('<script>'));assert.ok(a.svg.includes('unsupported — no score'));assert.equal(median([9,1,4,2,3]),3);});
test('overview CPU/GPU labels and medians reconcile with distinct historical protocols',async()=>{
 const overview=JSON.parse(await readFile(new URL('../docs/reference-data.json',import.meta.url)));
 const old=JSON.parse(await readFile(new URL('../results/historical-2026-11-08-m1pro-primary-warm/result.json',import.meta.url)));
 for(const row of overview.rows){const cpu=old.cells.find(c=>c.model===row.caseId&&c.backendRequested==='cpu');const gpu=historical.cells.find(c=>c.model===row.caseId&&c.backendRequested==='webgpu');if(cpu)assert.ok(Math.abs(row.cpuWarmSeconds-median(cpu.trials.map(t=>t.generationMs))/1000)<1e-6);else assert.equal(row.cpuWarmSeconds,null);assert.ok(Math.abs(row.gpuWarmSeconds-median(gpu.trials.map(t=>t.generationMs))/1000)<1e-6);}
});
