import {observeComputeDispatches, requestHardwareWebGpuAdapter} from '../piper/webgpu.mjs';
import {promptTokens, synthesize} from '../audio8/generation.mjs';

const modelRoot = '/models/audio8-realistic/';
const ortRoot = '/runtimes/onnxruntime-web/1.31.1/';
const sessions = {};
let ort, tokenizer;
const voice = 'Reference-free English synthesis';
const precision = 'INT4 slow/fast AR, FP16 codec';
async function dispose() {
  for (const [key, session] of Object.entries(sessions)) { await session.release(); delete sessions[key]; }
  tokenizer = null;
}
async function loadSession(file, providers) {
  const external = `${file}.onnx.data`;
  const res = await fetch(modelRoot + external);
  if (!res.ok) throw new Error(`Audio8 ${external}: HTTP ${res.status}`);
  return ort.InferenceSession.create(modelRoot + file + '.onnx', {
    executionProviders:providers, externalData:[{path:external, data:new Uint8Array(await res.arrayBuffer())}],
  });
}
async function initialize({backend, probe, probeText}) {
  const gpu = backend === 'webgpu', providers = gpu ? ['webgpu', 'wasm'] : ['wasm'];
  const settings = {executionProviders:providers, language:'en', sampleRate:44100, temperature:0.7, topP:0.9, topK:50,
    seed:42, wasmThreads:1, maxFrames:1024, voiceSelection:voice, sampling:'Seeded JS categorical draw with upstream top-p-before-temperature and ten-frame repetition resampling.',
    chunking:'One complete source span per reference-free prompt, one full decoder call after EOS.'};
  let adapter, description;
  if (gpu) {
    const hardware = await requestHardwareWebGpuAdapter(navigator.gpu);
    if (hardware.reason) return {status:'unsupported', reason:hardware.reason, backendEffective:'none', voice, precision, settings, capability:{gpuDispatchVerified:false, description:hardware.reason}};
    adapter = hardware.adapter; description = hardware.description;
  }
  const bundle = 'ort-wasm-simd-threaded' + (gpu ? '.asyncify' : '');
  ort = await import(ortRoot + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'));
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {mjs:ortRoot + bundle + '.mjs', wasm:ortRoot + bundle + '.wasm'};
  if (gpu) ort.env.webgpu.adapter = adapter;
  const transformers = await import('/runtimes/transformers/3.5.1/transformers.min.js');
  transformers.env.allowRemoteModels = false;
  const data = await (await fetch(modelRoot + 'tokenizer/tokenizer.json')).json();
  tokenizer = new transformers.PreTrainedTokenizer(data, {tokenizer_class:'PreTrainedTokenizer', unk_token:'<|endoftext|>'});
  sessions.slow = await loadSession('slow_ar_int4', providers);
  sessions.fast = await loadSession('fast_ar_int4', providers);
  sessions.decoder = await loadSession('codec_decoder_fp16', providers);
  let dispatchCount = 0;
  if (probe) {
    const observation = gpu ? observeComputeDispatches(self) : null;
    try { await synthesize(ort, sessions, promptTokens(tokenizer, probeText || 'Hello.')); }
    finally { dispatchCount = observation?.stop() ?? 0; }
    if (gpu && !dispatchCount) throw new Error('Audio8 compatibility probe observed zero GPU dispatches');
  }
  return {status:'measured', backendEffective:gpu ? 'webgpu+wasm' : 'cpu/wasm', voice, precision, settings,
    capability:{gpuDispatchVerified:dispatchCount>0, description:gpu ? `${dispatchCount} dispatches in separate capability probe; WebGPU with WASM fallback.` : 'Single-thread WebAssembly.'}, ...(gpu ? {gpu:description} : {})};
}
self.onmessage = async ({data}) => {
  try {
    let value;
    if (data.action === 'initialize') value = await initialize(data.options);
    else if (data.action === 'audit') value = promptTokens(tokenizer, data.text);
    else if (data.action === 'generate') {
      const {chunk} = data;
      if (!chunk.text || chunk.end - chunk.start !== chunk.text.length) throw new Error('Invalid Audio8 source span');
      const pcm = await synthesize(ort, sessions, promptTokens(tokenizer, chunk.text));
      self.postMessage({id:data.id, event:'first-pcm'});
      value = {parts:[pcm], sampleRate:44100, completedChunkId:chunk.id};
    } else if (data.action === 'dispose') {await dispose(); value = true;}
    else throw new Error('Unknown Audio8 worker request');
    self.postMessage({id:data.id, value}, value?.parts?.map(part=>part.buffer) ?? []);
  } catch(e) {
    if (data.action === 'initialize') await dispose();
    self.postMessage({id:data.id, error:String(e.message || e)});
  }
};
