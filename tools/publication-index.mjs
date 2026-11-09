import {execFileSync} from 'node:child_process';
export function reviewedIndex(required=[],cwd=process.cwd()){
 const entries=execFileSync('git',['ls-files','--stage','-z'],{cwd,encoding:'utf8'}).split('\0').filter(Boolean).map(s=>{const i=s.indexOf('\t');return {meta:s.slice(0,i).split(' '),path:s.slice(i+1)};});
 if(!entries.length)throw new Error('No staged publication files');
 for(const e of entries)if(!['100644','100755'].includes(e.meta[0])||e.meta[2]!=='0')throw new Error('Unsafe or unmerged Git index entry: '+e.path);
 const files=entries.map(e=>e.path),set=new Set(files);for(const p of required)if(!set.has(p))throw new Error('Required publication file is not tracked: '+p);
 try{execFileSync('git',['diff-files','--quiet','--'],{cwd,stdio:'pipe'});}catch{throw new Error('Stage all reviewed changes before publication: index and working tree differ');}
 return files;
}
