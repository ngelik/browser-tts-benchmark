import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { startServer } from './server.mjs';
import { prepareAssets } from './assets.mjs';
import { validateResult, sha256 } from '../tools/results.mjs';
import { writeReport } from '../tools/report.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function findChrome(explicit){
 const candidates=[explicit,process.env.CHROME_PATH,...(process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:process.platform==='win32'?[`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable'])].filter(Boolean);
 for(const path of candidates){try{await access(path);return path;}catch{}}
 throw new Error('Installed Google Chrome not found. Supply --chrome PATH or CHROME_PATH.');
}
async function sourceReceipt(){
 let commit=null,dirty=true,files=[];
 try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();dirty=execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().length>0;files=execFileSync('git',['ls-files','-z'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\0').filter(f=>/^(bin\/|lib\/|web\/|fixtures\/|models\/|tools\/.*\.mjs$|package(?:-lock)?\.json$|assets\.lock\.json$)/.test(f)).sort();}catch{}
 const entries=[];for(const file of files)entries.push(`${file}\0${sha256(await readFile(join(ROOT,file)))}`);
 return {gitCommit:commit,dirty,manifestSha256:sha256(entries.join('\n'))};
}
const timeout=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} exceeded ${ms/60000} minutes`)),ms);})]);}finally{clearTimeout(timer);}};
const safeError=e=>String(e.message??e).replaceAll(ROOT,'<checkout>').replace(/(?:\/Users\/|\/home\/)[^\s\n"']+/g,'<local-path>').slice(0,1800);

function resourceSampler(profile,enabled){
 let peak=null,busy=false,stopped=false;
 function sample(){if(!enabled||busy||process.platform==='win32')return;busy=true;try{
   const rows=execFileSync('ps',['-axo','pid=,ppid=,rss=,command='],{encoding:'utf8',timeout:2000,maxBuffer:8000000}).split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean);
   const roots=rows.filter(r=>r[4].includes('--user-data-dir='+profile)).map(r=>Number(r[1]));const ids=new Set(roots);
   let grew=true;while(grew){grew=false;for(const r of rows)if(ids.has(Number(r[2]))&&!ids.has(Number(r[1]))){ids.add(Number(r[1]));grew=true;}}
   if(ids.size){const total=rows.filter(r=>ids.has(Number(r[1]))).reduce((sum,r)=>sum+Number(r[3])*1024,0);peak=Math.max(peak??0,total);}
 }catch{}finally{busy=false;}}
 sample();const timer=enabled?setInterval(sample,500):null;
 return {stop(){if(stopped)return peak;stopped=true;if(timer)clearInterval(timer);sample();return peak;}};
}

export async function runBenchmark(o){
 const model=o.model,backend=o.backend??'cpu',scenario=o.scenario??'warm',smoke=o.smoke===true;
 if(!model||!/^[a-z0-9][a-z0-9.-]*$/.test(model))throw new Error('A valid --model ID is required');
 if(!['cpu','webgpu','webgl'].includes(backend)||!['warm','cold','cached','network','offline','switch'].includes(scenario))throw new Error('Invalid backend/scenario');
 if(scenario==='switch'&&!o.predecessor)throw new Error('Switch requires --predecessor MODEL');
 const repetitions=Number(o.repetitions??(smoke?1:scenario==='warm'?5:['cold','cached','network'].includes(scenario)?3:1));
 if(!Number.isSafeInteger(repetitions)||repetitions<1||repetitions>100||(!smoke&&scenario==='warm'&&repetitions<5))throw new Error('Use 1–100 repetitions; full warm benchmarks require at least five');
 const maxMinutes=Number(o['timeout-minutes']??120);if(!Number.isFinite(maxMinutes)||maxMinutes<=0||maxMinutes>240)throw new Error('Invalid generation timeout (0–240 minutes)');
 const assets=await prepareAssets(model,{mode:'verify',acceptLicense:o['accept-license']===true});
 if(!Array.isArray(assets))throw new Error('Asset verifier must return the selected asset receipts');
 if(scenario==='switch')assets.push(...(await prepareAssets(o.predecessor,{mode:'verify',acceptLicense:o['accept-license']===true})).filter(a=>!assets.some(b=>a.id===b.id)));
 const source=await sourceReceipt();
 const chrome=await findChrome(o.chrome),id=`${new Date().toISOString().replace(/[:.]/g,'-').toLowerCase()}-${model}-${backend}-${scenario}-${randomUUID().slice(0,8)}`;
 const runRoot=join(ROOT,'runs',id),profile=join(ROOT,'.cache','profiles',id);
 await mkdir(runRoot,{recursive:true});await mkdir(profile,{recursive:true});
 const server=await startServer(ROOT);
 let context=null,page=null,info=null,fixture=null,chromeVersion='',gpu=null,result;
 const external=[];const status=async stage=>writeFile(join(runRoot,'status.json'),JSON.stringify({id,stage,updatedAt:new Date().toISOString()},null,2)+'\n');
 const close=async()=>{const c=context;context=null;page=null;await c?.close();};
 const stop=()=>{void close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const open=async({empty=false}={})=>{
  await close();if(empty){await rm(profile,{recursive:true,force:true});await mkdir(profile,{recursive:true});}
  context=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:false,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],viewport:{width:1000,height:700},args:['--no-first-run','--no-default-browser-check','--disable-software-rasterizer']});
  chromeVersion=context.browser()?.version()??'unknown';page=context.pages()[0]??await context.newPage();
  page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(server.url).origin)external.push(new URL(request.url()).origin);});
  await page.goto(server.url,{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>Boolean(window.bench),null,{timeout:30000});
  fixture=await page.evaluate(smoke=>window.bench.fixture(smoke),smoke);
 };
 const init=async(probe=false,selected=model)=>{
  const initialized=await timeout(page.evaluate(config=>window.bench.initialize(config),{model:selected,backend,smoke,probe}),20*60000,'Initialization');
  if(!probe&&initialized.status==='unsupported')throw new Error(initialized.reason??'Backend became unavailable during initialization');
  if(!probe&&selected===model&&info)for(const key of ['backendEffective','voice','precision'])if(initialized[key]!==info[key])throw new Error(`Measured ${key} differs from the separate capability probe`);
  return initialized;
 };
 const dispose=async()=>{if(page)await page.evaluate(()=>window.bench.dispose());};
 const generate=async(index,saveAudio)=>{
  const sampler=resourceSampler(profile,o.resources===true);
  try{
   const receipt=await timeout(page.evaluate(config=>window.bench.generate(config),{index,smoke,saveAudio}),maxMinutes*60000,'Full generation');
   const peak=sampler.stop();
   if(o.resources)receipt.metrics={...receipt.metrics,articleCallPeakRssBytes:peak};
   if(receipt.audioWavBase64){const wav=Buffer.from(receipt.audioWavBase64,'base64');await writeFile(join(runRoot,`${model}-${backend}.wav`),wav);receipt.audio={sha256:sha256(wav),bytes:wav.length};delete receipt.audioWavBase64;}
   if(external.length)throw new Error('External browser requests observed; result rejected');
   return receipt;
  }finally{sampler.stop();}
 };
 const cell={model,backendRequested:backend,backendEffective:'not initialized',status:'error',reason:null,voice:'unknown',precision:'unknown',settings:{},capability:{gpuDispatchVerified:null,description:'Capability probe has not completed.'},warmup:[],trials:[]};
 try{
  await status('capability-probe');await open({empty:true});
  info=await init(true);gpu=info.gpu??null;
  Object.assign(cell,{backendEffective:info.backendEffective,voice:info.voice,precision:info.precision,settings:{...info.settings,...(scenario==='switch'?{predecessor:o.predecessor}:{})},capability:info.capability});
  if(info.status==='unsupported'){cell.status='unsupported';cell.reason=info.reason??'Backend unavailable for this model.';}
  else{
   if(backend!=='cpu'&&cell.capability.gpuDispatchVerified!==true)throw new Error('Requested GPU path did not demonstrate actual compute dispatch');
   await dispose();await close();
   if(scenario==='network')server.setMbps(1);
   const warmupRuns=scenario==='warm'&&!smoke?1:0;
   if(scenario==='warm'){
    await open();await init(false);
    for(let i=1;i<=warmupRuns;i++){await status(`warmup-${i}`);cell.warmup.push(await generate(i,false));await writeFile(join(runRoot,`warmup-${i}.json`),JSON.stringify(cell.warmup.at(-1),null,2)+'\n');}
   }
   // Cached/offline reuse the profile populated by the separate capability probe.
   for(let i=1;i<=repetitions;i++){
    await status(`trial-${i}`);const trialStarted=performance.now();let before=server.snapshot(),loadMs=0,transitionStart=null,switchTransitionMs=null,offlineBefore=null;
    if(scenario!=='warm'){
     await open({empty:['cold','network','switch'].includes(scenario)});
     if(scenario==='switch'){await init(false,o.predecessor);await page.evaluate(()=>window.bench.generate({index:1,smoke:true,saveAudio:false}));before=server.snapshot();transitionStart=performance.now();await dispose();}
     if(scenario==='offline'){offlineBefore=server.snapshot();await context.setOffline(true);const reachable=await page.evaluate(async()=>{try{await fetch('/offline-proof?'+Date.now(),{cache:'no-store'});return true;}catch{return false;}});if(reachable)throw new Error('Offline network proof failed');}
     const at=performance.now();await init(false);loadMs=performance.now()-at;if(transitionStart!==null)switchTransitionMs=performance.now()-transitionStart;
    }
    const trial=await generate(i,i===repetitions);const after=server.snapshot();if(offlineBefore&&after.bytes!==offlineBefore.bytes)throw new Error('Offline inference unexpectedly transferred HTTP bodies');
    if(scenario!=='warm')trial.metrics={...trial.metrics,loadMs,controllerTrialElapsedMs:performance.now()-trialStarted,...(offlineBefore?{offlineInferenceNetworkBytes:after.bytes-offlineBefore.bytes}:{}),...(switchTransitionMs===null?{}:{switchTransitionMs}),downloadBytes:after.bytes-before.bytes,idealDownloadSecondsAt1Mbps:(after.bytes-before.bytes)/125000};
    cell.trials.push(trial);await writeFile(join(runRoot,`trial-${i}.json`),JSON.stringify(trial,null,2)+'\n');
    if(scenario!=='warm')await close();
   }
   cell.status='measured';
  }
 }catch(error){cell.reason=safeError(error);cell.status='error';}
 finally{
  await close();await server.close();await rm(profile,{recursive:true,force:true});process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 }
 if(!fixture)throw new Error(`Browser setup failed: ${cell.reason}`);
 const env={machineLabel:o.machine??`${os.cpus()[0]?.model??'Unknown CPU'} / ${Math.round(os.totalmem()/1e9)} GB`,os:`${os.type()} ${os.release()}`,arch:os.arch(),cpu:os.cpus()[0]?.model??'Unknown CPU',logicalCores:os.cpus().length,ramBytes:os.totalmem(),chromeVersion:`Google Chrome ${chromeVersion}`,gpu,headless:false};
 result={schemaVersion:1,id,createdAt:new Date().toISOString(),origin:'native',protocol:{id:`browser-tts-${scenario}-v1${o.resources?'-resources':''}`,scenario,timingBoundary:'First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export.',warmupRuns:scenario==='warm'&&!smoke?1:0,repetitions,smoke,networkMbps:scenario==='network'?1:null},environment:env,fixture,source,assets,cells:[cell],notes:['Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.','Raw WAV stays local and is not part of automatic submission.',...(o.note?[o.note]:[]),...(o.resources?['RSS is sampled every 500 ms across the owned Chrome process tree; includes browser baseline and post-timer validation/export; unavailable samples are null.']:[])]};
 validateResult(result);await writeFile(join(runRoot,'result.json'),JSON.stringify(result,null,2)+'\n');await writeReport(join(runRoot,'result.json'));await status(cell.status);
 if(cell.status==='error')process.exitCode=1;
 return {id,status:cell.status,result:`runs/${id}/result.json`,reason:cell.reason};
}
