// Sequential campaign orchestration only. Inference remains in headed Chrome.
import {spawn, execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {getModel} from '../lib/catalog.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i++) {
  if(args[i]==='--accept-license') options.accept=true;
  else if(['--plan','--machine'].includes(args[i])&&args[i+1]) options[args[i].slice(2)]=args[++i];
  else throw new Error('Use --plan JSON --machine "Actual hardware label" --accept-license');
}
if(!options.plan||!options.machine||!options.accept) throw new Error('Plan, actual machine label and reviewed license acknowledgement are required.');
const raw=await readFile(resolve(options.plan)), plan=JSON.parse(raw);
if(plan.schemaVersion!==1||!Array.isArray(plan.cells)||!plan.cells.length) throw new Error('Invalid campaign plan');
for(const cell of plan.cells) {
  getModel(cell.model);
  if(!['cpu','webgpu'].includes(cell.backend)||!['warm','cached','cold','network','offline'].includes(cell.scenario)) throw new Error('Invalid campaign cell');
  if(!Number.isSafeInteger(cell.repetitions)||cell.repetitions<1||cell.repetitions>100||(cell.scenario==='warm'&&cell.repetitions<5)) throw new Error('Invalid campaign repetitions');
  if(cell.timeoutMinutes!==undefined&&(!Number.isFinite(cell.timeoutMinutes)||cell.timeoutMinutes<=0||cell.timeoutMinutes>1440)) throw new Error('Invalid per-article timeout');
  if(cell.resources!==undefined&&typeof cell.resources!=='boolean') throw new Error('Invalid resources flag');
}
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const commit=git('rev-parse','HEAD');
const assertSource=()=>{if(git('status','--porcelain')||git('rev-parse','HEAD')!==commit)throw new Error('Campaign requires the same clean committed source for every cell.');};
assertSource();
const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+createHash('sha256').update(raw).digest('hex').slice(0,12);
const out=join(root,'runs','campaign-'+id);await mkdir(out,{recursive:true});
await writeFile(join(out,'plan.json'),raw);
let child=null,aborted=false,failures=0,stoppedOnFailure=false;
const stop=()=>{aborted=true;child?.kill('SIGINT');};process.once('SIGINT',stop);process.once('SIGTERM',stop);
try {
 for(const [index,cell] of plan.cells.entries()) {
  if(aborted)break;assertSource();
  const note=`Campaign ${id}; cell ${index+1}/${plan.cells.length}; source ${commit}; ${plan.conditions??'Record local power and background conditions separately.'}`;
  const command=['bin/bench.mjs','run','--model',cell.model,'--backend',cell.backend,'--scenario',cell.scenario,'--repetitions',String(cell.repetitions),'--machine',options.machine,'--accept-license','--note',note];
  if(cell.timeoutMinutes!==undefined)command.push('--timeout-minutes',String(cell.timeoutMinutes));
  if(cell.resources)command.push('--resources');
  console.log(`START ${index+1}/${plan.cells.length} ${cell.model}/${cell.backend}/${cell.scenario}`);
  await writeFile(join(out,'status.json'),JSON.stringify({index,cell,commit,startedAt:new Date().toISOString()},null,2)+'\n');
  let stdout='';
  const code=await new Promise((ok,bad)=>{
    child=spawn(process.execPath,command,{cwd:root,stdio:['ignore','pipe','inherit']});
    child.stdout.on('data',data=>{process.stdout.write(data);stdout+=data.toString();});
    child.once('error',bad);child.once('exit',(code,signal)=>ok(code??(signal?130:1)));
  });child=null;
  let summary=null,reviewError=null;
  try {
    try { summary=JSON.parse(stdout.trim()); } catch {}
    if(code) throw new Error(`Benchmark process exited ${code}`);
    if(!summary) throw new Error('Benchmark did not return a JSON receipt summary');
    if(typeof summary.id!=='string'||!/^[a-z0-9][a-z0-9._-]+$/.test(summary.id)||summary.result!==`runs/${summary.id}/result.json`) throw new Error('Unexpected benchmark receipt path');
    const receipt=JSON.parse(await readFile(join(root,summary.result),'utf8'));
    if(receipt.source?.dirty!==false||receipt.source?.gitCommit!==commit||receipt.protocol?.smoke!==false||receipt.fixture?.characters!==20000||receipt.fixture?.chunks!==93) throw new Error('Receipt is not a clean-source full-article result');
    if(!Array.isArray(receipt.cells)||receipt.cells.length!==1||!['measured','unsupported'].includes(receipt.cells[0].status)) throw new Error('Unexpected benchmark status');
    if(cell.resources&&receipt.cells[0].status==='measured'&&(!receipt.cells[0].trials.length||receipt.cells[0].trials.some(t=>t.memory?.availability!=='measured'))) throw new Error('Generation RAM was not sufficiently sampled; inspect before continuing');
  } catch(error) { reviewError=String(error.message??error);failures++;stoppedOnFailure=true; }
  await appendFile(join(out,'attempts.jsonl'),JSON.stringify({index,cell,commit,exitCode:code,resultId:summary?.id??null,resultPath:summary?.result??null,reviewError,finishedAt:new Date().toISOString()})+'\n');
  if(reviewError){console.error('STOP: '+reviewError);break;}

 }
 await writeFile(join(out,'finished.json'),JSON.stringify({commit,aborted,failures,stoppedOnFailure,finishedAt:new Date().toISOString()},null,2)+'\n');
}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
if(aborted||failures)process.exitCode=aborted?130:1;
