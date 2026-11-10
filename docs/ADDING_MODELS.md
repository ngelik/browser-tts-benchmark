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
