// Full-fixture browser/native SentencePiece frontend audit; no scored inference.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {startServer} from '../lib/server.mjs';
import {findChrome} from '../lib/runner.mjs';
import {verifyAllAssets} from '../lib/assets.mjs';
import {getModel} from '../lib/catalog.mjs';
const oracle=JSON.parse(await readFile('web/pocket/tokenizer-oracle.json','utf8'));
const article=await readFile('fixtures/en-20000.txt','utf8');
assert.equal(createHash('sha256').update(article).digest('hex'),oracle.fixtureSha256);
const {chunks}=JSON.parse(await readFile('fixtures/en-20000.chunks.json','utf8'));
await verifyAllAssets('pocket-tts-100m-english-int8');
const assets=getModel('pocket-tts-100m-english-int8').assets;
for(const [id,key] of [['pocket-tts-tokenizer-model','tokenizerModelSha256'],['pocket-tts-bundle-json','bundleSha256'],['pocket-tts-upstream-worker','upstreamWorkerSha256']])assert.equal(assets.find(a=>a.id===id).sha256,oracle[key]);
const server=await startServer(process.cwd());let browser;
try {
 browser=await chromium.launch({executablePath:await findChrome(),headless:false,chromiumSandbox:true});const page=await browser.newPage();
 const external=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(server.url).origin)external.push(r.url());});
 await page.goto(server.url);
 const actual=await page.evaluate(async({article,chunks})=>{
  const worker=new Worker('/web/workers/pocket.mjs',{type:'module'});let serial=0;const pending=new Map();
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);};
  worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();};
  const rpc=(action,rest={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,action,...rest});});
  try{
   await rpc('initialize',{options:{backend:'cpu',probe:false}});const entries=[];
   for(const chunk of chunks)entries.push({id:chunk.id,...await rpc('audit',{text:article.slice(chunk.start,chunk.end)})});
   await rpc('dispose');return entries;
  }finally{worker.terminate();}
 },{article,chunks});
 assert.equal(actual.length,oracle.entries.length);
 for(let i=0;i<actual.length;i++)assert.deepEqual(actual[i],oracle.entries[i],`Pocket frontend mismatch at canonical span ${i}`);
 assert.deepEqual(external,[]);
 console.log(JSON.stringify({spans:actual.length,utterances:actual.reduce((n,e)=>n+e.utterances.length,0),reference:oracle.referenceImplementation,exactPreparedTextChunkingTokenIdsDecodedTextAndEosFrames:true,externalRequests:0}));
}finally{await browser?.close();await server.close();}
