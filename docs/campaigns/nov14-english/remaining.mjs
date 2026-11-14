// Run from the clean scoring checkout, passing only ledgers from this reproduction.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const [planPath, ...ledgers] = process.argv.slice(2);
if (!planPath || !ledgers.length) throw Error('Usage: node remaining.mjs ORIGINAL-PLAN attempts.jsonl [attempts.jsonl ...]');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),plan.sourceCommit);
const {readResult} = await import(pathToFileURL(resolve('tools/results.mjs')));
const {verifySource} = await import(pathToFileURL(resolve('tools/provenance.mjs')));
const sources = new Map(), completed = new Set();
const base = await realpath('runs');
const key = c => [c.model,c.backend,c.scenario].join('/');
for (const ledger of ledgers) {
  assert.ok((await realpath(ledger)).startsWith(base+sep),'Ledger must belong to the local runs directory');
  for (const line of (await readFile(ledger,'utf8')).split('\n').filter(Boolean)) {
    const a = JSON.parse(line);
    assert.equal(a.commit,plan.sourceCommit);
    assert.ok(plan.cells.some(c => key(c)===key(a.cell)),'Unexpected cell in this ledger');
    if (a.exitCode !== 0 || a.reviewError !== null) continue;
    assert.match(a.resultId,/^[a-z0-9][a-z0-9._-]{0,119}$/);
    assert.equal(a.resultPath,'runs/'+a.resultId+'/result.json');
    const r = await readResult(a.resultPath,{publication:true});
    verifySource(r,process.cwd(),sources);
    assert.equal(r.id,a.resultId);assert.equal(r.source.gitCommit,plan.sourceCommit);
    const [cell] = r.cells;
    assert.equal(r.cells.length,1);
    const scheduled = plan.cells.find(c=>key(c)===key({model:cell.model,backend:cell.backendRequested,scenario:r.protocol.scenario}));
    assert.deepEqual(scheduled,a.cell);
    assert.equal(r.protocol.id,'browser-tts-'+scheduled.scenario+'-v1'+(scheduled.resources?'-resources':''));
    assert.equal(r.protocol.repetitions,scheduled.repetitions);
    assert.ok(['measured','unsupported'].includes(cell.status));
    if (scheduled.resources && cell.status==='measured') assert.ok(cell.trials.every(t=>t.memory?.availability==='measured'));
    completed.add(key(scheduled));
  }
}
const cells = plan.cells.filter(c=>!completed.has(key(c)));
if (!cells.length) { console.error('All 14 cells have accepted receipts.'); process.exit(0); }
process.stdout.write(JSON.stringify({...plan,cells},null,2)+'\n');
