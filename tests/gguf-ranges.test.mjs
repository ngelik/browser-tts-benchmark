import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../lib/server.mjs';

test('GGUF byte ranges stream exact data and count overlapping bytes only once', async()=>{
  const root=await mkdtemp(join(tmpdir(),'tts-ranges-'));let server;
  try{
    await mkdir(join(root,'.cache/public'),{recursive:true});
    const bytes=Buffer.from(Array.from({length:256},(_,i)=>i));
    await writeFile(join(root,'.cache/public/model.gguf'),bytes);
    server=await startServer(root);
    const head=await fetch(server.url+'model.gguf',{method:'HEAD'});
    assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'256');assert.equal(head.headers.get('accept-ranges'),'bytes');
    for(const [range,start,end] of [['bytes=0-99',0,100],['bytes=50-149',50,150],['bytes=-10',246,256]]){
      const response=await fetch(server.url+'model.gguf',{headers:{Range:range}});
      assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end-1}/256`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end));
    }
    for(let attempt=0;server.snapshot().uniqueBytes!==160&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(server.snapshot(),{bytes:210,requests:3,uniqueBytes:160});
    for(const range of ['bytes=256-','bytes=-0','bytes=20-10','bytes=0-1,3-4','bytes=-'])assert.equal((await fetch(server.url+'model.gguf',{headers:{Range:range}})).status,416);
    assert.deepEqual(Buffer.from(await (await fetch(server.url+'model.gguf')).arrayBuffer()),bytes);
    // Content-Length can let fetch finish before the server observes stream EOF.
    for(let attempt=0;server.snapshot().uniqueBytes!==256&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(server.snapshot(),{bytes:466,requests:4,uniqueBytes:256});
    await writeFile(join(root,'.cache/public/empty.gguf'),'');
    const empty=await fetch(server.url+'empty.gguf');assert.equal(empty.status,200);assert.equal((await empty.arrayBuffer()).byteLength,0);
    assert.equal((await fetch(server.url+'empty.gguf',{headers:{Range:'bytes=0-'}})).status,416);
    await writeFile(join(root,'private.gguf'),'private');await symlink(join(root,'private.gguf'),join(root,'.cache/public/escape.gguf'));
    assert.equal((await fetch(server.url+'escape.gguf',{headers:{Range:'bytes=0-2'}})).status,404);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});
