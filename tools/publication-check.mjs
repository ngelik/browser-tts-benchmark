import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw new Error('No tracked publication files; stage the reviewed repository first');
for(const file of files){
  if(/(?:^|\/)(?:node_modules|\.cache|runs|chrome-profile[^/]*|\.env)(?:\/|$)/.test(file)||/\.(?:onnx|gguf|safetensors|wasm|wav|mp3|zip|tgz|heapsnapshot)$/i.test(file))throw new Error(`Nonpublic artifact tracked: ${file}`);
  const st=await lstat(file);if(st.isSymbolicLink()||!st.isFile()||st.size>2000000)throw new Error(`Unsafe or oversized publication entry: ${file}`);
  const raw=await readFile(file);if(raw.includes(0))throw new Error(`Binary file in source publication: ${file}`);
  const s=raw.toString('utf8');
  if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(s))throw new Error(`Credential-like material: ${file}`);
  if(/(?:\/Users\/[A-Za-z0-9]|\/home\/[A-Za-z0-9]|[A-Za-z]:\\Users\\)/.test(s))throw new Error(`Private absolute path: ${file}`);
}
console.log(`PASS publication inventory: ${files.length} text files, no tracked weights/audio/cache/private paths`);
