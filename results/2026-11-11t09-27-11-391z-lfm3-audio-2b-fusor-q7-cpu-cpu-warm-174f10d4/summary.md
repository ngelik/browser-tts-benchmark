# 2026-11-11t09-27-11-391z-lfm3-audio-2b-fusor-q7-cpu-cpu-warm-174f10d4

MacBook Pro / Apple M1 Pro 8-core / 16 GiB / arm64 · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-warm-v1**, scenario **warm**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| lfm3-audio-2b-fusor-q7-cpu | cpu | measured | 526.05 s | 523.81–526.68 s | 5 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| lfm3-audio-2b-fusor-q7-cpu | cpu | First completed source chunk | 6403.225 | ms | 5 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | First PCM block | 373.840 | ms | 5 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Generated audio | 1361.600 | s | 5 |
| lfm3-audio-2b-fusor-q7-cpu | cpu | Generation / audio duration | 0.386 | ratio | 5 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| lfm3-audio-2b-fusor-q7-cpu | Unknown | Unknown | 18 | American English female (prompted style; no fixed speaker ID) |

Pinned Fusor q7 browser bundle; 6 CPU threads; speech generation only. 18 spoken languages; English has US and UK locales. Male/female prompt controls do not establish a fixed-voice count. Only American English female is tested. Six-thread Fusor WASM q7 configuration; different weights/runtime/sampling from the official WebGPU GGUF configuration. Sources: [1](https://huggingface.co/LiquidAI/LFM3-Audio-2B), [2](https://www.liquid.ai/blog/lfm3), [3](https://huggingface.co/fusorlabs/lfm3-audio-2b-web/blob/e273326dda2bb26870549ed7b39324ae086e5fe7/README.md), [4](https://huggingface.co/fusorlabs/lfm3-audio-2b-web/blob/e273326dda2bb26870549ed7b39324ae086e5fe7/manifest.json).


![Generation chart](chart.svg)

- **lfm3-audio-2b-fusor-q7-cpu / cpu**: Explicit Fusor web-threaded-relaxed CPU runtime with 6 threads; separate untimed probe returned finite 24 kHz PCM. Probe excluded from timed synthesis.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

AC power verified before run. Sequential headed Chrome; user applications left open. Audio then Omni warm runs, followed by separate one-article cached RSS diagnostics. Six-thread Fusor q7 CPU configuration; differs from official GPU GGUF weights/runtime/sampling, so no controlled CPU/GPU speedup. Cold-load checks excluded.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
