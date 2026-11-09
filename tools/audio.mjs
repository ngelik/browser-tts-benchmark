import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readResult,sha256} from './results.mjs';
import {getModel} from '../lib/catalog.mjs';
import {verifySource} from './provenance.mjs';
const sourceCache=new Map();
export function verifyAudioAttribution(a){const m=getModel(a.model);if(a.modelTerms!==m.license.model||a.attribution!==(attribution[a.model]??m.displayName)||JSON.stringify(a.sourceUrls)!==JSON.stringify(m.support.sources))throw new Error('Audio attribution differs from verified model catalog');}
const BASE='https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/';
export function wavInfo(b){
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(4)!==b.length-8||b.readUInt32LE(40)!==b.length-44||(b.length-44)%2)throw new Error('Expected canonical mono PCM16 WAV');
 const sampleRate=b.readUInt32LE(24);if(sampleRate<8000||sampleRate>48000||b.readUInt32LE(28)!==sampleRate*2||b.readUInt16LE(32)!==2)throw new Error('Invalid WAV format');
 return {sampleRate,samples:(b.length-44)/2,seconds:(b.length-44)/2/sampleRate};
}
export function makeClip(b){const w=wavInfo(b);const samples=Math.min(w.samples,w.sampleRate*30);const clip=Buffer.from(b.subarray(0,44+samples*2));clip.writeUInt32LE(clip.length-8,4);clip.writeUInt32LE(clip.length-44,40);return clip;}
async function manifest(){try{return JSON.parse(await readFile('audio/manifest.json','utf8'));}catch(e){if(e.code==='ENOENT')return {schemaVersion:1,entries:[]};throw e;}}
const attribution={paradee:'Paradee by Sahil Mahendrakar; distilled from Kokoro-82M by hexgrad.',phonon:'Phonon by Gradium; based on Pocket TTS and Mimi by Kyutai.','leokani-7m':'Leokani by Milliwatt Labs; synthetic training speech from Kokoro-82M by hexgrad.','leokani-4.5m':'Leokani by Milliwatt Labs; synthetic training speech from Kokoro-82M by hexgrad.','pivo-curated':'PiVo by Leon Lehmann, Empero Research; FARGAN-derived vocoder.','woof':'Voice by Underdog Woof. Non-commercial benchmark evaluation.','piper-en-gb-southern-english-female-low':'Piper / rhasspy Southern English Female low; OpenSLR 83 dataset; Ryan low checkpoint ancestry.'};
export async function addAudio({result,wav,model,backend}){
 const d=await readResult(resolve(result),{publication:true});verifySource(d,process.cwd(),sourceCache);const c=d.cells.find(c=>c.model===model&&c.backendRequested===backend&&c.status==='measured');if(!c)throw new Error('No measured source cell');
 const b=await readFile(wav),digest=sha256(b),w=wavInfo(b);const t=c.trials.find(t=>t.audio?.sha256===digest&&t.audio.bytes===b.length);if(!t||t.samples!==w.samples||t.sampleRate!==w.sampleRate)throw new Error('Full audio does not match a scored receipt');
 const m=getModel(model),clip=makeClip(b),key=`${d.id}--${model}--${backend}`,path=`audio/samples/${key}.wav`;if(key.length>230)throw new Error('Audio asset name too long');
 const data=await manifest();if(data.entries.some(a=>a.resultId===d.id&&a.model===model&&a.backend===backend))throw new Error('Audio already registered; do not overwrite');
 await mkdir(dirname(path),{recursive:true});await writeFile(path,clip,{flag:'wx'});
 data.entries.push({resultId:d.id,model,backend,trialIndex:t.index,voice:c.voice,language:'en',attribution:attribution[model]??m.displayName,modelTerms:m.license.model,sourceUrls:m.support.sources,clip:{path,sha256:sha256(clip),bytes:clip.length,startSample:0,...wavInfo(clip)},full:{url:BASE+key+'-full.wav',sha256:digest,bytes:b.length}});
 data.entries.sort((a,b)=>(a.model+'/'+a.backend+'/'+a.resultId).localeCompare(b.model+'/'+b.backend+'/'+b.resultId));await writeFile('audio/manifest.json',JSON.stringify(data,null,2)+'\n');return data.entries.find(a=>a.clip.path===path);
}
export async function checkAudio(){
 const d=await manifest();if(d.schemaVersion!==1||!Array.isArray(d.entries))throw new Error('Invalid audio manifest');const seen=new Set(),paths=new Set();
 for(const a of d.entries){
  if(!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(a.resultId)||!/^[a-z0-9][a-z0-9.-]*$/.test(a.model)||!['cpu','webgpu'].includes(a.backend))throw new Error('Invalid audio source identity');
  const key=a.resultId+'/'+a.model+'/'+a.backend;if(seen.has(key))throw new Error('Duplicate audio source');seen.add(key);
  if(!/^audio\/samples\/[a-z0-9][a-z0-9._-]{0,239}\.wav$/.test(a.clip?.path)||paths.has(a.clip.path))throw new Error('Invalid audio path');paths.add(a.clip.path);
  if(typeof a.attribution!=='string'||!a.attribution.trim()||typeof a.modelTerms!=='string'||!a.modelTerms.trim()||!Array.isArray(a.sourceUrls)||!a.sourceUrls.length||a.sourceUrls.some(u=>!/^https:\/\//.test(u)))throw new Error('Missing audio attribution');
  verifyAudioAttribution(a);
  const result=await readResult(`results/${a.resultId}/result.json`,{publication:true});verifySource(result,process.cwd(),sourceCache);const c=result.cells.find(c=>c.model===a.model&&c.backendRequested===a.backend&&c.status==='measured');const t=c?.trials.find(t=>t.index===a.trialIndex);if(!t||a.full.sha256!==t.audio?.sha256||a.full.bytes!==t.audio.bytes||a.voice!==c.voice||a.language!=='en')throw new Error('Audio provenance does not match scored receipt');
  if(a.full.url!==BASE+`${a.resultId}--${a.model}--${a.backend}-full.wav`)throw new Error('Unexpected audio release URL');
  const b=await readFile(a.clip.path),w=wavInfo(b);if(b.length>2000000||b.length!==a.clip.bytes||sha256(b)!==a.clip.sha256||a.clip.startSample!==0||w.samples!==Math.min(t.samples,t.sampleRate*30)||w.sampleRate!==t.sampleRate||['samples','sampleRate','seconds'].some(k=>a.clip[k]!==w[k]))throw new Error('Invalid audio clip or digest');
 }
 for(const f of await readdir('audio/samples'))if(!paths.has('audio/samples/'+f))throw new Error('Unregistered audio sample: '+f);
 return paths;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [action,...args]=process.argv.slice(2);if(action==='check')console.log('PASS audio samples:',(await checkAudio()).size);else if(action==='add'){const o={};for(let i=0;i<args.length;i+=2){if(!['--result','--wav','--model','--backend'].includes(args[i])||!args[i+1])throw new Error('Usage: audio add --result JSON --wav WAV --model ID --backend cpu|webgpu');o[args[i].slice(2)]=args[i+1];}console.log(await addAudio(o));}else throw new Error('Use audio add or audio check');
}
