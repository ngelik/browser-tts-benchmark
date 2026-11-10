import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readResult, summaries, median } from './results.mjs';
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const md=x=>String(x??'').replaceAll('|','\\|').replaceAll('\n',' ');
const plain=x=>String(x??'').replaceAll('\n',' ').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_{}\[\]()!#|]/g,c=>'\\'+c);
export function renderReport(d){
  const rows=summaries(d), max=Math.max(1,...rows.filter(r=>r.maxSeconds!==null).map(r=>r.maxSeconds)), min=Math.min(1,...rows.filter(r=>r.minSeconds!==null).map(r=>r.minSeconds));
  const left=230,right=850,width=1000,height=200+rows.length*66;
  const logMax=Math.log10(max*1.8),logMin=Math.log10(min);
  const px=v=>left+(Math.log10(v)-logMin)/(logMax-logMin)*(right-left);
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Warm and scenario generation results</title><desc id="desc">${esc(d.protocol.id)}; seconds on a logarithmic axis. Missing results are not zero.</desc><rect width="100%" height="100%" fill="#fffdf6"/><g font-family="system-ui,sans-serif" fill="#243e37"><text x="32" y="42" font-size="24">Browser TTS benchmark</text><text x="32" y="70" font-size="12">${esc(d.environment.machineLabel)} · ${esc(d.protocol.id)} · ${esc(d.protocol.scenario)}</text>`;
  for(let tick=1;tick<=max*1.8;tick*=10){const x=px(tick);svg+=`<path d="M${x} 90V${height-70}" stroke="#dedfd5"/><text x="${x}" y="${height-46}" text-anchor="middle" font-size="11">${tick}</text>`;}
  rows.forEach((r,i)=>{const y=115+i*66;const longModel=r.model.length>26;const visibleModel=longModel?r.model.slice(0,25)+'…':r.model;const accessibleLabel=longModel?` aria-label="${esc(r.model)}"`:'';const title=longModel?`<title>${esc(r.model)}</title>`:'';svg+=`<text x="24" y="${y}" font-size="14"${accessibleLabel}>${title}${esc(visibleModel)}</text><text x="24" y="${y+18}" font-size="11" fill="#64706a">${esc(r.backend)} · n=${r.n}</text>`;if(r.medianSeconds!==null){const x=px(r.medianSeconds);svg+=`<path d="M${px(r.minSeconds)} ${y}H${px(r.maxSeconds)}" stroke="#243e37" stroke-width="2"/><circle cx="${x}" cy="${y}" r="5" fill="${r.backend==='cpu'?'#187c70':'#cf8128'}"/><text x="${x+10}" y="${y+4}" font-size="13">${r.medianSeconds.toFixed(2)} s</text>`;}else svg+=`<text x="${left}" y="${y}" font-size="13" fill="#64706a">${esc(r.status)} — no score</text>`;});
  svg+=`<text x="${left}" y="${height-22}" font-size="11">Seconds · logarithmic scale · median and observed min–max · lower is faster</text></g></svg>\n`;
  let markdown=`# ${md(d.id)}\n\n${md(d.environment.machineLabel)} · ${md(d.environment.cpu)} · ${md(d.environment.chromeVersion)}\n\nProtocol: **${md(d.protocol.id)}**, scenario **${md(d.protocol.scenario)}**. ${d.origin==='historical-import'?'Historical measurements imported from the original experiment.':'Native harness run.'}\n\n${md(d.protocol.timingBoundary)}\n\n| Model | Requested backend | Status | Median | Min–max | Runs |\n|---|---|---|---:|---:|---:|\n`;
  for(const r of rows)markdown+=`| ${md(r.model)} | ${md(r.backend)} | ${md(r.status)} | ${r.medianSeconds===null?'—':r.medianSeconds.toFixed(2)+' s'} | ${r.medianSeconds===null?'—':r.minSeconds.toFixed(2)+'–'+r.maxSeconds.toFixed(2)+' s'} | ${r.n} |\n`;
  if(d.origin==='native'){
    const labels={firstChunkMs:['First completed source chunk','ms'],firstSourceChunkCompletedMs:['First completed source chunk','ms'],offlineInferenceNetworkBytes:['HTTP body bytes after offline toggle','bytes'],firstPcmMs:['First PCM block','ms'],audioSeconds:['Generated audio','s'],realTimeFactor:['Generation / audio duration','ratio'],loadMs:['Model initialization','ms'],controllerTrialElapsedMs:['Complete controller trial including setup/export','ms'],switchTransitionMs:['Dispose predecessor + initialize target','ms'],downloadBytes:['Transferred HTTP body data','bytes'],idealDownloadSecondsAt1Mbps:['Ideal body transfer at 1 Mbps','s'],articleCallPeakRssBytes:['Whole-call Chrome process-tree peak RSS','bytes'],generationMeanRssBytes:['Per-trial mean generation Chrome process-tree RSS','bytes'],generationRssSampleCount:['In-window Chrome RSS observations','samples']};
    const metrics=[];
    for(const c of d.cells)if(c.status==='measured')for(const [key,[label,unit]] of Object.entries(labels)){const values=c.trials.map(t=>t.metrics?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));if(values.length)metrics.push([c.model,c.backendRequested,label,median(values),unit,values.length]);}
    if(metrics.length){markdown+='\nAdditional metrics (median of available observations; scopes are distinct):\n\n| Model | Backend | Metric | Median | Unit | n |\n|---|---|---|---:|---|---:|\n';for(const [model,backend,label,value,unit,n]of metrics)markdown+=`| ${md(model)} | ${md(backend)} | ${label} | ${value.toFixed(unit==='bytes'?0:3)} | ${unit} | ${n} |\n`;}
  }
  const supportCells=d.cells.filter(c=>c.support);
  if(supportCells.length){
    markdown+='\nModel support (catalog capability, not coverage of this run):\n\n| Model | Supported voices | Bundled voices | Languages | Tested voice |\n|---|---:|---:|---|---|\n';
    for(const c of supportCells){const s=c.support;markdown+=`| ${md(c.model)} | ${s.voiceCount??'Unknown'} | ${s.bundledVoiceCount??'Unknown'} | ${s.languageCount??'Unknown'}${s.languages?.length>5?'':' ('+md(s.languages?.join(', ')??'unknown')+')'} | ${md(c.voice)} |\n`;}
    for(const c of supportCells){const s=c.support;markdown+=`\n${plain(s.scope)}. ${plain(s.notes)} Sources: ${s.sources.map((u,i)=>`[${i+1}](${encodeURI(u).replaceAll('(','%28').replaceAll(')','%29')})`).join(', ')}.\n\n`;}
  }
  markdown+='\n![Generation chart](chart.svg)\n\n';
  for(const c of d.cells)markdown+=`- **${md(c.model)} / ${md(c.backendRequested)}**: ${md(c.capability.description)}${c.reason?' '+md(c.reason):''}\n`;
  for(const note of d.notes??[])markdown+='\n'+md(note)+'\n';
  markdown+='\nDifferent protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.\n';
  return {svg,markdown};
}
export async function writeReport(file,out=dirname(file)){
 const d=await readResult(file), r=renderReport(d);await mkdir(out,{recursive:true});await writeFile(resolve(out,'summary.md'),r.markdown);await writeFile(resolve(out,'chart.svg'),r.svg);
 return {id:d.id,rows:d.cells.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const file=process.argv[2];if(!file)throw new Error('Usage: npm run report -- path/to/result.json [output-directory]');console.log(await writeReport(resolve(file),process.argv[3]&&resolve(process.argv[3])));}
