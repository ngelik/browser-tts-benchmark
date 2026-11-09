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
| Asset test required WebGL files for every ONNX model | Require the bundle only for ONNX models declaring WebGL probes. Piper stages its CPU runtime independently. |
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
GPU/WebGL remain unvalidated for this adapter. The model graph has no validated
seed input, so output duration and waveform can vary across repetitions.

The scored result is published separately after the exact implementation commit
is public. Its receipts, rather than the diagnostic timings above, define the
benchmark result. Do not pool it with historical protocols or runs from a
different source fingerprint.
