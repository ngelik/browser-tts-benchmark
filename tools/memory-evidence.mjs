import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {readResult,sha256} from './results.mjs';
const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9._-]{0,119}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
export const averageRssBytes=e=>mean(e.trials.map(t=>mean(t.samples.map(s=>s[1]))));
export function validateMemoryEvidence(e,result,resultDigest){
 assert.equal(e.schemaVersion,1);assert.equal(e.method,'mean-of-trial-sample-means');
 assert.equal(e.scope,'historical-synthesis-chrome-process-tree-rss');assert.equal(e.nominalIntervalMs,500);
 assert.ok(slug(e.resultId)&&slug(e.model));assert.ok(['cpu','webgpu'].includes(e.backend));
 assert.equal(e.resultId,result.id);assert.equal(e.resultSha256,resultDigest);assert.equal(result.origin,'historical-import');assert.equal(result.protocol.scenario,'warm');
 assert.equal(e.sourceSummarySha256,result.source.manifestSha256);
 const cell=result.cells.find(c=>c.model===e.model&&c.backendRequested===e.backend);assert.ok(cell&&cell.status==='measured');assert.equal(e.trials.length,cell.trials.length);
 for(const [i,t]of e.trials.entries()){
  const original=cell.trials[i];assert.equal(t.index,original.index);assert.equal(t.wavSha256,original.audio.sha256);assert.ok(typeof t.originalRunId==='string'&&/^[a-z0-9T-]+$/i.test(t.originalRunId));
  assert.ok(Number.isFinite(t.startEpochMs)&&Number.isFinite(t.endEpochMs)&&t.endEpochMs>t.startEpochMs);
  assert.ok(Math.abs(t.endEpochMs-t.startEpochMs-original.generationMs)<0.01);
  for(const key of ['eventsSha256','processSamplesSha256','chromeEvidenceSha256'])assert.ok(hash(t[key]));
  assert.ok(Array.isArray(t.samples)&&t.samples.length>=2);let previous=-1;
  for(const sample of t.samples){assert.equal(sample.length,2);const [offset,rss]=sample;assert.ok(Number.isFinite(offset)&&offset>=0&&offset<=t.endEpochMs-t.startEpochMs&&offset>previous);assert.ok(Number.isSafeInteger(rss)&&rss>0);previous=offset;}
  assert.equal(t.boundarySamples.length,2);
  t.boundarySamples.forEach((s,i)=>{assert.equal(s.length,2);assert.ok(Number.isFinite(s[0])&&Number.isSafeInteger(s[1])&&s[1]>0);assert.ok(i===0?s[0]<=0:s[0]>=t.endEpochMs-t.startEpochMs);});
  assert.equal(Math.max(...[...t.samples,...t.boundarySamples].map(s=>s[1])),original.metrics.synthesisPeakRssBytes);
 }
 return e;
}
export async function loadMemoryEvidence(root='memory-evidence'){
 let folders;try{folders=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const all=[],seen=new Set();
 for(const dir of folders){assert.ok(dir.isDirectory()&&!dir.isSymbolicLink()&&slug(dir.name));
  const resultPath=join('results',dir.name,'result.json'),raw=await readFile(resultPath),result=await readResult(resultPath,{publication:true});
  for(const file of await readdir(join(root,dir.name),{withFileTypes:true})){
   assert.ok(file.isFile()&&!file.isSymbolicLink()&&file.name.endsWith('.json'));const path=join(root,dir.name,file.name);const bytes=await readFile(path);assert.ok(bytes.length<2000000);
   const e=validateMemoryEvidence(JSON.parse(bytes),result,sha256(raw));assert.equal(file.name,e.model+'-'+e.backend+'.json');
   const key=e.resultId+'/'+e.model+'/'+e.backend;assert.ok(!seen.has(key));seen.add(key);all.push({...e,path});
  }
 }
 return all;
}
