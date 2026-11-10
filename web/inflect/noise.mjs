// The model's Python path samples standard-normal latent noise with NumPy.
// This browser port uses deterministic Mulberry32 + Box-Muller instead; see
// NOTICE.md for the seed policy and reproducibility limits.
const MAX_NOISE_VALUES = 50_000_000;

function createUniform(seed) {
  let state = seed >>> 0;
  return () => {
    // Mulberry32 provides a small deterministic browser PRNG. It is not
    // NumPy's PCG64 generator; only the standard-normal distribution matches.
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededNormalNoise(dims, seed) {
  if (!Array.isArray(dims) || !dims.length || dims.some(dim => !Number.isSafeInteger(dim) || dim <= 0)) {
    throw new Error('Inflect duration graph returned invalid latent dimensions.');
  }
  const length = dims.reduce((product, dim) => product * dim, 1);
  if (!Number.isSafeInteger(length) || length > MAX_NOISE_VALUES) throw new Error('Inflect latent noise tensor is too large.');

  const uniform = createUniform(seed);
  const noise = new Float32Array(length);
  for (let index = 0; index < length; index += 2) {
    const first = Math.max(uniform(), Number.EPSILON);
    const second = uniform();
    const radius = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;
    noise[index] = radius * Math.cos(angle);
    if (index + 1 < length) noise[index + 1] = radius * Math.sin(angle);
  }
  return noise;
}
