function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function initializationSignature(configuration) {
  return stable({
    backendEffective: configuration.backendEffective,
    voice: configuration.voice,
    precision: configuration.precision,
    gpu: configuration.gpu ?? null,
    settings: configuration.settings,
  });
}

function measured(configuration, label) {
  if (!configuration || configuration.status !== 'measured') {
    throw new Error(configuration?.reason || `${label} did not initialize a measured backend.`);
  }
}

async function disposeAfterFailure(engine, originalError) {
  try {
    await engine?.dispose?.();
  } catch (disposeError) {
    if (!originalError) throw disposeError;
  }
}

// GPU dispatch instrumentation is installed in a disposable untimed instance.
// A new worker provides the clean instance used for the diagnostic's paired spans.
export async function openDiagnosticAdapter(factory, {
  backend,
  threads = 6,
  diagnosticLogs = false,
  probeText = 'A short browser speech check.',
} = {}) {
  if (typeof factory !== 'function') throw new TypeError('Adapter factory is required.');
  if (!['cpu', 'webgpu'].includes(backend)) throw new Error('Backend must be cpu or webgpu.');
  const factoryOptions = { threads, diagnosticLogs };
  let capabilityProbe = null;

  if (backend === 'webgpu') {
    const probeEngine = await factory(factoryOptions);
    let failure = null;
    try {
      capabilityProbe = await probeEngine.initialize({ backend, probe: true, probeText, threads, diagnosticLogs });
      measured(capabilityProbe, 'Untimed WebGPU dispatch probe');
      if (capabilityProbe.capability?.gpuDispatchVerified !== true) {
        throw new Error(capabilityProbe.reason || 'Untimed WebGPU probe did not observe a real compute dispatch.');
      }
    } catch (error) {
      failure = error;
    } finally {
      await disposeAfterFailure(probeEngine, failure);
    }
    if (failure) throw failure;
  }

  const engine = await factory(factoryOptions);
  try {
    const configuration = await engine.initialize({ backend, probe: false, threads, diagnosticLogs });
    measured(configuration, 'Untimed diagnostic initialization');
    if (capabilityProbe && JSON.stringify(initializationSignature(capabilityProbe)) !== JSON.stringify(initializationSignature(configuration))) {
      throw new Error('The clean diagnostic worker changed backend, voice, precision, GPU, or non-backend settings after dispatch proof.');
    }
    const verifiedConfiguration = capabilityProbe
      ? { ...configuration, capability: capabilityProbe.capability }
      : configuration;
    return { engine, configuration: verifiedConfiguration, capabilityProbe };
  } catch (error) {
    await disposeAfterFailure(engine, error);
    throw error;
  }
}
