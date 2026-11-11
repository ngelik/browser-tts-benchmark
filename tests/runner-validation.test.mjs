import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistValidationFailure } from '../lib/runner.mjs';

test('final validation failure stores the invalid candidate and sets terminal error status', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tts-final-validation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = 'run-validation-failure';
  const result = { id, cells: [{ status: 'measured', capability: { forbidden: 'preserved for diagnosis' } }] };
  const stages = [];
  const returned = await persistValidationFailure({
    id,
    runRoot: root,
    result,
    reason: 'Unrecognized key capability.executionProvider',
    status: async stage => stages.push(stage),
  });

  assert.deepEqual(stages, ['error']);
  assert.equal(returned.status, 'error');
  assert.equal(returned.result, null);
  assert.equal(returned.diagnostic, `runs/${id}/invalid-result.json`);
  assert.match(returned.reason, /Final result validation failed/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'invalid-result.json'), 'utf8')), result);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'error.json'), 'utf8')), {
    id,
    status: 'error',
    phase: 'result-validation',
    reason: 'Unrecognized key capability.executionProvider',
    diagnostic: `runs/${id}/invalid-result.json`,
  });
  assert.ok(!(await readdir(root)).includes('result.json'));
});
