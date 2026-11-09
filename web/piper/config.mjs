export function validatePiperConfig(config) {
  if (!config || (config.phoneme_type !== undefined && config.phoneme_type !== 'espeak')) {
    throw new Error('Pinned Piper config must use eSpeak phonemes; the benchmark wrapper normalizes an omitted phoneme_type to eSpeak.');
  }
  if (config.espeak?.voice !== 'en-gb-x-rp') throw new Error('Pinned Piper config has an unexpected eSpeak voice.');
  if (config.num_speakers !== 1) throw new Error('Pinned Piper checkpoint must remain single-speaker.');
  if (config.audio?.sample_rate !== 16000) throw new Error('Pinned Piper checkpoint must output 16 kHz audio.');
  const map = config.phoneme_id_map;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Piper config has no phoneme ID map.');
  for (const token of ['^', '_', '$']) {
    const ids = map[token];
    if (!Array.isArray(ids) || ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] < 0) {
      throw new Error('Piper config has an invalid special phoneme mapping for ' + JSON.stringify(token) + '.');
    }
  }
  for (const [symbol, ids] of Object.entries(map)) {
    if (!Array.isArray(ids) || ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] < 0) {
      throw new Error('Piper config has an unsupported phoneme ID entry for ' + JSON.stringify(symbol) + '.');
    }
  }
  return config;
}

export function normalizePiperConfig(config) {
  const valid = validatePiperConfig(config);
  return valid.phoneme_type === undefined ? { ...valid, phoneme_type: 'espeak' } : valid;
}

export function strictPhonemeIdMap(map) {
  return new Proxy(map, {
    has(target, key) {
      if (typeof key === 'string' && !Object.hasOwn(target, key)) {
        throw new Error('Piper eSpeak emitted an unmapped phoneme: ' + JSON.stringify(key));
      }
      return Reflect.has(target, key);
    },
  });
}
