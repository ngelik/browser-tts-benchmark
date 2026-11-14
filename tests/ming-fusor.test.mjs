import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMingManifest, validateMingProgress, MING_EXPORT} from '../web/ming/contract.mjs';
import {validateComputeSpawn, SPAWN_COMPUTE} from '../web/liquid-cpu/compute-pool.mjs';
import {getModel} from '../lib/catalog.mjs';
import {MODEL_ID} from '../web/ming/config.mjs';

test('Ming accepts its format-1 parts and rejects unsafe paths and duplicate parts', () => {
  const model = getModel(MODEL_ID);
  const parts = model.assets.filter(a=>a.kind==='model-weights'||a.target.endsWith('/tokenizer.json')).map(a=>({
    file:a.target.split(model.modelRevision+'/')[1], bytes:a.bytes, blake3:'0'.repeat(64),
  }));
  const manifest = {format:1,model:{repo:MING_EXPORT.repo,revision:MING_EXPORT.revision,profile:'mix'},parts};
  assert.equal(validateMingManifest(manifest),true);
  assert.throws(()=>validateMingManifest({...manifest,format:2}));
  assert.throws(()=>validateMingManifest({...manifest,parts:[...parts.slice(1),parts[1]]}));
  assert.throws(()=>validateMingManifest({...manifest,parts:[{...parts[0],file:'../outside'},...parts.slice(1)]}));
});
test('Ming rejects frame caps and preserves ordered multi-fragment output', () => {
  const f = (fragment,frame,done=false)=>({fragment,fragments:2,frame,done});
  const check = (event,previous)=>validateMingProgress(event,{fragments:2,previous,maxFrames:3});
  const start=check(f(0,0),null);
  const next=check(f(0,1),start);
  assert.throws(()=>check(f(0,2),next),/budget/);
  assert.throws(()=>check(f(1,1),next),/reordered/);
  assert.equal(check(f(1,0,true),next).done,true);
});
test('Ming Rayon pool accepts its pinned entry without changing Liquid defaults', () => {
  const root='https://example.test/runtimes/ming-fusor/archived/engine/dist/';
  const msg={type:SPAWN_COMPUTE,count:6,module:{},memory:{},receiver:1,port:{postMessage(){}},
    url:root+'web-threaded-relaxed/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.no-bundler.js',
    mainJS:root+'web-threaded-relaxed/ming_runtime.js'};
  assert.equal(validateComputeSpawn(msg,{runtimeRoot:root,threads:6,glueName:'ming_runtime.js'}).mainJS,msg.mainJS);
  assert.throws(()=>validateComputeSpawn(msg,{runtimeRoot:root,threads:6}));
});
