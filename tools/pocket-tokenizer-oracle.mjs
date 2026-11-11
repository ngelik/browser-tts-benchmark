// Text-only reference: pinned original frontend + native SentencePiece, never TTS.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),python=args[args.indexOf('--python')+1];
if(!args.includes('--python')||!python)throw Error('Use --python /path/to/venv/bin/python with sentencepiece==0.2.1');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const lock=JSON.parse(await readFile('assets.lock.json','utf8')).models['pocket-tts-100m-english-int8'];
async function asset(id){const a=lock.assets.find(a=>a.id===id);assert.ok(a,'Missing locked asset '+id);const path='.cache/public/'+a.target,bytes=await readFile(path);assert.equal(bytes.length,a.bytes);assert.equal(hash(bytes),a.sha256);return {path,bytes,sha256:a.sha256};}
const worker=await asset('pocket-tts-upstream-worker'),model=await asset('pocket-tts-tokenizer-model'),bundle=await asset('pocket-tts-bundle-json');
const referenceCode=`import sys,json,sentencepiece as sp\nassert sp.__version__=='0.2.1'\np=sp.SentencePieceProcessor(model_file=sys.argv[1])\nr=json.load(sys.stdin)\nprint(json.dumps(p.encode(r['value'],out_type=int) if r['op']=='encode' else p.decode(r['value'])))`;
const cache=new Map();
function reference(op,value){const key=JSON.stringify({op,value});if(!cache.has(key))cache.set(key,JSON.parse(execFileSync(python,['-c',referenceCode,model.path],{input:key,encoding:'utf8',maxBuffer:2000000})));return structuredClone(cache.get(key));}
const context=vm.createContext({self:{postMessage(){}},postMessage(){},console:{log(){},error(){}},referenceTokenizer:{encodeIds:text=>reference('encode',text),decodeIds:ids=>reference('decode',ids)},metadata:JSON.parse(bundle.bytes)});
vm.runInContext(worker.bytes.toString(),context);
vm.runInContext('tokenizerProcessor=referenceTokenizer;bundleMetadata=metadata;currentMaxTokenPerChunk=metadata.max_token_per_chunk;',context);
const article=await readFile('fixtures/en-20000.txt','utf8'),fixture=JSON.parse(await readFile('fixtures/en-20000.chunks.json','utf8'));
assert.equal(hash(article),fixture.articleSha256);
const entries=[];
for(const chunk of fixture.chunks){context.text=article.slice(chunk.start,chunk.end);const value=vm.runInContext(`(()=>{const prepared=prepareTextPrompt(text);const split=splitIntoBestSentences(text);return {prepared,...split,utterances:split.chunks.map(text=>{const ids=tokenizerProcessor.encodeIds(text);return {text,ids,decoded:tokenizerProcessor.decodeIds(ids)};})};})()`,context);entries.push({id:chunk.id,...JSON.parse(JSON.stringify(value))});}
const result={referenceImplementation:'SentencePiece 0.2.1 with pinned original JS frontend (text only)',fixtureSha256:hash(article),tokenizerModelSha256:model.sha256,bundleSha256:bundle.sha256,upstreamWorkerSha256:worker.sha256,entries};
const path='web/pocket/tokenizer-oracle.json',rendered=JSON.stringify(result,null,2)+'\n';
if(args.includes('--write'))await writeFile(path,rendered);else assert.equal(await readFile(path,'utf8'),rendered,'Pocket tokenizer reference changed; review before updating');
console.log(JSON.stringify({spans:entries.length,utterances:entries.reduce((n,e)=>n+e.utterances.length,0),referenceCalls:cache.size,reference:result.referenceImplementation}));
