// Full-fixture frontend equivalence audit and WASM matrix correctness, no scored inference.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startServer} from '../lib/server.mjs';
import {findChrome} from '../lib/runner.mjs';
import {verifyAllAssets} from '../lib/assets.mjs';
import {getModel} from '../lib/catalog.mjs';
import {createHash} from 'node:crypto';
const oracle=JSON.parse(await readFile('web/mach-boom/tokenizer-oracle.json','utf8'));
const article=await readFile('fixtures/en-20000.txt','utf8');
assert.equal(createHash('sha256').update(article).digest('hex'),oracle.fixtureSha256);
const {chunks}=JSON.parse(await readFile('fixtures/en-20000.chunks.json','utf8'));
await verifyAllAssets('mach-boom');
const assets=getModel('mach-boom').assets;
assert.equal(assets.find(a=>a.id==='mach-boom-tokenizer-json').sha256,oracle.tokenizerSha256);
assert.equal(assets.find(a=>a.id==='mach-boom-frontend_en-py').sha256,oracle.frontendSha256);
const server=await startServer(process.cwd());let browser;
try {
 browser=await chromium.launch({executablePath:await findChrome(),headless:false,chromiumSandbox:true});const page=await browser.newPage();
 const external=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(server.url).origin)external.push(r.url());});
 await page.goto(server.url);
 const actual=await page.evaluate(async({article,chunks})=>{
  const worker=new Worker('/web/mach-boom/worker.mjs',{type:'module'});let serial=0;const pending=new Map();
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);};
  worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();};
  const rpc=(action,rest={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,action,...rest});});
  try{
   await rpc('initialize',{options:{backend:'cpu',probe:true}});const entries=[];
   for(const chunk of chunks)entries.push({id:chunk.id,...await rpc('audit',{text:article.slice(chunk.start,chunk.end)})});
   await rpc('dispose');return entries;
  }finally{worker.terminate();}
 },{article,chunks});
 assert.equal(actual.length,oracle.entries.length);
 for(let i=0;i<actual.length;i++)assert.deepEqual(actual[i],oracle.entries[i],`Tokenizer mismatch at canonical span ${i}`);
 assert.deepEqual(external,[]);
 console.log(JSON.stringify({spans:actual.length,reference:oracle.referenceImplementation,exactNormalizedTextTokenIdsDecodedTextAndWordCounts:true,wasmMatrixNumerics:true,externalRequests:0}));
}finally{await browser?.close();await server.close();}
