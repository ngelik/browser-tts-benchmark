import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runnerSource = await readFile(join(projectRoot, 'tools/run-campaign.mjs'), 'utf8');

const catalogStub = `
export function getModel(id) {
  if (id === 'one' || id === 'two') return { id };
  throw new Error('Unknown model: ' + id);
}
`;

const benchStub = `
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = flag => args[args.indexOf(flag) + 1];
const model = arg('--model');
const backend = arg('--backend');
const scenario = arg('--scenario');
const events = process.env.CAMPAIGN_TEST_EVENTS;
await appendFile(events, JSON.stringify({ event: 'start', model, backend, scenario }) + '\\n');
await new Promise(resolve => setTimeout(resolve, 15));

const failure = model === process.env.CAMPAIGN_TEST_FAIL_MODEL;
if (failure) {
  await appendFile(events, JSON.stringify({ event: 'end', model, exitCode: 17 }) + '\\n');
  process.exit(17);
}

const id = 'stub-' + model + '-' + backend;
const result = 'runs/' + id + '/result.json';
const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir(join('runs', id), { recursive: true });
const receipt = {
  id,
  status: 'measured',
  source: { gitCommit, dirty: false },
  protocol: { smoke: false },
  fixture: { characters: 20000, chunks: 93 },
  cells: [{ status: 'measured', trials: [] }],
};
await writeFile(result, JSON.stringify(receipt) + '\\n');
await appendFile(events, JSON.stringify({ event: 'end', model, exitCode: 0 }) + '\\n');
process.stdout.write(JSON.stringify({ id, status: 'measured', result }) + '\\n');
`;

async function sandbox(t, plan, { failModel, dirty = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tts-campaign-runner-test-'));
  const events = join(tmpdir(), `tts-campaign-events-${process.pid}-${Math.random().toString(16).slice(2)}.jsonl`);
  await writeFile(events, '');
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(events, { force: true });
  });

  await mkdir(join(directory, 'tools'), { recursive: true });
  await mkdir(join(directory, 'lib'), { recursive: true });
  await mkdir(join(directory, 'bin'), { recursive: true });
  await writeFile(join(directory, 'tools/run-campaign.mjs'), runnerSource);
  await writeFile(join(directory, 'lib/catalog.mjs'), catalogStub);
  await writeFile(join(directory, 'bin/bench.mjs'), benchStub);
  await writeFile(join(directory, '.gitignore'), 'runs/\n');
  await writeFile(join(directory, 'source.txt'), 'committed source\n');
  await writeFile(join(directory, 'campaign-plan.json'), JSON.stringify(plan));

  const git = (args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'Campaign Test']);
  git(['config', 'user.email', 'campaign-test@example.invalid']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'fixture']);
  if (dirty) await writeFile(join(directory, 'source.txt'), 'dirty source\n');
  return { directory, events };
}

function invoke(directory, events, failModel) {
  return spawnSync(process.execPath, [
    'tools/run-campaign.mjs', '--plan', 'campaign-plan.json',
    '--machine', 'Test machine', '--accept-license',
  ], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      CAMPAIGN_TEST_EVENTS: events,
      ...(failModel ? { CAMPAIGN_TEST_FAIL_MODEL: failModel } : {}),
    },
  });
}

async function campaignDirectory(root) {
  const names = (await readdir(join(root, 'runs'))).filter(name => name.startsWith('campaign-'));
  assert.equal(names.length, 1, 'expected one campaign ledger directory');
  return join(root, 'runs', names[0]);
}

async function eventRows(path) {
  const raw = await readFile(path, 'utf8');
  return raw.trim() ? raw.trim().split('\n').map(line => JSON.parse(line)) : [];
}

const cell = (model, backend = 'cpu', scenario = 'cached', repetitions = 1, extra = {}) => ({
  model, backend, scenario, repetitions, ...extra,
});
const plan = cells => ({ schemaVersion: 1, conditions: 'isolated test campaign', cells });

test('campaign runner waits for each child before starting the next cell and records result IDs', async t => {
  const { directory, events } = await sandbox(t, plan([
    cell('one', 'cpu'),
    cell('two', 'webgpu'),
  ]));

  const run = invoke(directory, events);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual((await eventRows(events)).map(row => [row.event, row.model]), [
    ['start', 'one'], ['end', 'one'], ['start', 'two'], ['end', 'two'],
  ]);

  const ledger = await campaignDirectory(directory);
  const attempts = (await readFile(join(ledger, 'attempts.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts.map(row => row.cell.model), ['one', 'two']);
  assert.deepEqual(attempts.map(row => row.resultId), ['stub-one-cpu', 'stub-two-webgpu']);
});

test('campaign runner stops after the first child failure and retains its failed attempt', async t => {
  const { directory, events } = await sandbox(t, plan([
    cell('one'),
    cell('two'),
  ]));

  const run = invoke(directory, events, 'one');
  assert.notEqual(run.status, 0);
  assert.deepEqual((await eventRows(events)).map(row => [row.event, row.model]), [
    ['start', 'one'], ['end', 'one'],
  ]);

  const ledger = await campaignDirectory(directory);
  const attempts = (await readFile(join(ledger, 'attempts.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].cell.model, 'one');
  assert.equal(attempts[0].exitCode, 17);
});

test('campaign runner rejects dirty source before spawning a child', async t => {
  const { directory, events } = await sandbox(t, plan([cell('one')]), { dirty: true });

  const run = invoke(directory, events);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /same clean committed source/i);
  assert.deepEqual(await eventRows(events), []);
});

test('campaign runner rejects warm plans with fewer than five repetitions before spawning a child', async t => {
  const { directory, events } = await sandbox(t, plan([cell('one', 'cpu', 'warm', 4)]));

  const run = invoke(directory, events);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Invalid campaign repetitions/);
  assert.deepEqual(await eventRows(events), []);
});

test('campaign runner stops when a resource cell lacks measured generation-RAM evidence', async t => {
  const { directory, events } = await sandbox(t, plan([
    cell('one', 'cpu', 'cached', 1, { resources: true }),
    cell('two'),
  ]));

  const run = invoke(directory, events);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Generation RAM was not sufficiently sampled/);
  assert.deepEqual((await eventRows(events)).map(row => [row.event, row.model]), [
    ['start', 'one'], ['end', 'one'],
  ]);

  const ledger = await campaignDirectory(directory);
  const attempts = (await readFile(join(ledger, 'attempts.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].resultId, 'stub-one-cpu');
  assert.match(attempts[0].reviewError, /Generation RAM/);
});
