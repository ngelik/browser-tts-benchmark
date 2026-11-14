/** Headed-Chrome diagnostic for a small probe or the first canonical span; never a full benchmark. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {startServer} from '../lib/server.mjs';
import {findChrome} from '../lib/runner.mjs';
import {prepareAssets} from '../lib/assets.mjs';
import {getModel} from '../lib/catalog.mjs';
import {wavInfo} from './audio.mjs';

const [model, backend, slug, license, ...flags] = process.argv.slice(2);
let threads = 6;
let timeoutMs = 1_800_000;
let probeOnly = false;
for (const flag of flags) {
  if (flag === '--probe-only') probeOnly = true;
  else if (flag.startsWith('--threads=')) threads = Number(flag.slice('--threads='.length));
  else if (flag.startsWith('--timeout-ms=')) timeoutMs = Number(flag.slice('--timeout-ms='.length));
  else throw new Error('Unknown option: ' + flag);
}
if (!model || !['cpu','webgpu'].includes(backend) || !/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug ?? '') ||
    license !== '--accept-license' || !Number.isSafeInteger(threads) || threads < 1 || threads > 16 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1_800_000) {
  throw new Error('Usage: node tools/probe-first-span.mjs MODEL cpu|webgpu NEW-RUN-SLUG --accept-license [--threads=1..16] [--timeout-ms=1000..1800000] [--probe-only]');
}
const runsRoot = resolve('runs');
await mkdir(runsRoot,{recursive:true});
assert.equal(await realpath(runsRoot), runsRoot, 'runs/ must be a real directory');
const out = resolve(runsRoot, slug);
const config = getModel(model);
await prepareAssets(model,{mode:'verify',acceptLicense:true});
const startedAt = new Date().toISOString();
const source = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty = Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
const article = await readFile('fixtures/en-20000.txt','utf8');
const {chunks} = JSON.parse(await readFile('fixtures/en-20000.chunks.json','utf8'));
const chunk = {...chunks[0], text:article.slice(chunks[0].start, chunks[0].end)};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(article),'4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b');
assert.equal(sha(chunk.text), chunk.sha256);
await mkdir(out);
const profile = await mkdtemp(resolve(os.tmpdir(), 'tts-bench-first-span-'));
let server;
let context;
try {
  server = await startServer(process.cwd());
  context = await chromium.launchPersistentContext(profile,{executablePath:await findChrome(),headless:false,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--no-first-run','--no-default-browser-check','--disable-software-rasterizer']});
  const page = context.pages()[0] || await context.newPage();
  const external = [];
  page.on('console', message => {
    const line = message.text();
    if (line.startsWith('[audio.cpp/')) console.log(line);
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'blob:' || url.origin === new URL(server.url).origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  await page.goto(server.url);
  const evaluation = page.evaluate(async ({model,backend,chunk,threads,probeOnly}) => {
    const {diagnosticFactories:adapterFactories,encodeWavBase64} = await import('/web/bench.mjs');
    const {openDiagnosticAdapter} = await import('/web/audio-cpp-gguf/probe-lifecycle.mjs');
    if (!adapterFactories?.[model]) throw new Error('No diagnostic adapter factory for ' + model);
    const factory = options => adapterFactories[model](options);
    if (probeOnly) {
      const engine = await factory({threads,diagnosticLogs:true});
      try {
        const configuration = await engine.initialize({backend,probe:true,probeText:'A short browser speech check.',threads,diagnosticLogs:true});
        if (configuration.status !== 'measured') throw new Error(configuration.reason || configuration.status);
        if (backend === 'webgpu' && configuration.capability?.gpuDispatchVerified !== true) throw new Error('WebGPU dispatch proof missing');
        return {probeOnly:true,configuration};
      } finally {await engine.dispose();}
    }
    const opened = await openDiagnosticAdapter(factory,{backend,threads,diagnosticLogs:true});
    const engine = opened.engine;
    try {
      const runs = [];
      let raw;
      for (let pass = 0; pass < 2; pass++) {
        const began = performance.now();
        let firstPcmMs;
        const response = await engine.generateChunk(chunk,{onFirstPcm:()=>{firstPcmMs??=performance.now()-began;}});
        const generationMs = performance.now()-began;
        if (response.completedChunkId !== chunk.id || !response.parts.length || !Number.isFinite(firstPcmMs)) throw new Error('Incomplete source span');
        if (!response.parts.every(p=>p instanceof Float32Array && p.length && p.every(Number.isFinite))) throw new Error('Empty or nonfinite PCM');
        const samples = response.parts.reduce((size, p)=>size+p.length,0);
        raw = new Float32Array(samples);
        let offset=0;
        for (const part of response.parts) {raw.set(part,offset);offset+=part.length;}
        const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
        runs.push({generationMs,firstPcmMs,sampleRate:response.sampleRate,samples,pcmSha256:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')});
      }
      // The WAV encoder runs after both diagnostic calls have completed.
      return {configuration:opened.configuration,capabilityProbe:opened.capabilityProbe,runs,wavBase64:encodeWavBase64(raw,runs[1].sampleRate)};
    } finally {await engine.dispose();}
  },{model,backend,chunk,threads,probeOnly});
  let timeout;
  const output = await Promise.race([
    evaluation,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Diagnostic exceeded ' + timeoutMs + ' ms; disposable Chrome context will be closed.')), timeoutMs); }),
  ]).finally(() => clearTimeout(timeout));
  assert.deepEqual(external,[]);
  await prepareAssets(model,{mode:'verify',acceptLicense:true});
  const sourceAtEnd = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const dirtyAtEnd = Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
  assert.equal(sourceAtEnd, source, 'Git commit changed during diagnostic');
  if (probeOnly) {
    const record={startedAt,finishedAt:new Date().toISOString(),kind:'browser-runtime-capability-probe-v1',model,backend,threads,timeoutMs,modelRevision:config.modelRevision,source,dirty:dirty||dirtyAtEnd,chrome:context.browser().version(),arch:os.arch(),cpu:os.cpus()[0].model,cores:os.cpus().length,ramBytes:os.totalmem(),os:os.release(),externalRequests:0,configuration:output.configuration};
    await writeFile(resolve(out,'diagnostic.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(record,null,2));
  } else {
    const wav = Buffer.from(output.wavBase64,'base64');
    const trial = output.runs[1];
    const decoded = wavInfo(wav);
    assert.equal(decoded.samples, trial.samples);
    assert.equal(decoded.sampleRate, trial.sampleRate);
    const record={startedAt,finishedAt:new Date().toISOString(),kind:'single-span-warm-diagnostic-v1',model,backend,threads,timeoutMs,modelRevision:config.modelRevision,source,dirty:dirty||dirtyAtEnd,chrome:context.browser().version(),arch:os.arch(),cpu:os.cpus()[0].model,cores:os.cpus().length,ramBytes:os.totalmem(),os:os.release(),
      fixtureSha256:sha(article),chunkId:chunk.id,start:chunk.start,end:chunk.end,sourceSha256:chunk.sha256,externalRequests:0,configuration:output.configuration,capabilityProbe:output.capabilityProbe,warmup:output.runs[0],measured:trial,wav:{file:'output.wav',sha256:sha(wav),bytes:wav.length}};
    await writeFile(resolve(out,'output.wav'),wav,{flag:'wx'});
    await writeFile(resolve(out,'diagnostic.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(record,null,2));
  }
} finally {
  try {
    await context?.close();
  } finally {
    try { await server?.close(); }
    finally { await rm(profile, {recursive:true, force:true}); }
  }
}
