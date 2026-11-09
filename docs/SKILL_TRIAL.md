# Fresh-clone agent skill trial

An executor loaded the repository skill, cloned the public repository into an
isolated checkout, and onboarded a new Hugging Face model. A separate coordinator
reviewed the code, reproduced the selection, and verified the generated WAV.
The initial clone used the skill published by PR #2; it incorporated the runtime
pin/import fixes from PR #6 before adding the new model.

## Reproduce the selection

The [unaltered selection receipt](skill-trial-selection.json) records the frozen
three-candidate English Piper low pool, exclusions, random seed, immutable source
revision and selected index. Each candidate's model file is under 64 MB. This is
random sampling from that disclosed pool, not from all Hugging Face models.
No redraw was made after integration failures.

```sh
node skills/browser-tts-benchmark/scripts/select-model.mjs --verify docs/skill-trial-selection.json
```

Selected: **piper-en-gb-southern-english-female-low**, a 63,104,526-byte FP32 ONNX
checkpoint. Model, config, official frontend, eSpeak and runtime files are pinned
by revision, size and SHA-256 in `assets.lock.json`. See [licensing](LICENSING.md)
and [adapter details](ADDING_MODELS.md). Model weights, upstream browser files and
WAV recordings are not redistributed. The cards do not establish separate model
or output licensing; this trial is not commercial-use clearance.

## Issues found and resolved

| Observed issue | Resolution and evidence |
|---|---|
| Shared npm cache contained root-owned entries | Installation succeeded using an isolated cache. Skill now documents `npm ci --cache .cache/npm`; no global ownership changes. |
| Host sandbox blocked Chrome Crashpad startup or loopback binding | Retried in the already authorized execution context, keeping Chrome's own sandbox and a disposable profile. This was an environment failure, not a model score. |
| Setup failure could leave progress looking active | Runner now persists terminal `error` status plus a local setup diagnostic. Evaluator verified this using a deliberately failing browser executable. |
| Legacy voice JSON omits `phoneme_type` | Local parsed-response wrapper supplies `espeak`; original hash-pinned bytes stay unchanged. Explicit other types fail. |
| eSpeak replaces the enclosing worker message handler | Restore the benchmark RPC handler after official `setVoice` initialization. Masking worker detection was tested and rejected because it selected Emscripten's shell loader. |
| Official frontend silently skips unknown phonemes | Strict map wrapper throws instead; all 93 source chunks passed. |
| Long model names overlap the SVG plot | Truncate only long visible labels and preserve their full accessible title; short historical chart output stays unchanged. |

## Correctness evidence before scoring

Google Chrome 157.0.8103.39, headed; Apple M1 Pro, 8 logical cores, 16 GiB RAM.
Synthesis used the official Piper browser frontend and explicit one-thread
ONNX Runtime Web WASM. No server-side speech service was involved.

| Check | Observed result |
|---|---|
| Chrome smoke | 3 chunks; finite, nonempty PCM; local WAV hash verified |
| Full offline article | Exactly 20,000 English characters across 93 chunks |
| Source coverage | All 93 chunks completed; finite, nonempty PCM |
| Offline HTTP body transfer | 0 bytes after the offline toggle; uncached fetch failed |
| Saved full WAV | Mono PCM16, 16,000 Hz; 16,872,704 samples; 33,745,452 bytes |
| WAV SHA-256 | `65234144da739734a1bb34df13ce48fc83e047ebef1ef42e6b211053bfd95e45` |
| Independent evaluator checks | Header, byte count, sample count and digest reconcile; nonzero signal, no saturated PCM16 samples |

Local diagnostic IDs are
`2026-11-09t07-19-58-732z-piper-en-gb-southern-english-female-low-cpu-warm-075d3499`
and
`2026-11-09t07-21-05-381z-piper-en-gb-southern-english-female-low-cpu-offline-6f8344f8`.
These ran during development with a dirty source tree and are **not published
performance scores**. No listening-based quality review was performed.

## Run the scored benchmark

From the committed public source, with a clean checkout:

```sh
npm ci --cache .cache/npm
npm run assets -- fetch --model piper-en-gb-southern-english-female-low --accept-license
npm run assets -- verify --model piper-en-gb-southern-english-female-low --accept-license
npm run bench -- run --model piper-en-gb-southern-english-female-low --backend cpu --scenario warm --accept-license --machine "Actual hardware / RAM" --note "Actual power and background conditions"
```

This generates one excluded full warm-up and five scored full articles. Keep
source files unchanged while running. Follow the skill's report, submission and
PR steps; only validated metadata, table, chart and checksums belong in Git.
At the time of this CPU-only trial, GPU execution remained unvalidated. The model graph has no validated
seed input, so output duration and waveform can vary across repetitions.

## Completed scored result

The exact implementation commit
[`e1efaa2c3220f4a19c6c730a2037395854531428`](https://github.com/ngelik/browser-tts-benchmark/commit/e1efaa2c3220f4a19c6c730a2037395854531428)
was published before scoring and merged through [PR #7](https://github.com/ngelik/browser-tts-benchmark/pull/7).
The checkout remained clean throughout one full warm-up and five scored articles.
All six articles passed 93-chunk, finite/nonempty PCM validation.

| Metric | Measured result |
|---|---:|
| Median full-article generation | 167.568 s |
| Observed generation range | 167.194–167.972 s |
| Scored repetitions | 5, plus 1 excluded full warm-up |
| Median first PCM | 1.783 s |
| Median output duration | 1,054.352 s |
| Median generation / audio duration | 0.159060 |

[Generated report, table and chart](../results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/summary.md)
are derived from the submitted receipt. Source fingerprint:
`22cba72c376cc714ebe9b82175d87b70b941d1dce616d279832048d0a6501b8e`.
The final WAV was independently reconciled: PCM16 mono, 16 kHz,
16,846,592 samples, 33,693,228 bytes, SHA-256
`39e2c3a873e4001dfaaaa6fb9291a9321f2c5ce077eb7db79000f756631a0c3a`.
It remains local and is not part of the public bundle.

Conditions: AC power attached; pre-run load averages 1.40 / 1.48 / 1.60;
no concurrent benchmark or test suite. `pmset` reported no thermal/performance
warning, but temperatures and thermal state were not instrumented. The host
blocked `ps`/`top` access, so background process inventory was unavailable.
No warm-trial errors, retries or discarded repetitions occurred. No memory or
network-throttle metrics were requested for this warm execution trial.

These receipts define the scored result; development diagnostics do not.
Do not pool it with historical protocols or a different source fingerprint.
