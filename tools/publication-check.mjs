import { MAX_RESOURCE_RECEIPT_BYTES, readResult } from './results.mjs';
import { checkAudio } from './audio.mjs';
import {reviewedIndex} from './publication-index.mjs';
import { readFile, lstat } from 'node:fs/promises';
const audioPaths=await checkAudio();
const files=reviewedIndex(['audio/manifest.json',...audioPaths]);
for(const file of files){
  if(audioPaths.has(file)){const st=await lstat(file);if(st.isSymbolicLink()||!st.isFile())throw new Error('Unsafe audio publication entry');continue;}
  if(/(?:^|\/)(?:node_modules|\.cache|runs|chrome-profile[^/]*|\.env)(?:\/|$)/.test(file)||/\.(?:onnx|gguf|safetensors|wasm|wav|mp3|zip|tgz|heapsnapshot)$/i.test(file))throw new Error(`Nonpublic artifact tracked: ${file}`);
  const resultReceipt=/^results\/[a-z0-9._-]+\/result\.json$/.test(file);
  const st=await lstat(file);if(st.isSymbolicLink()||!st.isFile()||st.size>(resultReceipt?MAX_RESOURCE_RECEIPT_BYTES:2_000_000))throw new Error(`Unsafe or oversized publication entry: ${file}`);
  if(resultReceipt&&st.size>=2_000_000)await readResult(file,{publication:true});
  const raw=await readFile(file);if(raw.includes(0))throw new Error(`Binary file in source publication: ${file}`);
  const s=raw.toString('utf8');
  if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(s))throw new Error(`Credential-like material: ${file}`);
  if(/(?:\/Users\/[A-Za-z0-9]|\/home\/[A-Za-z0-9]|[A-Za-z]:\\Users\\)/.test(s))throw new Error(`Private absolute path: ${file}`);
}
console.log(`PASS publication inventory: ${files.length} files (${audioPaths.size} verified audio clips), no tracked weights/cache/private paths`);
