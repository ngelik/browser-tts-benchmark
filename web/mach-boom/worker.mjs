// Original browser wrapper. Pinned upstream Python/C retains Apache-2.0 terms.
const ROOT = '/models/mach-boom/01860b06bdf8498761255ad1c64b99980b96486d/';
const PYODIDE = '/runtimes/mach-boom/pyodide-0.29.3/';
const LIBRARY = '/runtimes/mach-boom/tmk-wasm-v1.so';
const SETTINGS = {runtime:'Pyodide 0.29.3 / NumPy 2.2.5 / Emscripten 4.0.9', threads:1, seed:0, voice:'Zoey', language:'en', frontend:'upstream frontend_en.normalize; Transformers.js 3.5.1 Unigram; Rust regex hex escapes translated to JavaScript Unicode escapes', matmul:'FP32 WASM SIMD128 tiled 2D GEMM; higher dimensions use NumPy', amx:false, chunkFrames:16, firstFrames:2, maxFramesPolicy:'fail if upstream limit reached before EOS', executionProviders:['wasm']};
let py = null;
async function bytes(url) { const r=await fetch(url); if(!r.ok)throw Error(`Mach Boom asset HTTP ${r.status}: ${url}`);return new Uint8Array(await r.arrayBuffer()); }
async function initialize(options) {
 if(options.backend!=='cpu')return {status:'unsupported',reason:'Mach Boom ships CPU C/Python kernels; this browser port runs CPU WebAssembly and has no WebGPU inference implementation.',backendEffective:'none',voice:'Zoey',precision:'Mach trellis 3–4-bit + int8/int4; FP32 compute',settings:{...SETTINGS,executionProviders:[]},capability:{gpuDispatchVerified:false,description:'No GPU path is substituted or silently routed to CPU.'}};
 const {loadPyodide}=await import(PYODIDE+'pyodide.mjs');
 py=await loadPyodide({indexURL:new URL(PYODIDE,location.origin).href});
 if(py.version!=='0.29.3')throw Error('Unexpected Pyodide runtime version');
 await py.loadPackage('numpy');
 py.FS.mkdirTree('/mach/voices');
 for(const name of ['mach.py','packfmt.py','frontend_en.py','voices/voices.jsonl','voices/NbpkqMVS3CJeq2j8.safetensors','mach-boom.bin']) py.FS.writeFile('/mach/'+name,await bytes(ROOT+name));
 py.FS.writeFile('/mach/tmk_wasm.so',await bytes(LIBRARY));
 py.FS.writeFile('/mach/browser_patch.py',await bytes('/web/mach-boom/browser_patch.py'));
 const {PreTrainedTokenizer,env}=await import('/runtimes/transformers/3.5.1/transformers.min.js');
 env.allowRemoteModels=false;
 const tokenizerData=JSON.parse(new TextDecoder().decode(await bytes(ROOT+'tokenizer.json')));
 for(const n of tokenizerData.normalizer.normalizers) if(n.pattern?.Regex)n.pattern.Regex=n.pattern.Regex.replaceAll('\\x{','\\u{');
 // Transformers.js 3.5.1 uses the legacy name for Metaspace prepend behavior.
 for(const d of tokenizerData.decoder.decoders)if(d.type==='Metaspace'&&d.prepend_scheme==='always')d.add_prefix_space=true;
 const tokenizer=new PreTrainedTokenizer(tokenizerData,{tokenizer_class:'PreTrainedTokenizer',unk_token:'<unk>'});
 globalThis.machTokenize=text=>{const ids=tokenizer.encode(text,{add_special_tokens:false});if(!ids.length||ids.includes(tokenizerData.model.unk_id))throw Error('Mach Boom tokenizer returned empty or unknown tokens');return ids;};
 globalThis.machDecode=ids=>tokenizer.decode(Array.from(ids),{skip_special_tokens:true});
 py.runPython(`import sys\nsys.path.insert(0,'/mach')\nfrom browser_patch import MachBoom, verify_matmul\nfrom types import SimpleNamespace\nimport js\nclass BrowserTokenizer:\n def encode(self,text,add_special_tokens=False):\n  return SimpleNamespace(ids=js.machTokenize(text).to_py())\n def decode(self,ids,skip_special_tokens=True):\n  return js.machDecode(ids)\ntts=MachBoom('/mach/mach-boom.bin',voices_dir='/mach/voices',so='/mach/tmk_wasm.so',threads=1,lm_threads=1,amx=False)\ntts.tok=BrowserTokenizer()\nassert tts.k.lib.tmk_threads(1)==1\n`);
 if(options.probe)py.runPython('assert verify_matmul()');
 return {status:'measured',backendEffective:'cpu',voice:'Zoey',precision:'Mach trellis 3–4-bit + int8/int4; FP32 compute',settings:SETTINGS,capability:{gpuDispatchVerified:null,description:'Upstream Python/NumPy and portable C kernels execute inside one Chrome worker through WebAssembly. No host Python synthesis, AMX, or GPU.'},sampleRate:24000};
}
async function generate(chunk,id) {
 if(!py)throw Error('Mach Boom is not initialized');
 py.globals.set('source_text',chunk.text);
 const iterator=py.runPython("tts.synth_stream(source_text, 'Zoey', seed=0, threads=1, chunk=16, first=2)");
 const parts=[];let first=true;
 try {
  for(const pcm of iterator) {
   let buffer;let copy;
   try {buffer=pcm.getBuffer('f32');copy=new Float32Array(buffer.data);}
   finally {buffer?.release();pcm.destroy();}
   if(copy.length && first){first=false;postMessage({id,event:'first-pcm'});}
   parts.push(copy);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{iterator.destroy();py.globals.delete('source_text');}
 return {parts,sampleRate:24000,completedChunkId:chunk.id};
}
self.onmessage=async({data})=>{
 const {id,action,options,chunk}=data;
 try {
  let value;
  if(action==='initialize')value=await initialize(options);
  else if(action==='generate')value=await generate(chunk,id);
  else if(action==='audit'){
   py.globals.set('source_text',data.text);
   const result=py.runPython("__import__('json').dumps({'normalized':__import__('frontend_en').normalize(source_text),'ids':tts.text_ids(__import__('frontend_en').normalize(source_text))[0],'decoded':tts.tok.decode(tts.text_ids(__import__('frontend_en').normalize(source_text))[0]),'numWords':tts.text_ids(__import__('frontend_en').normalize(source_text))[1]})");
   value=JSON.parse(result);py.globals.delete('source_text');
  }else if(action==='dispose'){if(py)py.runPython("tts=None; __import__('gc').collect()");py=null;value={};}
  else throw Error('Unknown Mach Boom worker action');
  postMessage({id,value},value?.parts?.map(part=>part.buffer)??[]);
 }catch(error){postMessage({id,error:String(error?.stack??error)});}
};
