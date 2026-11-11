// Benchmark wrapper; the pinned official runtime is fetched, never vendored.
import { observeComputeDispatches } from '../piper/webgpu.mjs';
let model, session, kind;
const SYSTEM = 'Perform TTS in American English using a female voice.';
const info = {
  voice: 'American English female (prompted style; no fixed voice identifier)',
  precision: 'GGUF Q4_K_M language backbone + Q8_0 mmproj',
  settings: {
    sampleRate: 24000, contextTokens: 4096, maxNewTokens: 2048,
    generationMode: 'audio', textDoSample: false,
    speechSampling: 'Official pinned depth-decoder defaults; high-level API does not expose a speech seed. Stochastic speech retained.',
    systemPrompt: SYSTEM,
    frontend: 'Official GGUF tokenizer/chat template; exact canonical text as user message; independent reset for every source span; no truncation.',
    runtime: 'LiquidAI LFM3-Omni-2B-WebGPU 9c2fb176f4c222da394e8037d3c0d0837f70b978',
    executionProviders: ['webgpu'],
    hostWork: 'CPU JavaScript tokenization, scheduling and PCM delivery; neural kernels use the official WebGPU runtime.',
    prefixSnapshots: false,
  },
};
const unsupported = reason => ({ ...info, status: 'unsupported', reason, backendEffective: 'none', capability: {gpuDispatchVerified: false, description: reason} });

async function generate(chunk, firstPcm) {
  if (!session || !chunk?.text?.trim()) throw new Error('Liquid speech requires an initialized session and nonempty source text.');
  await session.reset();
  const messages = [{role:'system', content:SYSTEM}, {role:'user', content:chunk.text}];
  const counts = session.count_tokens(messages);
  if (!Number.isInteger(counts.prompt_tokens) || counts.prompt_tokens + 2048 > 4096) throw new Error('Liquid source span exceeds the pinned context budget; truncation is forbidden.');
  const stream = session.generate(messages, {generation_mode:'audio', max_new_tokens:2048, do_sample:false});
  const parts = [];
  for await (const event of stream) {
    if (event.type !== 'audio') continue;
    const pcm = event.audio;
    if (!(pcm instanceof Float32Array) || !pcm.length || !pcm.every(Number.isFinite)) throw new Error('Liquid returned invalid PCM.');
    if (!parts.length) firstPcm?.();
    parts.push(pcm.slice());
  }
  const result = await stream.result;
  if (result.finish_reason !== 'stop') throw new Error('Liquid did not complete the source span: ' + result.finish_reason);
  if (!parts.length) throw new Error('Liquid completed without audio.');
  return {parts, sampleRate:24000, completedChunkId:chunk.id};
}
async function initialize(options) {
  kind = options.kind;
  if (!['audio','omni'].includes(kind)) throw new Error('Unknown Liquid model variant.');
  if (options.backend !== 'webgpu') return unsupported('This pinned official GGUF runtime requires WebGPU; the CPU configuration uses separate WASM weights.');
  if (!navigator.gpu) return unsupported('Chrome does not expose WebGPU.');
  const {Lfm3OmniForConditionalGeneration:Model} = await import('/liquid-gguf/runtime.mjs');
  const base = self.location.origin + '/liquid-gguf/' + kind + '/';
  const fetchLocal = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, self.location.href);
    if (url.origin !== self.location.origin) throw new Error('Liquid attempted a nonlocal fetch: ' + url.origin);
    return fetch(input, init);
  };
  const availability = await Model.checkAvailability(base+'model.gguf', {mmproj:base+'mmproj.gguf', fetch:fetchLocal});
  if (!availability.ok) return unsupported('Official runtime capability check: '+JSON.stringify(availability));
  model = await Model.from_pretrained(base+'model.gguf', {mmproj:base+'mmproj.gguf', fetch:fetchLocal, cache:false, prefixSnapshotStore:null, maxLength:4096});
  const device = model.deviceInfo();
  if (device.isFallbackAdapter) { await dispose(); return unsupported('The official runtime selected a software WebGPU adapter.'); }
  if (model.audio_sampling_rate !== 24000) throw new Error('Unexpected Liquid sample rate.');
  session = model.create_session();
  let dispatches = 0;
  if (options.probe) {
    const observer = observeComputeDispatches();
    try { await generate({id:'probe',text:options.probeText}); }
    finally { dispatches = observer.stop(); }
    if (!dispatches) {await dispose(); return unsupported('No GPU compute dispatches observed during actual speech synthesis.');}
  }
  return {...info, status:'measured', backendEffective:'webgpu', gpu:device.vendor+' '+device.architecture,
    capability:{gpuDispatchVerified:options.probe ? dispatches>0 : null,
      description:options.probe ? `Observed ${dispatches} WebGPU compute dispatches during untimed synthesis with finite CPU-readable PCM. Hooks removed before timing. CPU JavaScript handles tokenization and scheduling.` : 'Official WebGPU runtime; dispatch probe was not requested.'}};
}
async function dispose() {
  await session?.dispose(); session = null;
  await model?.dispose(); model = null;
}
self.onmessage = async ({data}) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'generate') value = await generate(data.chunk, () => self.postMessage({id:data.id,event:'first-pcm'}));
    else if (data.action === 'dispose') {await dispose(); value=null;}
    else throw new Error('Unknown Liquid action.');
    self.postMessage({id:data.id,value},value?.parts?.map(part=>part.buffer)??[]);
  } catch(error) {self.postMessage({id:data.id,error:String(error?.message??error)});}
};
