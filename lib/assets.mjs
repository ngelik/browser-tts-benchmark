import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModel, getAssetLock } from './catalog.mjs';
export { listModels } from './catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = resolve(root, '.cache/public');
const sourceRoot = resolve(root, 'node_modules');
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const safeRelative = value => {
  if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error('Asset paths must be relative');
  const resolved = resolve(stageRoot, value);
  const rel = relative(stageRoot, resolved);
  if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('Asset path escapes the local cache');
  return resolved;
};
const matches = (bytes, asset) => bytes.byteLength === asset.bytes && hashBytes(bytes) === asset.sha256;

async function verifyFile(file, asset) {
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) throw new Error('Missing staged asset: ' + asset.id + ' (' + asset.target + ')');
  if (!matches(bytes, asset)) throw new Error('Checksum or size mismatch for ' + asset.id);
  return { id: asset.id, sha256: asset.sha256, bytes: asset.bytes };
}

function runtimeReceiptId(model, asset) {
  return 'runtime:' + model.id + ':' + (asset.package ?? model.runtime.package) + ':' + asset.path;
}

async function stageBytes(file, asset, bytes) {
  if (!matches(bytes, asset)) throw new Error('Downloaded/imported checksum or size mismatch for ' + asset.id);
  await mkdir(dirname(file), { recursive: true });
  const partial = file + '.' + process.pid + '.partial';
  await rm(partial, { force: true });
  await writeFile(partial, bytes, { flag: 'wx' });
  await rename(partial, file);
  return { id: asset.id, sha256: asset.sha256, bytes: asset.bytes };
}

async function stageRuntime(model, mode, source) {
  if (mode === 'verify') {
    const receipts = [];
    for (const asset of model.runtime.files) {
      const receipt = await verifyFile(safeRelative(asset.target), asset);
      receipt.id = runtimeReceiptId(model, asset);
      receipts.push(receipt);
    }
    return receipts;
  }
  const packageVersions = new Map();
  const receipts = [];
  for (const asset of model.runtime.files) {
    const packageName = asset.package ?? model.runtime.package;
    const packageVersion = asset.version ?? model.runtime.version;
    let installedVersion = packageVersions.get(packageName);
    if (installedVersion === undefined) {
      const packageJsonPath = resolve(sourceRoot, packageName, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      installedVersion = packageJson.version;
      packageVersions.set(packageName, installedVersion);
    }
    if (installedVersion !== packageVersion) {
      throw new Error(packageName + ' version mismatch: expected ' + packageVersion + ', found ' + installedVersion);
    }
    const npmSource = resolve(sourceRoot, packageName, asset.path);
    const destination = safeRelative(asset.target);
    if (asset.url) {
      try {
        receipts.push(await verifyFile(destination, asset).then(receipt => ({ ...receipt, id: runtimeReceiptId(model, asset) })));
        continue;
      } catch {
        // URL-backed license and notice files are staged below from their pinned source.
      }
      const receipt = mode === 'fetch'
        ? await fetchAsset({ ...asset, id: runtimeReceiptId(model, asset) })
        : await importAsset(source, { ...asset, id: runtimeReceiptId(model, asset) });
      receipts.push(receipt);
      continue;
    }
    const bytes = await readFile(npmSource);
    if (!matches(bytes, asset)) throw new Error('Installed npm file differs from asset lock: ' + asset.path);
    try {
      receipts.push(await verifyFile(destination, asset).then(receipt => ({
        ...receipt,
        id: runtimeReceiptId(model, asset),
      })));
      continue;
    } catch {
      // Replace a missing or damaged staged copy from the pinned npm package.
    }
    await mkdir(dirname(destination), { recursive: true });
    const partial = destination + '.' + process.pid + '.partial';
    await rm(partial, { force: true });
    await copyFile(npmSource, partial);
    await rename(partial, destination);
    receipts.push({ id: runtimeReceiptId(model, asset), sha256: asset.sha256, bytes: asset.bytes });
  }
  return receipts;
}

async function importAsset(source, asset) {
  if (!source) throw new Error('assets import requires a source directory or asset map');
  let file;
  if (typeof source === 'string') {
    file = resolve(source, asset.target);
  } else if (typeof source === 'object' && !Array.isArray(source)) {
    const value = source[asset.id];
    if (!value) throw new Error('assets import source is missing asset id ' + asset.id);
    file = resolve(value);
  } else {
    throw new Error('assets import source must be a directory path or an object mapping asset ids to paths');
  }
  const bytes = await readFile(file);
  return stageBytes(safeRelative(asset.target), asset, bytes);
}

async function stageRepositoryAsset(asset) {
  if (typeof asset.sourcePath !== 'string' || !asset.sourcePath || isAbsolute(asset.sourcePath)) {
    throw new Error('Repository asset sourcePath must be a relative path: ' + asset.id);
  }
  const source = resolve(root, asset.sourcePath);
  const rel = relative(root, source);
  if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('Repository asset sourcePath escapes the checkout: ' + asset.id);
  const bytes = await readFile(source);
  return stageBytes(safeRelative(asset.target), asset, bytes);
}

async function fetchAsset(asset) {
  try {
    const existing = await verifyFile(safeRelative(asset.target), asset);
    return existing;
  } catch {
    // Continue with an immutable upstream URL when no valid local copy exists.
  }
  const timeoutMs = asset.bytes >= 20_000_000 ? 30 * 60_000 : 10 * 60_000;
  const response = await fetch(asset.url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('Asset fetch failed for ' + asset.id + ': HTTP ' + response.status);
  const length = Number(response.headers.get('content-length'));
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  if ((!contentEncoding || contentEncoding === 'identity') && Number.isFinite(length) && length > 0 && length !== asset.bytes) {
    throw new Error('Asset fetch length mismatch for ' + asset.id + ': expected ' + asset.bytes + ', got ' + length);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return stageBytes(safeRelative(asset.target), asset, bytes);
}

export async function prepareAssets(modelId, { mode = 'verify', source, acceptLicense = false } = {}) {
  const model = getModel(modelId);
  if (!['fetch', 'verify', 'import'].includes(mode)) throw new Error('Asset mode must be fetch, import, or verify');
  if (model.license.requiresAcceptance && !acceptLicense) {
    throw new Error('Local terms acknowledgement is required for ' + modelId + '; pass acceptLicense: true after reviewing docs/LICENSING.md');
  }
  const receipts = await stageRuntime(model, mode, source);
  for (const asset of model.assets) {
    if (mode === 'verify') receipts.push(await verifyFile(safeRelative(asset.target), asset));
    else if (asset.sourcePath) receipts.push(await stageRepositoryAsset(asset));
    else if (mode === 'fetch') receipts.push(await fetchAsset(asset));
    else receipts.push(await importAsset(source, asset));
  }
  return receipts;
}

export async function verifyAllAssets(modelId) {
  return prepareAssets(modelId, { mode: 'verify', acceptLicense: true });
}

export async function assetManifestSha256() {
  const bytes = await readFile(resolve(root, 'assets.lock.json'));
  return hashBytes(bytes);
}

export async function stagedAssetBytes(modelId) {
  const model = getModel(modelId);
  const files = [
    ...model.runtime.files.map(file => ({ id: runtimeReceiptId(model, file), ...file })),
    ...model.assets,
  ];
  const out = [];
  for (const file of files) {
    const bytes = await readFile(safeRelative(file.target));
    if (!matches(bytes, file)) throw new Error('Checksum or size mismatch for ' + file.id);
    out.push({ id: file.id.startsWith('runtime:') ? file.id : file.id, sha256: file.sha256, bytes: file.bytes });
  }
  return out;
}

export function assetCacheRoot() {
  return stageRoot;
}

export function assetLock() {
  return getAssetLock();
}
