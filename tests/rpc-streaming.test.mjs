import test from 'node:test';
import assert from 'node:assert/strict';
import {createRpcAdapter} from '../web/adapters/rpc-bridge.mjs';

test('streaming PCM notification does not resolve the chunk or fire twice', async () => {
  const OriginalWorker=globalThis.Worker;
  let worker;
  class FakeWorker {
    constructor(){worker=this;}
    postMessage(message){this.last=message;if(message.action!=='generate')queueMicrotask(()=>this.onmessage({data:{id:message.id,value:null}}));}
    terminate(){}
    reply(data){this.onmessage({data:{id:this.last.id,...data}});}
  }
  globalThis.Worker=FakeWorker;
  try {
    const adapter=createRpcAdapter('test','test');await adapter.initialize({});
    let first=0,completed=false;
    const pending=adapter.generateChunk({id:0,text:'Test'}, {onFirstPcm:()=>first++}).then(value=>{completed=true;return value;});
    worker.reply({event:'first-pcm'});worker.reply({event:'first-pcm'});
    await Promise.resolve();assert.equal(first,1);assert.equal(completed,false);
    worker.reply({value:{parts:[Float32Array.of(0.2)],sampleRate:24000,completedChunkId:0}});
    assert.equal((await pending).completedChunkId,0);assert.equal(first,1);
    await adapter.dispose();
  } finally {globalThis.Worker=OriginalWorker;}
});
