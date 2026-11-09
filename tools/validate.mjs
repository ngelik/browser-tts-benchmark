import { resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resultPaths, readResult, sha256 } from './results.mjs';
import { renderReport } from './report.mjs';
const root=resolve(process.argv[2]??'results');
const paths=root.endsWith('.json')?[root]:await resultPaths(root);
if(!paths.length)throw new Error('No result.json files found');
for(const file of paths){const d=await readResult(file,{publication:true});const base=resolve(file,'..');if(basename(base)!==d.id)throw new Error('Result directory must match result.id');const rendered=renderReport(d);for(const [name,value]of [['summary.md',rendered.markdown],['chart.svg',rendered.svg]])if(await readFile(resolve(base,name),'utf8')!==value)throw new Error(`Stale generated report ${name}; rerun npm run report`);const checks=JSON.parse(await readFile(resolve(base,'checksums.json'),'utf8'));if(JSON.stringify(Object.keys(checks).sort())!==JSON.stringify(['chart.svg','result.json','summary.md']))throw new Error('Unexpected checksum entries');for(const [name,digest]of Object.entries(checks))if(sha256(await readFile(resolve(base,name)))!==digest)throw new Error(`Checksum mismatch: ${name}`);console.log(`PASS ${d.id}: ${d.cells.length} cells`);}
