import { resolve, basename } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { resultPaths, readResult, sha256 } from './results.mjs';
import { renderReport } from './report.mjs';
import { verifySource } from './provenance.mjs';
const sourceCache=new Map();
const root=resolve(process.argv[2]??'results');
const paths=root.endsWith('.json')?[root]:await resultPaths(root);
if(!paths.length)throw new Error('No result.json files found');
for(const file of paths){const d=await readResult(file,{publication:true});verifySource(d,process.cwd(),sourceCache);const base=resolve(file,'..');if(JSON.stringify((await readdir(base)).sort())!==JSON.stringify(['chart.svg','checksums.json','result.json','summary.md']))throw new Error('Result bundle must contain exactly four public artifacts');if(basename(base)!==d.id)throw new Error('Result directory must match result.id');const rendered=renderReport(d);for(const [name,value]of [['summary.md',rendered.markdown],['chart.svg',rendered.svg]])if(await readFile(resolve(base,name),'utf8')!==value)throw new Error(`Stale generated report ${name}; rerun npm run report`);const checks=JSON.parse(await readFile(resolve(base,'checksums.json'),'utf8'));if(JSON.stringify(Object.keys(checks).sort())!==JSON.stringify(['chart.svg','result.json','summary.md']))throw new Error('Unexpected checksum entries');for(const [name,digest]of Object.entries(checks))if(sha256(await readFile(resolve(base,name)))!==digest)throw new Error(`Checksum mismatch: ${name}`);console.log(`PASS ${d.id}: ${d.cells.length} cells`);}
