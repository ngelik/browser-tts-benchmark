import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildComparison } from './compare.mjs';
const raw = JSON.parse(await readFile(new URL('../results/historical-2026-11-08-m1pro-gpu-warm/result.json', import.meta.url)));
function example() {
  const d = structuredClone(raw);
  d.origin = 'native'; d.source.gitCommit = 'a'.repeat(40); d.source.dirty = false;
  d.cells = d.cells.filter(c => c.status === 'measured').slice(0, 1);
  d.cells[0].settings = { speed: 1, nested: { pronunciation: 'fixed' }, executionProviders: ['webgpu','wasm'] };
  const cpu = structuredClone(d);
  cpu.id = 'test-cpu'; cpu.cells[0].backendRequested = 'cpu'; cpu.cells[0].backendEffective = 'cpu';
  cpu.cells[0].settings.executionProviders = ['wasm'];
  return [cpu, d];
}
test('comparison accepts matching native CPU/GPU runs and retains both samples', () => {
  const rendered = buildComparison(example());
  assert.match(rendered.markdown, /Comparison of separate native harness runs/);
  assert.match(rendered.markdown, /\| cpu \| measured/);
  assert.match(rendered.markdown, /\| webgpu \| measured/);
});
test('comparison rejects historical protocol mixing, duplicate cells and hardware drift', () => {
  assert.throws(() => buildComparison([raw,raw]), /native runs only/);
  const [cpu,gpu] = example();
  assert.throws(() => buildComparison([cpu,cpu]), /Duplicate/);
  gpu.environment.chromeVersion += ' changed';
  assert.throws(() => buildComparison([cpu,gpu]), /Environment differs/);
});
test('comparison rejects nested inference settings and source/protocol drift', () => {
  for (const change of [d=>d.cells[0].settings.nested.pronunciation='changed',d=>d.source.manifestSha256='b'.repeat(64),d=>d.protocol.id='another-protocol',d=>d.assets[0].sha256='c'.repeat(64)]) {
    const [cpu,gpu] = example();change(gpu);assert.throws(()=>buildComparison([cpu,gpu]));
  }
});
