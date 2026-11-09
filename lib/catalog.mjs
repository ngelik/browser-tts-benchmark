import { validateSupport } from './model-support.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const lock = JSON.parse(await readFile(resolve(root, 'assets.lock.json'), 'utf8'));

export function listModels() {
  return Object.entries(lock.models).map(([id, value]) => ({
    id,
    displayName: value.displayName,
    modelRevision: value.modelRevision,
    backends: [...value.backends],
    license: { ...value.license },
    support: structuredClone(validateSupport(value.support)),
    assetIds: value.assets.map(asset => asset.id),
  }));
}

export function getModel(modelId) {
  const value = lock.models[modelId];
  if (!value) throw new Error('Unknown model: ' + modelId);
  validateSupport(value.support);
  return { id: modelId, ...value };
}

export function getAssetLock() {
  return lock;
}

