import {loadMemoryEvidence,averageRssBytes} from './memory-evidence.mjs';
import {LISTENING_URL,recordingUrl} from '../audio/links.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resultPaths, readResult, summaries } from './results.mjs';
import { getAssetLock } from '../lib/catalog.mjs';
export const START='<!-- benchmark-results:start -->', END='<!-- benchmark-results:end -->';
const md=x=>String(x).replaceAll('|','\\|').replaceAll('\n',' ');
const envKey=d=>JSON.stringify(['machineLabel','os','arch','cpu','logicalCores','ramBytes','chromeVersion'].map(k=>d.environment[k]));
const report=d=>`results/${d.id}/summary.md`;
export function referenceBlock(results, models, comparisons=[], audio=[], memory=[]){
  const ordered=[...results].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const envs=new Map();for(const d of ordered)if(d.protocol.scenario==='warm'&&!envs.has(envKey(d)))envs.set(envKey(d),{id:'E'+(envs.size+1),value:d.environment});
  const groups=new Map();
  for(const d of ordered.filter(d=>d.protocol.scenario==='warm'))for(const c of summaries(d)){
    const k=envKey(d)+'/'+c.model;const row=groups.get(k)??{model:c.model,environment:envs.get(envKey(d)).id};
    const old=row[c.backend];if(!old||d.origin==='native'||old.d.origin!=='native')row[c.backend]={d,c};groups.set(k,row);
  }
  let out=START+'\n\nGenerated from every submitted result. Latest warm attempt per model/backend and exact environment is shown; errors are retained. No cross-machine or cross-protocol speedup is implied.\n\n';
  for(const {id,value:e}of envs.values())out+=`- **${id}**: ${md(e.machineLabel)} · ${md(e.chromeVersion)} · ${md(e.os)}.\n`;
  out+='\n| Model | Environment | Model weights (MB) | CPU warm median | WebGPU warm median | CPU avg memory (MB) | WebGPU avg memory (MB) | Evidence scope |\n|---|---|---:|---:|---:|---:|---:|---|\n';
  const score=v=>!v?'—':`[${v.c.medianSeconds===null?md(v.c.status):v.c.medianSeconds.toFixed(2)+' s'}](${report(v.d)})`;
  const memoryCell=v=>{if(!v||v.c.status!=='measured')return '—';const e=memory.find(e=>e.resultId===v.d.id&&e.model===v.c.model&&e.backend===v.c.backend);return e?'['+(averageRssBytes(e)/1e6).toFixed(2)+']('+e.path+')':'Not measured';};
  const modelSize=(id,pair)=>{const weights=models[id]?.assets?.filter(a=>a.kind==='model-weights')??[];const measured=pair;if(!weights.length||!measured.length||measured.some(v=>weights.some(w=>!v.d.assets.some(a=>a.sha256===w.sha256&&a.bytes===w.bytes))))return 'Unknown';return (weights.reduce((n,a)=>n+a.bytes,0)/1e6).toFixed(2);};
  for(const row of [...groups.values()].sort((a,b)=>a.environment.localeCompare(b.environment)||a.model.localeCompare(b.model))){const pair=[row.cpu,row.webgpu].filter(Boolean);const hist=pair.some(v=>v.d.origin!=='native');const scope=hist?'Historical; distinct timing protocols':pair.length===2&&pair[0].d.source.manifestSha256===pair[1].d.source.manifestSha256?'Native; matched source':'Native; separate configuration';out+=`| ${md(models[row.model]?.displayName??row.model)} | ${row.environment} | ${modelSize(row.model,pair)} | ${score(row.cpu)} | ${score(row.webgpu)} | ${memoryCell(row.cpu)} | ${memoryCell(row.webgpu)} | ${scope} |\n`;}
  out+='\nEach measured warm cell uses five scored full 20,000-character articles. Missing values are not zero. Open receipts for voice, precision, timing boundaries, power conditions and observed min–max.\n\n';
  out+='MB = 1,000,000 bytes. Model size counts pinned core model-weight files (including the vocoder), verified against the displayed run receipts; it excludes runtime, G2P, voice/config files and transfer overhead. Average memory is sampled total Chrome process-tree RSS during synthesis, averaged within each scored trial and then across trials. It includes browser baseline and may double-count shared pages; it is not model-only RAM or GPU VRAM. **Not measured** means the displayed run has no average-memory evidence; peaks and other runs are not substituted. [Memory method and evidence](docs/MEMORY.md).\n\n';
  out+='### Voice and language support\n\nCounts describe the pinned model/catalog, not the number of voices or languages benchmarked. All current measurements use English and one selected voice per model. Other checkpoints in a family are excluded.\n\n| Model | Supported voices | Bundled voices | Supported languages | Scope / source |\n|---|---:|---:|---|---|\n';
  for(const [id,m]of Object.entries(models)){const s=m.support;if(!s)throw new Error('Missing support metadata: '+id);out+=`| ${md(m.displayName??id)} | ${s.voiceCount??'Unknown'} | ${s.bundledVoiceCount??'Unknown'} | ${s.languageCount??'Unknown'}${s.languages?.length>5?'':' ('+md(s.languages?.join(', ')??'unknown')+')'} | [Details](docs/MODEL_SUPPORT.md#${id}) |\n`;}
  if(comparisons.length){out+='\n### Controlled native comparisons\n\nOnly compatible receipts enter these comparisons; source, settings, fixture and environment checks must pass.\n';for(const name of comparisons){out+=`\n[${md(name)} — table and input receipts](comparisons/${name}/summary.md)\n\n![${md(name)}](comparisons/${name}/chart.svg)\n`;}}
  out+='\n### Historical resource measurements\n\nStartup, memory and download figures below belong to the original campaign. They were not remeasured in subsequent warm-only runs. CPU and later GPU timer boundaries differ; do not calculate a speedup ratio across them.\n\n![Historical generation, startup, memory and transfer](docs/reference-overview.svg)\n\n';
  out+='### Listening samples\n\n[▶ Open the listening room]('+LISTENING_URL+') — play and compare recordings in your browser, without cloning. GitHub README previews do not embed audio controls; each Listen link opens the matching player.\n\nSynthetic speech from the actual recorded runs. [Listening instructions and attribution](audio/README.md). Compact clips stay in Git; full recordings are repository release assets.\n\n';
  if(audio.length){out+='| Model | Backend | Source run | 30-second clip | Full article WAV |\n|---|---|---|---|---|\n';for(const a of audio)out+=`| ${md(models[a.model]?.displayName??a.model)} | ${a.backend} | [Receipt](results/${a.resultId}/summary.md) | [▶ Listen](${recordingUrl(a)}) | [Download / listen](${a.full.url}) |\n`;}
  else out+='Audio recordings are added after their source receipts and WAV hashes have been verified.\n';
  out+='\n<details>\n<summary>All submitted results — every scenario and earlier run</summary>\n\n| Run | Models / backends | Scenario / protocol | Status | Table | Chart |\n|---|---|---|---|---|---|\n';
  for(const [i,d]of ordered.entries()){const labels=d.cells.map(c=>`${c.model}/${c.backendRequested}`).join(', ');const status=[...new Set(d.cells.map(c=>c.status))].join(', ');out+=`| ${i+1} · ${d.createdAt.slice(0,10)} | ${md(labels)} | ${d.protocol.scenario} / ${d.protocol.id} | ${status} | [Report](${report(d)}) | [SVG](results/${d.id}/chart.svg) |\n`;}
  return out+'\n</details>\n\n'+END;
}
export function replaceReference(readme,block){const a=readme.indexOf(START),b=readme.indexOf(END);if(a<0||b<a||readme.indexOf(START,a+1)>=0||readme.indexOf(END,b+1)>=0)throw new Error('README requires exactly one reference-results marker pair');const heading=readme.lastIndexOf('\n## ',a);if(readme.slice(heading+1,a).split('\n')[0]!=='## Reference results')throw new Error('Generated results must be in README Reference results');return readme.slice(0,a)+block+readme.slice(b+END.length);}
export async function updateReference({check=false}={}){
  const results=await Promise.all((await resultPaths('results')).map(p=>readResult(p,{publication:true})));
  const comparisons=(await readdir('comparisons',{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
  let audio=[];try{audio=JSON.parse(await readFile('audio/manifest.json','utf8')).entries;}catch(e){if(e.code!=='ENOENT')throw e;}
  const file='README.md',old=await readFile(file,'utf8');const next=replaceReference(old,referenceBlock(results,getAssetLock().models,comparisons,audio,await loadMemoryEvidence()));
  if(check&&next!==old)throw new Error('Stale/missing Reference results; run npm run reference and include README.md in the result PR');
  if(!check)await writeFile(file,next);return {results:results.length,audio:audio.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(await updateReference({check:process.argv.includes('--check')}));
