// Full canonical text coverage audit; no neural synthesis or scored timing.
import {chromium} from 'playwright-core';
import {startServer} from '../lib/server.mjs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const profile=await mkdtemp(join(tmpdir(),'tts-frontend-audit-'));
const server=await startServer(root);let context;
try {
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--disable-software-rasterizer']});
 const page=await context.newPage();const external=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(server.url).origin)external.push(r.url());});
 await page.goto(server.url);const result=await page.evaluate(async()=>{
  const {AutoTokenizer,env}=await import('/runtimes/transformers/3.5.1/transformers.min.js');env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/';
  const {phonemize}=await import('/web/kokoro/phonemize.js');const {kittenPhones}=await import('/web/kitten/frontend.mjs');const {kittenTokens}=await import('/web/kitten/tokens.mjs');const {normalizeMms}=await import('/web/mms/normalize.mjs');
  const {inflectPhonemeText,inflectTokenIds,splitInflectText}=await import('/web/inflect/frontend.mjs');const {phonemize:espeak}=await import('/runtimes/phonemizer/1.2.1/phonemizer.js');
  const [kokoro,mms]=await Promise.all([AutoTokenizer.from_pretrained('kokoro-82m'),AutoTokenizer.from_pretrained('mms-english')]);
  const text=await(await fetch('/fixtures/en-20000.txt')).text();const {chunks}=await(await fetch('/fixtures/en-20000.chunks.json')).json();const counts=[],errors=[];
  for(const c of chunks){const raw=text.slice(c.start,c.end);const phones=await phonemize(raw.replace(/\s+/gu,' '),'a');const unknown=[...new Set([...phones].filter(x=>!kokoro.model.tokens_to_ids.has(x)))];if(unknown.length)errors.push({model:'kokoro',chunk:c.id,unknown});const k=kokoro(phones,{truncation:false}).input_ids.data.length;
    let kitten;try{kitten=kittenTokens(await kittenPhones(raw)).length;}catch(e){errors.push({model:'kitten',chunk:c.id,error:String(e)});}
    const normalized=normalizeMms(raw);const mi=mms(normalized,{truncation:false}).input_ids.data;if([...mi].includes(38n)||/\d/.test(normalized))errors.push({model:'mms',chunk:c.id,error:'unknown token or numeric loss risk'});let inflect=0;for(const piece of splitInflectText(raw)){try{const v=inflectTokenIds((await inflectPhonemeText(piece,espeak)).phonemeText);inflect=Math.max(inflect,v.tokens.length);}catch(e){errors.push({model:'inflect',chunk:c.id,error:String(e)});}}counts.push({id:c.id,kokoro:k,kitten,mms:mi.length,inflect});
  }return {counts,errors};
 });
 console.log(JSON.stringify({chunks:result.counts.length,errors:result.errors,maxTokens:Object.fromEntries(['kokoro','kitten','mms','inflect'].map(k=>[k,Math.max(...result.counts.map(x=>x[k]??0))])),external},null,2));if(result.errors.length||external.length)process.exitCode=1;
}finally{await context?.close();await server.close();await rm(profile,{recursive:true,force:true});}
