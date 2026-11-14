// Audio8 Realistic reference-free synthesis, adapted from Edge0's Apache-2.0
// processing_arktts.py and onnx_runtime/arktts_runtime/runtime.py. See NOTICE.md.
export function promptTokens(tokenizer, text) {
  const cleaned = text.trim().split(/[\s\u001c-\u001f\u0085]+/u).join(' ');
  if (!cleaned) throw new Error('Audio8 received empty text');
  const parts = ['<|im_start|>system\n', 'convert the provided text to speech',
    '<|im_end|>\n', '<|im_start|>user\n', cleaned, '<|im_end|>\n', '<|im_start|>assistant\n<|voice|>'];
  return parts.flatMap(part => tokenizer.encode(part, {add_special_tokens:false}));
}

function seededRandom() {
  let state = 42;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

// Sort at the original temperature before applying top-p and top-k, as in Edge0's sampler.
function sample(logits, temperature, random) {
  const order = Array.from(logits.keys()).sort((a, b) => logits[b] - logits[a]);
  const max = logits[order[0]];
  if (!Number.isFinite(max)) throw new Error('Invalid Audio8 logits');
  let total = 0;
  for (const value of logits) total += Math.exp(value - max);
  let cumulative = 0, weightSum = 0;
  const weights = [];
  for (let rank = 0; rank < Math.min(50, order.length); rank++) {
    const diff = logits[order[rank]] - max;
    cumulative += Math.exp(diff) / total;
    if (rank && cumulative > 0.9) break;
    const weight = Math.exp(diff / temperature);
    weights.push(weight);
    weightSum += weight;
  }
  let threshold = random() * weightSum;
  for (let i = 0; i < weights.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) return order[i];
  }
  return order[weights.length - 1];
}

function caches(ort, layers, capacity) {
  const result = {};
  const dims = [1, 2, capacity, 64];
  for (let layer = 0; layer < layers; layer++) for (const kind of ['key', 'value']) {
    result[`cache_${kind}_${layer}`] = new ort.Tensor('float16', new Uint16Array(2 * capacity * 64), dims);
  }
  return result;
}
function release(tensors) { for (const t of Object.values(tensors)) t.dispose(); }
function applyDeltas(outputs, cache, firstPosition, count) {
  for (const [name, tensor] of Object.entries(cache)) {
    const delta = outputs[name.replace(/^cache_(key|value)_/, '$1_delta_')];
    const stride = tensor.dims[2] * 64;
    for (let h = 0; h < 2; h++) {
      tensor.data.set(delta.data.subarray(h * count * 64, (h + 1) * count * 64), h * stride + firstPosition * 64);
    }
  }
}
function int64(ort, values, dims) {
  return new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dims);
}
async function slowStep(ort, session, input, pos, cache) {
  const size = input.length / 11;
  const inputs = {codes:int64(ort, input, [1, 11, size]), input_pos:int64(ort, Array.from({length:size}, (_, i) => pos + i), [size])};
  let outputs;
  try {
    outputs = await session.run({...cache, ...inputs});
    applyDeltas(outputs, cache, pos, size);
    return {logits:outputs.logits.data.slice(-4097), hidden:new ort.Tensor('float16', outputs.slow_hidden.data.slice(-896), [1, 1, 896])};
  } finally { release(inputs); if (outputs) release(outputs); }
}
async function fastStep(ort, session, hidden, token, pos, cache) {
  const inputs = {token_id:int64(ort, [token], [1, 1]), use_slow_hidden:new ort.Tensor('bool', Uint8Array.of(pos === 0), [1]), input_pos:int64(ort, [pos], [1])};
  let outputs;
  try {
    outputs = await session.run({...cache, ...inputs, slow_hidden:hidden});
    applyDeltas(outputs, cache, pos, 1);
    return outputs.logits.data.slice(-4096);
  } finally { release(inputs); if (outputs) release(outputs); }
}

export async function synthesize(ort, sessions, tokens) {
  const size = tokens.length, maxFrames = Math.min(1024, 2048 - size);
  if (maxFrames < 1) throw new Error('Audio8 prompt exceeds the context limit');
  const slowCache = caches(ort, 24, 2048), fastCache = caches(ort, 4, 10);
  const input = new Int32Array(size * 11);
  input.set(tokens);
  const frames = [], recent = [], random = seededRandom();
  let state, ended = false;
  try {
    state = await slowStep(ort, sessions.slow, input, 0, slowCache);
    for (let i = 0; i < maxFrames; i++) {
      let semantic = sample(state.logits, 0.7, random);
      const alternative = sample(state.logits, 1, random);
      if (recent.includes(semantic) && semantic !== 4096) semantic = alternative;
      if (semantic === 4096) { ended = true; break; }
      recent.push(semantic);
      if (recent.length > 10) recent.shift();
      for (const t of Object.values(fastCache)) t.data.fill(0);
      await fastStep(ort, sessions.fast, state.hidden, 0, 0, fastCache);
      const frame = [semantic];
      for (let j = 1; j < 10; j++) frame.push(sample(await fastStep(ort, sessions.fast, state.hidden, frame[j - 1], j, fastCache), 0.7, random));
      frames.push(frame);
      state.hidden.dispose();
      state = null;
      if (i + 1 < maxFrames) state = await slowStep(ort, sessions.slow, [151678 + semantic, ...frame], size + i, slowCache);
    }
  } finally { state?.hidden.dispose(); release(slowCache); release(fastCache); }
  if (!ended) throw new Error(`Audio8 reached ${maxFrames} codec frames without EOS`);
  if (!frames.length) throw new Error('Audio8 produced zero codec frames');
  const codes = new BigInt64Array(10 * frames.length);
  for (let i = 0; i < frames.length; i++) for (let j = 0; j < 10; j++) codes[j * frames.length + i] = BigInt(frames[i][j]);
  const tensor = new ort.Tensor('int64', codes, [1, 10, frames.length]);
  let decoded;
  try {
    decoded = await sessions.decoder.run({codes:tensor});
    const pcm = Float32Array.from(decoded.audio.data);
    if (!pcm.length || !pcm.every(Number.isFinite)) throw new Error('Audio8 returned empty or nonfinite PCM');
    return pcm;
  } finally { tensor.dispose(); if (decoded) release(decoded); }
}
