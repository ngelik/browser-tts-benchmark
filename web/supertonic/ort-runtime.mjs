let runtimeModule = null;
let trackedTensorConstructor = null;
let trackedSessionConstructor = null;
let activeTensors = null;
const persistentTensors = new Set();
const sessions = new Set();

function track(tensor) {
  if (typeof tensor?.dispose === 'function') (activeTensors ?? persistentTensors).add(tensor);
  return tensor;
}

function disposeSet(tensors, label) {
  let firstError = null;
  for (const tensor of tensors) {
    try { tensor.dispose(); }
    catch (error) { firstError ??= error; }
  }
  tensors.clear();
  if (firstError) throw new Error(`${label} failed: ${String(firstError?.message ?? firstError)}`);
}

function trackSession(session) {
  const originalRun = session.run.bind(session);
  const trackedRun = async (...args) => {
    const outputs = await originalRun(...args);
    for (const tensor of Object.values(outputs ?? {})) track(tensor);
    return outputs;
  };
  try {
    session.run = trackedRun;
    if (session.run !== trackedRun) throw new Error('Could not wrap ONNX session.run for output cleanup.');
  } catch (error) {
    sessions.add(session);
    throw error;
  }
  sessions.add(session);
  return session;
}

export function configureOrt(module) {
  if (!module?.Tensor || !module?.InferenceSession?.create) throw new Error('ONNX Runtime Web module is incomplete.');
  if (activeTensors || sessions.size || persistentTensors.size) throw new Error('ONNX Runtime Web was configured while resources were still active.');
  runtimeModule = module;
  trackedTensorConstructor = new Proxy(module.Tensor, {
    construct(target, args, newTarget) {
      return track(Reflect.construct(target, args, newTarget));
    },
  });
  trackedSessionConstructor = new Proxy(module.InferenceSession, {
    get(target, property, receiver) {
      if (property !== 'create') return Reflect.get(target, property, receiver);
      const create = Reflect.get(target, property, target);
      return async (...args) => trackSession(await create.apply(target, args));
    },
  });
}

export const ort = new Proxy(Object.create(null), {
  get(_target, property) {
    if (!runtimeModule) throw new Error('Configure ONNX Runtime Web before using the official helper.');
    if (property === 'Tensor') return trackedTensorConstructor;
    if (property === 'InferenceSession') return trackedSessionConstructor;
    const value = Reflect.get(runtimeModule, property, runtimeModule);
    return typeof value === 'function' ? value.bind(runtimeModule) : value;
  },
});

export function beginTensorScope() {
  if (!runtimeModule) throw new Error('ONNX Runtime Web is not configured.');
  if (activeTensors) throw new Error('Nested Supertonic tensor scopes are not supported.');
  const owned = new Set();
  activeTensors = owned;
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (activeTensors !== owned) throw new Error('Supertonic tensor scope ownership changed unexpectedly.');
      activeTensors = null;
      disposeSet(owned, 'Supertonic temporary tensor disposal');
    },
  };
}

export async function releaseOrt() {
  let firstError = null;
  if (activeTensors) {
    const temporary = activeTensors;
    activeTensors = null;
    try { disposeSet(temporary, 'Supertonic temporary tensor disposal'); }
    catch (error) { firstError ??= error; }
  }
  for (const session of sessions) {
    try { await session.release(); }
    catch (error) { firstError ??= error; }
  }
  sessions.clear();
  try { disposeSet(persistentTensors, 'Supertonic persistent tensor disposal'); }
  catch (error) { firstError ??= error; }
  runtimeModule = null;
  trackedTensorConstructor = null;
  trackedSessionConstructor = null;
  if (firstError) throw new Error(`Supertonic ONNX cleanup failed: ${String(firstError?.message ?? firstError)}`);
}
