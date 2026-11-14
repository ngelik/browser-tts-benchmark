import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {buildDashboardData} from './dashboard-data.mjs';
const data=await buildDashboardData();
const clips=new Set(data.models.flatMap(model=>model.audio.map(entry=>entry.clip.path)));
const out=resolve('.cache/listening-site');
// This dedicated generated directory never contains model assets or raw runs.
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const files=['audio/index.html','audio/player.mjs','audio/links.mjs','audio/manifest.json',...clips];
for(const file of files){const target=resolve(out,file);await mkdir(dirname(target),{recursive:true});await cp(file,target,{errorOnExist:true,force:false});}
await writeFile(resolve(out,'.nojekyll'),'');
await mkdir(resolve(out,'assets'),{recursive:true});
await cp('dashboard/index.html',resolve(out,'index.html'));
await mkdir(resolve(out,'diagnostics/2026-11-multilingual'),{recursive:true});
await cp('dashboard/diagnostics.html',resolve(out,'diagnostics/index.html'));
await cp('diagnostics/2026-11-multilingual/observations.json',resolve(out,'diagnostics/2026-11-multilingual/observations.json'));
for(const file of ['style.css','app.mjs','diagnostics.mjs','diagnostics.css'])await cp('dashboard/'+file,resolve(out,'assets',file));
await writeFile(resolve(out,'assets/data.json'),JSON.stringify(data)+'\n');
console.log('Built benchmark dashboard: '+data.models.length+' models, '+clips.size+' verified recordings in .cache/listening-site');
