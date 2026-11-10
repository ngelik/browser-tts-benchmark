import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {sha256,readResult} from './results.mjs';
import {validateMemoryEvidence,averageRssBytes} from './memory-evidence.mjs';
const archive=resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('Usage: node tools/import-historical-memory.mjs ARCHIVE_ROOT');
const summaryBytes=await readFile(join(archive,'outputs/campaign-summary.json')),summary=JSON.parse(summaryBytes);
const resultId='historical-2026-11-08-m1pro-primary-warm';const resultBytes=await readFile(join('results',resultId,'result.json')),result=await readResult(join('results',resultId,'result.json'),{publication:true});
assert.equal(sha256(summaryBytes),result.source.manifestSha256);
const output=join('memory-evidence',resultId);await mkdir(output,{recursive:true});
for(const cell of result.cells){
 const trials=[];
 for(const trial of cell.trials){
  const candidates=summary.trials.filter(t=>t.comparisonIncluded===true&&t.status==='success'&&t.runKind==='primary-warm'&&t.caseId===cell.model&&t.wavSha256===trial.audio.sha256&&Math.abs(t.generationMs-trial.generationMs)<0.001);
  assert.equal(candidates.length,1);const source=candidates[0];assert.equal(source.sampleRate,trial.sampleRate);assert.ok(Math.abs(source.audioSeconds-trial.samples/trial.sampleRate)<0.001);
  // Resolve only the public artifact directory name within the supplied archive.
  const folder=join(archive,'results/chrome',basename(dirname(source.evidencePath)));assert.ok(folder.startsWith(archive+sep));
  const evidenceBytes=await readFile(join(folder,'chrome-evidence.json')),evidence=JSON.parse(evidenceBytes);const run=evidence.runRecords.find(r=>r.runId===source.runId);assert.ok(run);
  const matches=[];
  for(const name of await readdir(folder)){if(!/^run-events-[0-9]+\.json$/.test(name))continue;const bytes=await readFile(join(folder,name)),events=JSON.parse(bytes).filter(e=>e.runId===source.runId);const start=events.filter(e=>e.type==='synthesis-start'),end=events.filter(e=>e.type==='final-pcm');if(start.length||end.length){assert.equal(start.length,1);assert.equal(end.length,1);matches.push({bytes,start:start[0],end:end[0]});}}
  assert.equal(matches.length,1);const {bytes:eventsBytes,start,end}=matches[0];assert.equal(start.articleSha256,result.fixture.sha256);assert.equal(start.characters,20000);assert.equal(start.chunkCount,93);assert.equal(end.samples,trial.samples);assert.ok(Math.abs(end.generationMs-trial.generationMs)<0.001);
  assert.ok(Math.abs(start.at-run.synthesisStartedAt)<=1&&Math.abs(end.at-run.finalPcmAt)<=1);
  const windowStart=run.synthesisStartedAt,windowEnd=run.finalPcmAt;
  const samplesBytes=await readFile(join(folder,'process-samples.jsonl'));const all=samplesBytes.toString('utf8').trim().split('\n').map(JSON.parse).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const observations=all.filter(s=>Date.parse(s.at)>=windowStart&&Date.parse(s.at)<=windowEnd);
  const brackets=[all.filter(s=>Date.parse(s.at)<=windowStart).at(-1),all.find(s=>Date.parse(s.at)>=windowEnd)];assert.ok(brackets.every(Boolean));
  for(const s of [...observations,...brackets])assert.ok(s.rootPresent===true&&Number.isSafeInteger(s.summedRssBytes)&&s.summedRssBytes>0);
  const convert=s=>[Date.parse(s.at)-windowStart,s.summedRssBytes];const samples=observations.map(convert),boundarySamples=brackets.map(convert);
  trials.push({index:trial.index,originalRunId:source.runId,wavSha256:trial.audio.sha256,startEpochMs:windowStart,endEpochMs:windowEnd,eventsSha256:sha256(eventsBytes),processSamplesSha256:sha256(samplesBytes),chromeEvidenceSha256:sha256(evidenceBytes),samples,boundarySamples});
 }
 const data={schemaVersion:1,resultId,resultSha256:sha256(resultBytes),sourceSummarySha256:sha256(summaryBytes),model:cell.model,backend:cell.backendRequested,scope:'historical-synthesis-chrome-process-tree-rss',method:'mean-of-trial-sample-means',nominalIntervalMs:500,trials};
 validateMemoryEvidence(data,result,sha256(resultBytes));await writeFile(join(output,cell.model+'-'+cell.backendRequested+'.json'),JSON.stringify(data)+'\n');console.log(cell.model,cell.backendRequested,(averageRssBytes(data)/1e6).toFixed(2)+' MB',trials.map(t=>t.samples.length));
}
