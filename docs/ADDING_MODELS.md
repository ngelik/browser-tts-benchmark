# Adding a model

Add a new model in its own code pull request before submitting ranked results.
Keep historical model IDs/configurations stable; a changed frontend, pronunciation
policy, precision or inference algorithm is a new disclosed configuration.

1. Record model/runtime/voice licenses and authoritative sources in
   `docs/LICENSING.md`. Do not copy unclear-license upstream code into this MIT
   repository. It can be fetched to the local ignored cache when permitted.
2. Add an `assets.lock.json` model entry with immutable revisions where available,
   exact SHA-256/byte counts, relative staging targets, runtime package/version,
   backend declarations and terms acknowledgment requirements. Hash-pin mutable
   upstream URLs too: if their content changes, fail instead of silently updating.
3. Pin npm runtime dependencies in `package.json` and `package-lock.json`. Models
   are fetched explicitly; package install must not silently download weights.
4. Implement a browser adapter and register its factory in `web/bench.mjs`.
   Use a worker for blocking inference. All inference assets must resolve to the
   local origin. Text normalization and synthesis must run inside Chrome.
5. Add fixture/asset/adapter tests for actual risks, then run Chrome smoke tests
   for each supported backend and explicit incompatibility checks for others.
6. From a clean committed checkout, run the canonical full workload. Inspect
   PCM/audio and result evidence before submitting the result bundle.

## Browser adapter contract

The factory returns an object with these asynchronous methods:

```js
initialize({ backend, cache, probe, probeText })
generateChunk({ id, start, end, text, sha256 }, { onFirstPcm } = {})
dispose()
```

Initialization returns `backendEffective`, `voice`, `precision`, `settings`,
`capability: { gpuDispatchVerified, description }`, and optional GPU description.
An unavailable backend returns `status: "unsupported"` with a concrete `reason`.
Unexpected failures must throw rather than fabricate an incompatibility result.

A successful chunk returns `{ parts: Float32Array[], sampleRate,
completedChunkId }`. Resolve only once all requested audio is CPU-readable. Keep
source order and chunk identity; do not skip difficult words or source spans.
Call `onFirstPcm` when the first nonempty PCM block actually becomes available;
a dispatch submission or completed source chunk is a different boundary. The
harness validates finite PCM, coverage and sample rate after synthesis timing,
then joins, hashes and optionally encodes WAV outside the timer.

Dispose workers, sessions and GPU resources. The controller exercises a model
switch separately. Avoid model caches outside the supplied browser profile; a
cold profile must genuinely start without browser-cached model assets.

## Backend evidence

A `navigator.gpu` check or provider preference is insufficient. During `probe`,
perform a separate short synthesis and observe real compute dispatch from the
actual inference worker/device. Remove hooks before scored generation. Reject
software fallback adapters and reject a pure CPU path labeled GPU. Record CPU
preprocessing and allowed mixed WASM operators in settings/capability text.

The controller uses a separate profile initialization for capability probing,
then starts a fresh, uninstrumented engine for timing. Probe evidence and timing
configuration must refer to the same pinned implementation and assets. GPU-only
execution is not implied by the presence of dispatches. Do not report zero seconds for unsupported operators.

## Review evidence

Attach commands, machine/Chrome metadata, source commit, dependency/asset hashes,
voice/seed/precision settings, full warm-up and repetition receipts, failures,
output sample counts and audio digest. Compare only compatible protocols on the
same machine. A new adapter's speed says nothing about intelligibility until its
speech is reviewed. Contributor CI checks structure and arithmetic, not the
truthfulness of local hardware measurements.

## Piper en-GB trial adapter

The selected `piper-en-gb-southern-english-female-low` adapter uses the official
`rhasspy/piper-samples` frontend at the asset lock's pinned commit, fetched into
the ignored local asset cache. The pinned model JSON omits `phoneme_type`, while
the official frontend initializes eSpeak only when that field equals `espeak`.
The local response wrapper supplies `phoneme_type: "espeak"` for this legacy
config shape without changing the hash-pinned config bytes. Other explicit
phoneme types fail validation. The upstream frontend silently skips unmapped IPA
symbols, so the adapter wraps `phoneme_id_map` with a strict membership check that
throws on an unknown symbol. The adapter explicitly requests one-thread WASM,
passes the pinned config's length/noise scales to the raw-Float32 API, copies
CPU-readable PCM, and disposes captured tensors and the ONNX session. The GPU path must independently demonstrate compute dispatch.
The upstream eSpeak Emscripten factory also installs a worker-level `onmessage`
handler whenever it sees `WorkerGlobalScope`. The adapter keeps the real browser
worker environment, saves the benchmark RPC handler before the official
`setVoice` initialization, and restores that handler in `finally` before
receiving another benchmark request. The eSpeak `ready` message is ignored by the
RPC bridge because it has no request ID.

## Supertonic 3 adapter

The pinned official MIT browser helper supplies normalization, duration prediction, text encoding, eight-step latent denoising and waveform decoding. The benchmark selects M3 (Robert), English and effective speed 1.05, matching the linked Space's UI defaults (8 steps, speed 1.0 converted to 1.05). Only the ORT execution provider differs between CPU/WASM and WebGPU. The official helper splits paragraphs inside source spans: this fixture has 93 benchmark spans but 111 internal utterances, with 18 internal 0.3-second gaps. This behavior and the official final-duration trim are preserved for both backends. See the adapter source/change notice for lifecycle integration. All four FP32 ONNX graphs and M3 voice style match the linked Space's asset object hashes. The public catalog includes ten preset voices and 31 languages; this benchmark exercises one voice in English.

The sample-code repository was archived upstream; its pinned source remains available under MIT. Model revision and source revision are recorded separately. The model keeps its OpenRAIL-M terms. Smoke checks and genuine GPU dispatch are required before scored measurements; published scores do not inherit upstream speed claims.

Pinned demo control evidence: [default controls](https://huggingface.co/spaces/Supertone/supertonic-3/blob/4402acca094e2ff2b3dff446e0bf915f3fccc462/index.html) and [voice/speed mapping](https://huggingface.co/spaces/Supertone/supertonic-3/blob/4402acca094e2ff2b3dff446e0bf915f3fccc462/script.js). The benchmark retains the official helper's stochastic latent sampling; it does not claim bit-identical outputs across runs.

## Kokoro 82M, Kitten Nano 0.8 and MMS English

The 2026-11-10 discovery cohort is selected before performance measurement; see
[selection evidence](discovery/2026-11-10-selection.json). Its FP32 configurations
keep precision identical between CPU and GPU. These are configurations of the
models, not claims that FP32 is their smallest available download.

Kokoro uses the official `kokoro-js@1.2.1` readable source at its npm gitHead,
with Transformers.js 3.5.1. Local imports/voice paths and tensor cleanup are the
integration changes. Canonical whitespace is collapsed. Syllabic l/n/m from
browser eSpeak are explicitly expanded to schwa + consonant because Kokoro's
vocabulary lacks the combining syllabic mark. All other unknown phonemes fail;
inputs over 512 tokens fail instead of truncating. The canonical article's
maximum is 302 tokens after this normalization. The stream splitter is unused.
See [source/change notice](../web/kokoro/NOTICE.md).

Kitten has no verified official browser runtime for the selected 0.8 checkpoint.
The adapter ports the official ONNX call contract, uses browser eSpeak en-us,
reads the pinned uncompressed NumPy voice archive, selects Bella's style by
source text length and applies the official 0.8 speed prior and 5,000-sample tail
trim. It uses the official `clean_text=false` option; eSpeak handles original
numeric text. Unknown symbols fail instead of the Python helper's silent skips.
The article's maximum is 305 tokens. See [port notice](../web/kitten/NOTICE.md).

MMS uses the official Transformers.js VitsTokenizer and Hugging Face
maintainer's pinned Xenova export. Its VitsModel wrapper is replaced with a direct
ORT 1.23.2 call for both backends: the older bundled ORT failed its WebGPU
GatherND integer operator, while 1.23.2 passed actual browser synthesis. Tensor
names, graph, precision and tokenizer are unchanged. Its English vocabulary omits some digits;
the benchmark spells numeric values, times, percentages and dollar amounts before
standard tokenization. Every alphabetic article word is preserved by this step.
This is a disclosed frontend configuration, not a changed fixture. All 93 spans
pass browser tokenization with no unknown tokens; maximum length is 563, below
4,096. The exported inference graph is smaller than the training checkpoint.

All inference stays in dedicated Chrome workers. Each GPU path must demonstrate
actual dispatch in a separate untimed utterance and return CPU-readable PCM;
CPU preprocessing and runtime operator fallback are disclosed. Smoke and frontend
audits do not substitute for full scored article runs or listening evaluation.

## Sano Amy 1.46M

The official `sanotts-web@0.3.0` package performs G2P, duration prediction and
waveform generation in WebAssembly. Its browser helper expects script elements;
a narrow classic-worker bridge accepts only the two pinned, same-origin glue
scripts and restores the worker RPC handler after Emscripten initialization.
Explicit local `assetBase` and `voiceBase` disable upstream fallback downloads.
The selected Amy browser bundle is FP32 (5.82 MB core weights), even though the
family also advertises smaller FP16/quantized files. It uses en-us, 22,050 Hz,
and the pinned length scale 1.08. The 120-second per-span output capacity is
checked; the native runtime errors on overflow rather than truncating. The
worker rejects a G2P result at its 1,024-ID capacity. Worker termination releases
the official runtime's allocations because its wrapper has no dispose method.
Sano's official browser runtime has no WebGPU provider, reported as unsupported.

Reproduce the full text audit after fetching Kokoro, Kitten, MMS and Inflect assets:

```sh
node tools/check-text-frontends.mjs
```

This opens disposable headed Chrome, checks all 93 spans without neural
generation, rejects unknown/truncated text and external requests, and prints
maximum token lengths. It is an installation check, not a benchmark score.

## Inflect Micro v2

The author-packaged FP32 ONNX graphs use a duration stage followed by a waveform
decoder. The export's `SOURCE.json` identifies Robert Bak's conversion and base
weight SHA-256 `3eede065c9ccfa88ade0a5a9a5c23de34afcbbb32213e59aad44d5cf100fdee8`,
which also matches the selected current base repository's model.pth. The
converter's community browser implementation was reviewed as a cross-check;
this adapter ports the author's Python ONNX contract into the existing harness.
It retains the 280-character internal splitting, eSpeak punctuation/stress,
exact vocabulary/blank insertion, speed 1, variation 0.667, five-millisecond
edge fades and internal punctuation pauses. Seed zero resets per canonical
source span; internal pieces increment it. Mulberry32 + Box-Muller supplies
standard-normal noise and is explicitly not NumPy PCG64 bitwise parity.

A 97-case normalization check (all 93 source spans plus four edge cases) matches
upstream in 96 cases. The one intentional correction retains the word boundary
in `7:10 each`; the upstream regex joins `seven teneach`. All 93 spans pass real
browser phonemization without unknown symbols or truncation; maximum padded
input is 477 tokens. Duration and decoder outputs are CPU-readable, including
WebGPU intermediate readback. See [source/change notice](../web/inflect/NOTICE.md).
