import { execFileSync } from 'node:child_process';
import { sha256 } from './results.mjs';

export const isBenchmarkSource = file => /^(bin\/|lib\/|web\/|fixtures\/|models\/|tools\/.*\.mjs$|package(?:-lock)?\.json$|assets\.lock\.json$)/.test(file);
export function committedManifest(commit, cwd = process.cwd()) {
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Invalid source commit');
  const git = args => execFileSync('git', args, { cwd, stdio: ['ignore','pipe','pipe'], maxBuffer: 8000000 });
  let files;
  try { files = git(['ls-tree','-rz','--name-only',commit]).toString('utf8').split('\0').filter(isBenchmarkSource).sort(); }
  catch { throw new Error('Recorded source commit is unavailable. Fetch full Git history and publish the implementation before its result: ' + commit); }
  if (!files.length) throw new Error('Recorded commit contains no benchmark source');
  return sha256(files.map(file => `${file}\0${sha256(git(['show',`${commit}:${file}`]))}`).join('\n'));
}
export function verifySource(result, cwd = process.cwd(), cache = new Map()) {
  if (result.origin !== 'native') return;
  const commit = result.source.gitCommit;
  let hash = cache.get(commit);
  if (!hash) { hash = committedManifest(commit, cwd); cache.set(commit, hash); }
  if (hash !== result.source.manifestSha256) throw new Error('Source fingerprint does not match its recorded Git commit: ' + result.id);
}
