import { validateSupport } from '../lib/model-support.mjs';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const FIXTURE_SHA = '4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const text = (x, max=500) => typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
const slug = x => typeof x === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(x);
const keys = (x, allowed, at) => { check(object(x), `${at}: expected object`); for (const k of Object.keys(x)) check(allowed.includes(k), `${at}: unexpected field ${k}`); };
const int = (x, low=0, high=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= low && x <= high;
const closeEnough = (actual, expected) => Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);

function validateNativeMetrics(t) {
  const m=t.metrics;
  if(!object(m))return;
  const audioSeconds=t.samples/t.sampleRate;
  const realTimeFactor=t.generationMs/(audioSeconds*1000);
  const timingTolerance=Math.max(0.01,t.generationMs*1e-6);
  if(m.audioSeconds!==undefined&&m.audioSeconds!==null)check(closeEnough(m.audioSeconds,audioSeconds),'Native audioSeconds must equal samples/sampleRate');
  if(m.realTimeFactor!==undefined&&m.realTimeFactor!==null)check(closeEnough(m.realTimeFactor,realTimeFactor),'Native realTimeFactor must equal generationMs/audio duration');
  for(const name of ['firstPcmMs','firstSourceChunkCompletedMs'])if(m[name]!==undefined&&m[name]!==null)check(m[name]<=t.generationMs+timingTolerance,'Native '+name+' cannot exceed generationMs');
  if(m.downloadBytes!==undefined&&m.downloadBytes!==null)check(int(m.downloadBytes),'Native downloadBytes must be an integer');
  if(m.idealDownloadSecondsAt1Mbps!==undefined&&m.idealDownloadSecondsAt1Mbps!==null){
    check(int(m.downloadBytes),'Native idealDownloadSecondsAt1Mbps requires integer downloadBytes');
    check(closeEnough(m.idealDownloadSecondsAt1Mbps,m.downloadBytes/125000),'Native idealDownloadSecondsAt1Mbps must equal downloadBytes/125000');
  }
}

const GENERATION_RSS_SCOPE='owned-chrome-process-tree-rss-including-browser-baseline';
export function summarizeGenerationMemory(memory) {
  const samples=memory.samples;
  const count=samples.length;
  if(count<2)return {availability:'insufficient-samples',count,mean:null};
  const start=memory.generationStartedAtEpochMs,end=memory.finalPcmAtEpochMs,interval=memory.samplingIntervalMs,edgeToleranceMs=2000,maxGapMs=5000;
  const first=samples[0][0],last=samples.at(-1)[0];
  const largestGap=samples.slice(1).reduce((max,sample,i)=>Math.max(max,sample[0]-samples[i][0]),0);
  const expectedSamples=Math.max(2,Math.floor((end-start)/interval));
  const covered=count>=Math.ceil(expectedSamples*0.8)&&first-start<=edgeToleranceMs&&end-last<=edgeToleranceMs&&largestGap<=maxGapMs;
  if(!covered)return {availability:'insufficient-coverage',count,mean:null};
  const mean=Math.round(samples.reduce((sum,sample)=>sum+sample[1],0)/count);
  return {availability:'measured',count,mean};
}

function validateGenerationMemory(t,generationMs) {
  const memory=t.memory;
  keys(memory,['scope','generationStartedAtEpochMs','finalPcmAtEpochMs','samplingIntervalMs','availability','samples'],'trial.memory');
  check(memory.scope===GENERATION_RSS_SCOPE,'Invalid generation memory scope');
  const start=memory.generationStartedAtEpochMs,end=memory.finalPcmAtEpochMs;
  check(finite(start)&&start>0&&finite(end)&&end>start,'Invalid generation memory time window');
  check(Math.abs((end-start)-generationMs)<=Math.max(0.01,generationMs*1e-6),'Generation memory window must match generationMs');
  check(memory.samplingIntervalMs===500,'Generation RSS sampling interval must be 500 ms');
  check(Array.isArray(memory.samples)&&memory.samples.length<=100000,'Invalid generation RSS samples');
  let previous=-Infinity;
  for(const [i,sample] of memory.samples.entries()){
    check(Array.isArray(sample)&&sample.length===2,'Generation RSS samples must be [epochMs, rssBytes] pairs');
    const [at,rss]=sample;
    check(finite(at)&&at>=start&&at<=end&&at>previous,'Generation RSS timestamps must be ordered and inside the PCM window');
    check(int(rss,1),'Generation RSS values must be positive integer bytes');
    previous=at;
  }
  const summary=summarizeGenerationMemory(memory);
  check(memory.availability===summary.availability,'Generation RSS availability does not match sample coverage');
  const metrics=t.metrics;
  check(object(metrics),'Resource-enabled trials require memory metrics');
  check(metrics.generationRssSampleCount===summary.count,'Generation RSS sample count does not match raw samples');
  check(metrics.generationMeanRssBytes===summary.mean,'Generation mean RSS does not match raw in-window samples');
  const peak=metrics.articleCallPeakRssBytes;
  if(memory.samples.length){
    const observedPeak=memory.samples.reduce((max,sample)=>Math.max(max,sample[1]),0);
    check(int(peak,observedPeak),'Whole-call Chrome RSS peak must include every in-window RSS observation');
  } else check(peak===null||int(peak,1),'Whole-call Chrome RSS peak must be positive integer bytes or null');
  return summary;
}

function validateNativeBackend(c) {
  const labels={
    cpu:/^(?:cpu|cpu\/wasm|wasm)$/i,
    webgpu:/^(?:webgpu|webgpu\+wasm)$/i,
  };
  check(labels[c.backendRequested].test(c.backendEffective),`Effective backend ${c.backendEffective} does not match requested ${c.backendRequested}`);
}

export function validateResult(d, { publication = false } = {}) {
  keys(d, ['schemaVersion','id','createdAt','origin','protocol','environment','fixture','source','assets','cells','notes'], 'result');
  check(d.schemaVersion === 1 && slug(d.id), 'Invalid result version/id');
  check(text(d.createdAt,40) && Number.isFinite(Date.parse(d.createdAt)), 'Invalid createdAt');
  check(['native','historical-import'].includes(d.origin), 'Invalid origin');
  const p=d.protocol;
  keys(p,['id','scenario','timingBoundary','warmupRuns','repetitions','smoke','networkMbps'],'protocol');
  check(slug(p.id) && ['warm','cold','cached','network','offline','switch'].includes(p.scenario), 'Invalid protocol/scenario');
  check(text(p.timingBoundary,1000) && int(p.warmupRuns,0,100) && int(p.repetitions,1,100), 'Invalid protocol counts/boundary');
  check(typeof p.smoke === 'boolean' && (p.networkMbps === null || finite(p.networkMbps) && p.networkMbps > 0), 'Invalid smoke/network setting');
  if (publication) check(!p.smoke, 'Smoke results cannot be published as benchmark scores');
  if (d.origin==='native' && p.scenario==='warm' && !p.smoke) check(p.warmupRuns>=1 && p.repetitions>=5,'Full warm benchmark requires a full warm-up and at least five scored repetitions');
  const e=d.environment;
  keys(e,['machineLabel','os','arch','cpu','logicalCores','ramBytes','chromeVersion','gpu','headless'],'environment');
  for(const k of ['machineLabel','os','arch','cpu','chromeVersion']) check(text(e[k],200),`Invalid environment.${k}`);
  check(int(e.logicalCores,1,4096) && (e.ramBytes===null || int(e.ramBytes,1)) && (e.gpu===null || text(e.gpu,300)) && typeof e.headless==='boolean','Invalid hardware/browser metadata');
  if(publication) check(!e.headless,'Ranked contributions require headed Chrome; headless runs are diagnostics');
  keys(d.fixture,['id','sha256','characters','chunks'],'fixture');
  check(slug(d.fixture.id) && hash(d.fixture.sha256) && int(d.fixture.characters,1,10000000) && int(d.fixture.chunks,1,100000),'Invalid fixture');
  const canonicalFixture=d.fixture.id==='english-20k-v1' && d.fixture.sha256===FIXTURE_SHA && d.fixture.characters===20000 && d.fixture.chunks===93;
  if(!p.smoke && d.fixture.id==='english-20k-v1') check(canonicalFixture,'Canonical fixture mismatch');
  if(publication && d.origin==='native' && !p.smoke) check(canonicalFixture,'Native publication requires the canonical fixture');
  keys(d.source,['gitCommit','dirty','manifestSha256'],'source');
  check((d.source.gitCommit===null || /^[a-f0-9]{40,64}$/.test(d.source.gitCommit)) && typeof d.source.dirty==='boolean' && hash(d.source.manifestSha256),'Invalid source provenance');
  if(publication && d.origin==='native') check(d.source.gitCommit!==null && !d.source.dirty,'Publish native runs from a clean committed checkout');
  check(Array.isArray(d.assets) && d.assets.length>0 && d.assets.length<=1000,'Assets required');
  const assetIds=new Set();
  for(const a of d.assets){keys(a,['id','sha256','bytes'],'asset');check(text(a.id,200)&&!assetIds.has(a.id)&&hash(a.sha256)&&int(a.bytes,1),'Invalid/duplicate asset');assetIds.add(a.id);}
  check(Array.isArray(d.cells) && d.cells.length>0 && d.cells.length<=1000,'Cells required');
  const cellIds=new Set();
  for(const c of d.cells){
    keys(c,['model','support','backendRequested','backendEffective','status','reason','voice','precision','settings','capability','warmup','trials'],'cell');
    check(slug(c.model) && ['cpu','webgpu'].includes(c.backendRequested) && text(c.backendEffective,150),'Invalid model/backend');
    if(c.support!==undefined)validateSupport(c.support);
    const id=c.model+'/'+c.backendRequested;check(!cellIds.has(id),'Duplicate cell');cellIds.add(id);
    check(['measured','unsupported','error'].includes(c.status) && (c.reason===null || text(c.reason,2000)),'Invalid status/reason');
    check(text(c.voice,150)&&text(c.precision,100)&&object(c.settings),'Voice, precision and settings are required');
    keys(c.capability,['gpuDispatchVerified','description'],'capability');
    check([true,false,null].includes(c.capability.gpuDispatchVerified)&&text(c.capability.description,2000),'Invalid capability');
    check(Array.isArray(c.warmup)&&Array.isArray(c.trials),'Trial arrays required');
    if(c.status==='measured'){
      check(c.trials.length===p.repetitions && c.warmup.length===p.warmupRuns,'Measured cell repetition count mismatch');
      if(d.origin==='native')validateNativeBackend(c);
      if(c.backendRequested!=='cpu')check(c.capability.gpuDispatchVerified===true,'GPU results require actual dispatch evidence');
    } else check(text(c.reason,2000),'Unsupported/error cell requires a reason');
    if(c.status==='unsupported')check(c.trials.length===0,'Unsupported cell cannot contain scores');
    check(c.trials.length<=p.repetitions && c.warmup.length<=p.warmupRuns,'Too many trials');
    for(const [group, trials] of [['warmup',c.warmup],['trials',c.trials]]) for(const [i,t] of trials.entries()){
      keys(t,['index','generationMs','samples','sampleRate','pcmSha256','validation','audio','metrics','memory'],'trial');
      check(t.index===i+1 && finite(t.generationMs)&&t.generationMs>0&&int(t.samples,1)&&int(t.sampleRate,8000,192000)&&(hash(t.pcmSha256)||(d.origin==='historical-import'&&t.pcmSha256===null)),'Invalid trial/index/PCM');
      keys(t.validation,['finitePcm','chunkCount','nonemptyChunks'],'validation');
      check((t.validation.finitePcm===true||(d.origin==='historical-import'&&t.validation.finitePcm===null)) && t.validation.nonemptyChunks===true && t.validation.chunkCount===d.fixture.chunks,`${group}: invalid PCM/chunk coverage`);
      if(t.pcmSha256===null)check(t.audio&&hash(t.audio.sha256),'Historical records without float PCM hashes require WAV hashes');
      if(t.audio!==undefined){keys(t.audio,['sha256','bytes'],'audio');check(hash(t.audio.sha256)&&int(t.audio.bytes,1),'Invalid audio digest');}
      if(t.metrics!==undefined){check(object(t.metrics),'Invalid metrics');for(const [k,v] of Object.entries(t.metrics))check(/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(k)&&(v===null||finite(v)&&v>=0),'Metrics must be finite, nonnegative or null');}
      if(d.origin==='native'&&t.metrics!==undefined)validateNativeMetrics(t);
      const resourceRun=d.origin==='native'&&p.id.endsWith('-resources');
      if(resourceRun)validateGenerationMemory(t,t.generationMs);
      else check(t.memory===undefined&&t.metrics?.generationMeanRssBytes===undefined&&t.metrics?.generationRssSampleCount===undefined,'Generation memory evidence is only valid in native --resources runs');
    }
  }
  if(d.notes!==undefined)check(Array.isArray(d.notes)&&d.notes.length<=50&&d.notes.every(n=>text(n,2000)),'Invalid notes');
  const raw=JSON.stringify(d);
  check(raw.length<2000000,'Result exceeds 2 MB limit');
  check(!/(?:\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})/.test(raw),'Private path or credential-like string in result');
  return d;
}
export const median = values => {const a=[...values].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
export const summaries = d => d.cells.map(c=>({model:c.model,backend:c.backendRequested,effective:c.backendEffective,status:c.status,n:c.trials.length,medianSeconds:c.status==='measured'?median(c.trials.map(t=>t.generationMs))/1000:null,minSeconds:c.status==='measured'?Math.min(...c.trials.map(t=>t.generationMs))/1000:null,maxSeconds:c.status==='measured'?Math.max(...c.trials.map(t=>t.generationMs))/1000:null,reason:c.reason}));
export async function resultPaths(root){
  const paths=[];
  async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){check(!e.isSymbolicLink(),'Symlinks are not allowed in published results');const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name==='result.json')paths.push(p);}}
  await walk(resolve(root));return paths.sort();
}
export async function readResult(file,opts){const raw=await readFile(file);check(raw.length<2000000,'Result file too large');return validateResult(JSON.parse(raw),opts);}
