import {LISTENING_URL,recordingUrl} from '../audio/links.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resultPaths, readResult, summaries } from './results.mjs';
import { getAssetLock } from '../lib/catalog.mjs';
import { outputLengthNotes } from './output-notes.mjs';
export const START='<!-- benchmark-results:start -->', END='<!-- benchmark-results:end -->';
const md=x=>String(x).replaceAll('|','\\|').replaceAll('\n',' ');
const envKey=d=>JSON.stringify(['machineLabel','os','arch','cpu','logicalCores','ramBytes','chromeVersion'].map(k=>d.environment[k]));
const report=d=>`results/${d.id}/summary.md`;

function outputLengthReferenceBlock(groups, models){
 const observations=[];
 for(const row of groups.values())for(const backend of ['cpu','webgpu']){
  const selected=row[backend];if(!selected)continue;
  const cell=selected.d.cells.find(value=>value.model===row.model&&value.backendRequested===backend);
  const notes=outputLengthNotes(cell);if(!notes)continue;
  if(notes.scored)observations.push({row,backend,kind:'Scored output',note:notes.scored.text,result:selected.d});
  if(notes.warmup)observations.push({row,backend,kind:'Excluded warm-up',note:notes.warmup.text,result:selected.d});
 }
 if(!observations.length)return '';
 let out='### Output-length observations\n\nThese notes report the shortest measured PCM output per source chunk. A sub-second output alone does not establish truncation or transcript fidelity. Warm-up audio is not archived. Any published clip belongs to the scored trial listed by `trialIndex` in the audio manifest and may not match the trial with the shortest source chunk. Excluded warm-up observations are listed separately from scored trials.\n\n| Model | Backend | Evidence | Observation | Receipt |\n|---|---|---|---|---|\n';
 for(const item of observations){
  const name=models[item.row.model]?.displayName??item.row.model;
  out+=`| ${md(name)} | ${item.backend==='cpu'?'CPU':'WebGPU'} | ${item.kind} | ${md(item.note)} | [${item.result.id}](${report(item.result)}) |\n`;
 }
 return out+'\n';
}

function ramCohorts(results){
 const cohorts=new Map();
 for(const d of results){
  if(d.origin!=='native'||d.protocol.smoke||!d.protocol.id.endsWith('-resources'))continue;
  const eligible=d.cells.filter(c=>c.status!=='measured'||c.trials.length&&c.trials.every(t=>Number.isFinite(t.metrics?.generationMeanRssBytes)&&t.memory));
  if(!eligible.length)continue;
  const key=envKey(d)+'/'+JSON.stringify(d.protocol)+'/'+d.source.manifestSha256;
  const group=cohorts.get(key)??{base:d,rows:new Map()};
  for(const c of eligible){const row=group.rows.get(c.model)??{model:c.model};row[c.backendRequested]={d,c};group.rows.set(c.model,row);}cohorts.set(key,group);
 }
 return [...cohorts.values()];
}
export function ramReferenceBlock(results,models){
 const cohorts=ramCohorts(results);
 let out='### Chrome RAM during generation\n\nDedicated full-article memory runs measure an isolated Chrome instance with one benchmark tab, including inference workers and browser baseline. These are separate resource diagnostics; their timings do not replace the warm speed measurements above. RSS may double-count shared pages and is not model-only RAM or GPU VRAM. Values are the mean of generation-window samples, averaged equally across recorded articles. [Method and reproduction](docs/MEMORY.md).\n\n';
 if(!cohorts.length)return out+'Memory results are published here after their full-article diagnostics pass validation.\n\n';
 let i=0;
 for(const {base:d,rows}of cohorts){
  out+='**RAM '+(++i)+'** · '+md(d.environment.machineLabel)+' · '+md(d.environment.chromeVersion)+' · '+md(d.environment.os)+' · '+md(d.protocol.id)+' · '+d.protocol.repetitions+' full article(s) per measured cell · source [`'+d.source.gitCommit.slice(0,8)+'`](https://github.com/ngelik/tts-bench/commit/'+d.source.gitCommit+').\n\n';
  out+='| Model | Model weights (MB) | CPU avg Chrome RAM (MB) | WebGPU avg Chrome RAM (MB) |\n|---|---:|---:|---:|\n';
  const metric=v=>{if(!v)return '—';if(v.c.status!=='measured')return '['+md(v.c.status)+']('+report(v.d)+')';const means=v.c.trials.map(t=>t.metrics.generationMeanRssBytes);return '['+(means.reduce((a,b)=>a+b,0)/means.length/1e6).toFixed(2)+']('+report(v.d)+')';};
  for(const row of [...rows.values()].sort((a,b)=>a.model.localeCompare(b.model))){const pair=[row.cpu,row.webgpu].filter(Boolean),weights=models[row.model]?.assets?.filter(a=>a.kind==='model-weights')??[];const verified=weights.length&&pair.every(v=>weights.every(w=>v.d.assets.some(a=>a.sha256===w.sha256&&a.bytes===w.bytes)));const size=verified?(weights.reduce((n,a)=>n+a.bytes,0)/1e6).toFixed(2):'Unknown';out+='| '+md(models[row.model]?.displayName??row.model)+' | '+size+' | '+metric(row.cpu)+' | '+metric(row.webgpu)+' |\n';}
  out+='\n';
 }
 return out+'![Average Chrome RAM during generation](docs/reference-memory.svg)\n\n';
}

const xml=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function ramChart(results,models){
 const cohorts=ramCohorts(results);if(!cohorts.length)return null;
 const height=100+cohorts.reduce((n,g)=>n+120+g.rows.size*76,0);
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-labelledby="title desc"><title id="title">Average Chrome RAM during speech generation</title><desc id="desc">Separate full-article diagnostics. Owned Chrome process-tree RSS includes browser baseline and workers. Decimal megabytes; lower uses less memory. Unsupported backends have no bar.</desc><rect width="100%" height="100%" fill="#f7f9fc"/><g font-family="system-ui,sans-serif" fill="#192b47"><text x="32" y="42" font-size="25" font-weight="700">Chrome RAM · full article diagnostics</text><text x="32" y="68" font-size="13">One isolated Chrome instance · includes workers and browser baseline · excludes loading and audio export</text>`;
 let y=100;
 for(const [index,{base:d,rows}]of cohorts.entries()){
  const sorted=[...rows.values()].sort((a,b)=>a.model.localeCompare(b.model));
  const average=v=>v?.c.status==='measured'?v.c.trials.reduce((n,t)=>n+t.metrics.generationMeanRssBytes,0)/v.c.trials.length/1e6:null;
  const max=Math.max(1,...sorted.flatMap(r=>[average(r.cpu),average(r.webgpu)].filter(v=>v!==null)))*1.15;
  svg+=`<text x="32" y="${y}" font-size="14" font-weight="700">RAM ${index+1} · ${xml(d.environment.machineLabel)} · n=${d.protocol.repetitions} article(s)</text><text x="32" y="${y+22}" font-size="11">${xml(d.environment.chromeVersion)} · ${xml(d.protocol.id)} · source ${xml(d.source.gitCommit.slice(0,8))}</text>`;y+=58;
  for(const r of sorted){
   svg+=`<text x="32" y="${y+10}" font-size="14" font-weight="600">${xml(models[r.model]?.displayName??r.model)}</text>`;
   for(const [offset,backend,color]of [[0,'cpu','#276bdb'],[27,'webgpu','#9b4fc4']]){
    const value=average(r[backend]),top=y+offset;
    svg+=`<text x="330" y="${top+13}" font-size="11">${backend==='cpu'?'CPU':'WebGPU'}</text>`;
    if(value!==null){const w=value/max*520;svg+=`<rect x="400" y="${top}" width="${w.toFixed(2)}" height="19" rx="5" fill="${color}"/><text x="${(410+w).toFixed(2)}" y="${top+14}" font-size="12">${value.toFixed(2)} MB</text>`;}
    else svg+=`<text x="400" y="${top+13}" font-size="12" fill="#6c7686">${xml(r[backend]?.c.status??'—')}</text>`;
   }y+=76;
  }y+=62;
 }
 svg+=`<text x="32" y="${height-24}" font-size="12" fill="#6c7686">Sample means, not model-only RAM or GPU VRAM. RSS may double-count shared pages. Timing scores are reported separately.</text></g></svg>\n`;return svg;
}

export function referenceBlock(results, models, comparisons=[], audio=[], campaigns=[]){
  const ordered=[...results].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const envs=new Map();for(const d of ordered)if(d.protocol.scenario==='warm'&&!envs.has(envKey(d)))envs.set(envKey(d),{id:'E'+(envs.size+1),value:d.environment});
  const groups=new Map();
  for(const d of ordered.filter(d=>d.protocol.scenario==='warm'))for(const c of summaries(d)){
    const k=envKey(d)+'/'+c.model;const row=groups.get(k)??{model:c.model,environment:envs.get(envKey(d)).id};
    const old=row[c.backend];if(!old||d.origin==='native'||old.d.origin!=='native')row[c.backend]={d,c};groups.set(k,row);
  }
  let out=START+'\n\nGenerated from every submitted result. Latest warm attempt per model/backend and exact environment is shown; errors are retained. No cross-machine or cross-protocol speedup is implied.\n\n';
  for(const {id,value:e}of envs.values())out+=`- **${id}**: ${md(e.machineLabel)} · ${md(e.chromeVersion)} · ${md(e.os)}.\n`;
  out+='\n| Model | Environment | Model weights (MB) | CPU warm median | WebGPU warm median | Evidence scope |\n|---|---|---:|---:|---:|---|\n';
  const score=v=>!v?'—':`[${v.c.medianSeconds===null?md(v.c.status):v.c.medianSeconds.toFixed(2)+' s'}](${report(v.d)})`;
  const modelSize=(id,pair)=>{const weights=models[id]?.assets?.filter(a=>a.kind==='model-weights')??[];const measured=pair;if(!weights.length||!measured.length||measured.some(v=>weights.some(w=>!v.d.assets.some(a=>a.sha256===w.sha256&&a.bytes===w.bytes))))return 'Unknown';return (weights.reduce((n,a)=>n+a.bytes,0)/1e6).toFixed(2);};
  for(const row of [...groups.values()].sort((a,b)=>a.environment.localeCompare(b.environment)||a.model.localeCompare(b.model))){const pair=[row.cpu,row.webgpu].filter(Boolean);const hist=pair.some(v=>v.d.origin!=='native');const scope=hist?'Historical; distinct timing protocols':pair.length===2&&pair[0].d.source.manifestSha256===pair[1].d.source.manifestSha256?'Native; matched source':'Native; separate configuration';out+=`| ${md(models[row.model]?.displayName??row.model)} | ${row.environment} | ${modelSize(row.model,pair)} | ${score(row.cpu)} | ${score(row.webgpu)} | ${scope} |\n`;}
  out+='\nEach measured warm cell uses five scored full 20,000-character articles. Missing values are not zero. Open receipts for voice, precision, timing boundaries, power conditions and observed min–max.\n\n';
  out+=outputLengthReferenceBlock(groups,models);
  out+='MB = 1,000,000 bytes. Model size counts pinned core model-weight files (including the vocoder), verified against the displayed run receipts; it excludes runtime, G2P, voice/config files and transfer overhead.\n\n';
  out+=ramReferenceBlock(ordered,models);
  out+='### Voice and language support\n\nCounts describe the pinned model/catalog, not the number of voices or languages benchmarked. All current measurements use English and one selected voice per model. Other checkpoints in a family are excluded.\n\n| Model | Supported voices | Bundled voices | Supported languages | Scope / source |\n|---|---:|---:|---|---|\n';
  for(const [id,m]of Object.entries(models)){const s=m.support;if(!s)throw new Error('Missing support metadata: '+id);out+=`| ${md(m.displayName??id)} | ${s.voiceCount??'Unknown'} | ${s.bundledVoiceCount??'Unknown'} | ${s.languageCount??'Unknown'}${s.languages?.length>5?'':' ('+md(s.languages?.join(', ')??'unknown')+')'} | [Details](docs/MODEL_SUPPORT.md#${id}) |\n`;}
  if(comparisons.length){out+='\n### Controlled native comparisons\n\nOnly compatible receipts enter these comparisons; source, settings, fixture and environment checks must pass.\n';for(const name of comparisons){out+=`\n[${md(name)} — table and input receipts](comparisons/${name}/summary.md)\n\n![${md(name)}](comparisons/${name}/chart.svg)\n`;}}
  if(campaigns.length){out+='\n### Campaign overviews\n\nEach report states its selected scenarios and keeps their measurement boundaries separate.\n';for(const name of campaigns){out+=`\n[${md(name)} — all-metrics table and source receipts](reports/${name}/overview.md)\n\n![${md(name)} — campaign metrics](reports/${name}/overview.svg)\n`;}}
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
  let campaigns=[];try{campaigns=(await readdir('reports',{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();}catch(error){if(error.code!=='ENOENT')throw error;}
  if(campaigns.some(name=>!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(name)))throw new Error('Invalid campaign report directory');
  let audio=[];try{audio=JSON.parse(await readFile('audio/manifest.json','utf8')).entries;}catch(e){if(e.code!=='ENOENT')throw e;}
  const memorySvg=ramChart([...results].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)),getAssetLock().models);
  if(memorySvg){if(check){if(await readFile('docs/reference-memory.svg','utf8')!==memorySvg)throw new Error('Stale RAM chart; run npm run reference');}else await writeFile('docs/reference-memory.svg',memorySvg);}
  const file='README.md',old=await readFile(file,'utf8');const next=replaceReference(old,referenceBlock(results,getAssetLock().models,comparisons,audio,campaigns));
  if(check&&next!==old)throw new Error('Stale/missing Reference results; run npm run reference and include README.md in the result PR');
  if(!check)await writeFile(file,next);return {results:results.length,audio:audio.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(await updateReference({check:process.argv.includes('--check')}));
