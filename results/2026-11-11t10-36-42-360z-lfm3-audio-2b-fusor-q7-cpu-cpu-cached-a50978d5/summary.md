# 2026-11-11t10-36-42-360z-lfm3-audio-2b-fusor-q7-cpu-cpu-cached-a50978d5

MacBook Pro / Apple M1 Pro 8-core / 16 GiB / arm64 · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| lfm3-audio-2b-fusor-q7-cpu | cpu | measured | 541.01 s | 541.01–541.01 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| lfm3-audio-2b-fusor-q7-cpu | cpu | First completed source chunk | 7422.920 | ms | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | First PCM block | 589.395 | ms | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Generated audio | 1361.600 | s | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Generation / audio duration | 0.397 | ratio | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Model initialization | 3411.809 | ms | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Complete controller trial including setup/export | 548499.031 | ms | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Transferred HTTP body data | 38404 | bytes | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Whole-call Chrome process-tree peak RSS | 4374773760 | bytes | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Per-trial mean generation Chrome process-tree RSS | 3609991727 | bytes | 1 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | In-window Chrome RSS observations | 1078.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| lfm3-audio-2b-fusor-q7-cpu | Unknown | Unknown | 18 | American English female (prompted style; no fixed speaker ID) |

Pinned Fusor q7 browser bundle; 6 CPU threads; speech generation only. 18 spoken languages; English has US and UK locales. Male/female prompt controls do not establish a fixed-voice count. Only American English female is tested. Six-thread Fusor WASM q7 configuration; different weights/runtime/sampling from the official WebGPU GGUF configuration. Sources: [1](https://huggingface.co/LiquidAI/LFM3-Audio-2B), [2](https://www.liquid.ai/blog/lfm3), [3](https://huggingface.co/fusorlabs/lfm3-audio-2b-web/blob/e273326dda2bb26870549ed7b39324ae086e5fe7/README.md), [4](https://huggingface.co/fusorlabs/lfm3-audio-2b-web/blob/e273326dda2bb26870549ed7b39324ae086e5fe7/manifest.json).


![Generation chart](chart.svg)

- **lfm3-audio-2b-fusor-q7-cpu / cpu**: Explicit Fusor web-threaded-relaxed CPU runtime with 6 threads; separate untimed probe returned finite 24 kHz PCM. Probe excluded from timed synthesis.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

AC power verified before run. Sequential headed Chrome; user applications left open. Separate one-article cached RSS diagnostic after the completed five-run Audio CPU warm benchmark. Same clean source and six-thread Fusor q7 settings as its warm run. No other inference/test workload. Cold-load checks excluded. Omni loading failures are retained separately and are not Audio timing data.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
