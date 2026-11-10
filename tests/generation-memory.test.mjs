import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateResult,summarizeGenerationMemory} from '../tools/results.mjs';
import {renderReport} from '../tools/report.mjs';

const source='results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/result.json';
const scope='owned-chrome-process-tree-rss-including-browser-baseline';
const goodMemory=()=>({scope,generationStartedAtEpochMs:10000,finalPcmAtEpochMs:11000,samplingIntervalMs:500,availability:'measured',samples:[[10000,100],[10500,200],[11000,300]]});
async function resourceResult(){
 const result=JSON.parse(await readFile(source,'utf8'));
 result.id='generation-memory-test';
 result.protocol={...result.protocol,id:'browser-tts-cached-v1-resources',scenario:'cached',warmupRuns:0,repetitions:1,smoke:false};
 const cell=result.cells[0],trial=structuredClone(cell.trials[0]);
 cell.warmup=[];cell.trials=[trial];trial.index=1;trial.generationMs=1000;
 trial.memory=goodMemory();
 trial.metrics={articleCallPeakRssBytes:300,generationMeanRssBytes:200,generationRssSampleCount:3};
 return result;
}

test('resource memory summary averages only in-window samples and names insufficient evidence',()=>{
 assert.deepEqual(summarizeGenerationMemory(goodMemory()),{availability:'measured',count:3,mean:200});
 assert.deepEqual(summarizeGenerationMemory({...goodMemory(),samples:[[10000,100]]}),{availability:'insufficient-samples',count:1,mean:null});
 const sparse={...goodMemory(),samples:[[10000,100],[11000,300]]};
 assert.deepEqual(summarizeGenerationMemory(sparse),{availability:'measured',count:2,mean:200});
 const outside={...goodMemory(),samples:[[10000,100],[10500,200],[11000,300]]};
 assert.deepEqual(summarizeGenerationMemory(outside),{availability:'measured',count:3,mean:200});
});

test('coverage tolerates isolated missed polls but enforces count, edge and gap limits',()=>{
 const window=(duration,samples)=>({generationStartedAtEpochMs:10000,finalPcmAtEpochMs:10000+duration,samplingIntervalMs:500,samples:samples.map(at=>[at,100])});
 assert.equal(summarizeGenerationMemory(window(2500,[10000,10500,12000,12500])).availability,'measured');
 assert.equal(summarizeGenerationMemory(window(2500,[10000,10500,12500])).availability,'insufficient-coverage');
 assert.equal(summarizeGenerationMemory(window(6000,[12000,12500,13000,13500,14000,14500,15000,15500,15800,16000])).availability,'measured');
 assert.equal(summarizeGenerationMemory(window(6000,[12001,12500,13000,13500,14000,14500,15000,15500,15800,16000])).availability,'insufficient-coverage');
 assert.equal(summarizeGenerationMemory(window(6000,[10000,10500,11000,11500,12000,12500,13000,13500,13800,14000])).availability,'measured');
 assert.equal(summarizeGenerationMemory(window(6000,[10000,10500,11000,11500,12000,12500,13000,13500,13800,13999])).availability,'insufficient-coverage');
 assert.equal(summarizeGenerationMemory(window(6000,[10000,15000,15100,15200,15300,15400,15500,15600,15700,15800])).availability,'measured');
 assert.equal(summarizeGenerationMemory(window(6000,[10000,15001,15100,15200,15300,15400,15500,15600,15700,15800])).availability,'insufficient-coverage');
});

test('resource result reconciles the generation window, raw RSS, count, mean and whole-call peak',async()=>{
 const result=await resourceResult();
 assert.equal(validateResult(result),result);
 for(const mutate of [
  d=>d.cells[0].trials[0].metrics.generationMeanRssBytes=201,
  d=>d.cells[0].trials[0].metrics.generationRssSampleCount=2,
  d=>d.cells[0].trials[0].metrics.articleCallPeakRssBytes=299,
  d=>d.cells[0].trials[0].memory.samples[1][0]=9999,
  d=>d.cells[0].trials[0].memory.samples[1][0]=11001,
  d=>d.cells[0].trials[0].memory.samples.reverse(),
  d=>d.cells[0].trials[0].memory.finalPcmAtEpochMs+=10,
  d=>d.cells[0].trials[0].memory.availability='insufficient-coverage',
 ]){const changed=structuredClone(result);mutate(changed);assert.throws(()=>validateResult(changed));}
});

test('insufficient sample coverage is explicit and never gets a fabricated mean',async()=>{
 const result=await resourceResult(),trial=result.cells[0].trials[0];
 trial.memory.samples=[[10000,100],[11000,300]];
 trial.memory.availability='measured';trial.metrics.generationMeanRssBytes=200;trial.metrics.generationRssSampleCount=2;
 assert.equal(validateResult(result),result);
 trial.memory.samples=[[10000,100],[11000,300]];
 trial.memory.generationStartedAtEpochMs=10000;trial.memory.finalPcmAtEpochMs=12000;
 trial.generationMs=2000;trial.memory.availability='insufficient-coverage';trial.metrics.generationMeanRssBytes=null;
 assert.equal(validateResult(result),result);
 trial.metrics.generationMeanRssBytes=0;
 assert.throws(()=>validateResult(result),/Generation mean RSS/);
});

test('timing-only results preserve their existing shape and report names the RSS scopes',async()=>{
 const result=JSON.parse(await readFile(source,'utf8'));
 assert.equal(validateResult(result),result);
 const resource=await resourceResult(),report=renderReport(resource).markdown;
 assert.ok(report.includes('Whole-call Chrome process-tree peak RSS'));
 assert.ok(report.includes('Per-trial mean generation Chrome process-tree RSS'));
 assert.ok(report.includes('In-window Chrome RSS observations'));
});
