import '/runtimes/phonon-tts/0.6.0/worker.js';

const phononHandler = self.onmessage;
let originalMethods = [];
let dispatchCounts = { dispatchWorkgroups: 0, dispatchWorkgroupsIndirect: 0 };

function removeDispatchHooks() {
  for (const entry of originalMethods) entry.prototype[entry.name] = entry.original;
  originalMethods = [];
}

function installDispatchHooks() {
  removeDispatchHooks();
  dispatchCounts = { dispatchWorkgroups: 0, dispatchWorkgroupsIndirect: 0 };
  const candidates = [
    ['GPUComputePassEncoder', 'dispatchWorkgroups'],
    ['GPUComputePassEncoder', 'dispatchWorkgroupsIndirect'],
  ];
  for (const [className, name] of candidates) {
    const prototype = globalThis[className]?.prototype;
    const original = prototype?.[name];
    if (typeof original !== 'function') continue;
    prototype[name] = function (...args) {
      dispatchCounts[name] += 1;
      return original.apply(this, args);
    };
    originalMethods.push({ prototype, name, original });
  }
}

self.onmessage = event => {
  const message = event.data;
  if (message?.type === 'bench-control') {
    if (message.action === 'start') {
      installDispatchHooks();
      self.postMessage({ type: 'bench-dispatch', id: message.id, value: { started: true } });
    } else if (message.action === 'stop') {
      removeDispatchHooks();
      self.postMessage({ type: 'bench-dispatch', id: message.id, value: { ...dispatchCounts } });
    } else {
      self.postMessage({ type: 'bench-dispatch', id: message.id, error: 'Unknown benchmark hook action' });
    }
    return;
  }
  return phononHandler(event);
};
