import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateResult, sha256 } from './results.mjs';
import { renderReport } from './report.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
const ensure = (test, message) => { if (!test) throw new Error(message); };
export function buildComparison(inputs) {
  ensure(inputs.length >= 2, 'A comparison requires at least two result bundles');
  const all = inputs.map(d => validateResult(d, { publication: true }));
  ensure(all.every(d => d.origin === 'native'), 'Compare native runs only; historical CPU/GPU protocols are different');
  const base = all[0], cells = [], seen = new Set(), settingsByModel = new Map(), assetDigests = new Map();
  const gpuNames = new Set(all.map(d => d.environment.gpu).filter(Boolean));
  ensure(gpuNames.size <= 1, 'GPU adapter descriptions differ');
  for (const d of all) {
    for (const asset of d.assets) { const signature = asset.sha256 + '/' + asset.bytes; const previous = assetDigests.get(asset.id); ensure(!previous || previous === signature, 'Shared asset hashes or sizes differ: ' + asset.id); assetDigests.set(asset.id, signature); }
    ensure(stable(d.protocol) === stable(base.protocol), 'Protocol, repetitions or timing boundaries differ');
    ensure(stable(d.fixture) === stable(base.fixture), 'Fixtures differ');
    ensure(d.source.manifestSha256 === base.source.manifestSha256, 'Source fingerprints differ');
    for (const key of ['machineLabel','os','arch','cpu','logicalCores','ramBytes','chromeVersion','headless']) {
      ensure(d.environment[key] === base.environment[key], 'Environment differs: ' + key);
    }
    for (const cell of d.cells) {
      const key = cell.model + '/' + cell.backendRequested;
      ensure(!seen.has(key), 'Duplicate model/backend; do not silently pool independent runs');
      seen.add(key);
      if (cell.status === 'measured') {
        const { executionProviders, ...settings } = cell.settings;
        const signature = stable({ voice: cell.voice, precision: cell.precision, settings });
        const previous = settingsByModel.get(cell.model);
        ensure(!previous || signature === previous, 'Voice, precision or non-backend settings differ for ' + cell.model);
        settingsByModel.set(cell.model, signature);
      }
      cells.push(cell);
    }
  }
  cells.sort((a,b) => a.model.localeCompare(b.model) || a.backendRequested.localeCompare(b.backendRequested));
  const joined = { ...base, id: 'native-benchmark-comparison', cells,
    notes: ['Comparison of separate native run receipts; no repetitions were pooled.',
      ...all.map(d => 'Input: ' + d.id),
      'Read each source result for power, thermal, execution-order and other run-specific notes.'] };
  const rendered = renderReport(joined);
  rendered.markdown = rendered.markdown.replace('Native harness run.', 'Comparison of separate native harness runs.');
  return rendered;
}

async function filesFor(paths) {
  const entries = [];
  for (const path of paths) {
    const bytes = await readFile(path), data = JSON.parse(bytes);
    entries.push({ data, digest: sha256(bytes) });
  }
  return entries;
}
async function checkComparisons(root) {
  let dirs;
  try { dirs = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const dir of dirs) {
    ensure(!dir.isSymbolicLink(), 'Comparison symlinks are not permitted');
    if (!dir.isDirectory()) continue;
    const folder = join(root, dir.name), manifest = JSON.parse(await readFile(join(folder, 'inputs.json'), 'utf8'));
    ensure(manifest.schemaVersion === 1 && Array.isArray(manifest.inputs), 'Invalid comparison manifest');
    for (const input of manifest.inputs) ensure(/^[a-z0-9][a-z0-9._-]{0,119}$/.test(input.id), 'Invalid comparison input id');
    const entries = await filesFor(manifest.inputs.map(input => resolve('results', input.id, 'result.json')));
    entries.forEach((entry, i) => ensure(entry.digest === manifest.inputs[i].sha256, 'Comparison input hash changed'));
    const output = buildComparison(entries.map(entry => entry.data));
    ensure(await readFile(join(folder, 'summary.md'), 'utf8') === output.markdown, 'Stale comparison table');
    ensure(await readFile(join(folder, 'chart.svg'), 'utf8') === output.svg, 'Stale comparison visualization');
    console.log('PASS comparison ' + dir.name);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--check') await checkComparisons(resolve(args[1] ?? 'comparisons'));
  else {
    ensure(args[0] === '--out' && args.length >= 4, 'Usage: npm run compare -- --out comparisons/name result1.json result2.json [...]');
    const out = resolve(args[1]), entries = await filesFor(args.slice(2));
    const output = buildComparison(entries.map(entry => entry.data));
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'summary.md'), output.markdown);
    await writeFile(join(out, 'chart.svg'), output.svg);
    await writeFile(join(out, 'inputs.json'), JSON.stringify({ schemaVersion: 1,
      inputs: entries.map(entry => ({ id: entry.data.id, sha256: entry.digest })) }, null, 2) + '\n');
    console.log('Comparison written to ' + args[1]);
  }
}
