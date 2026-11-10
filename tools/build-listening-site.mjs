import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {checkAudio} from './audio.mjs';
const clips=await checkAudio();
const out=resolve('.cache/listening-site');
// This dedicated generated directory never contains model assets or raw runs.
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const files=['audio/index.html','audio/player.mjs','audio/links.mjs','audio/manifest.json',...clips];
for(const file of files){const target=resolve(out,file);await mkdir(dirname(target),{recursive:true});await cp(file,target,{errorOnExist:true,force:false});}
await writeFile(resolve(out,'.nojekyll'),'');
await writeFile(resolve(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=audio/"><title>Browser TTS listening room</title><a href="audio/">Listen to benchmark recordings</a></html>\n');
console.log('Built listening site: '+clips.size+' verified recordings in .cache/listening-site');
