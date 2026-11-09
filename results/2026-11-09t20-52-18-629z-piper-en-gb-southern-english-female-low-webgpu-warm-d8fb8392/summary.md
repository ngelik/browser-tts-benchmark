# 2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392

Apple M1 Pro / 16 GiB · Apple M1 Pro · Google Chrome 157.0.8103.39

Protocol: **browser-tts-warm-v1**, scenario **warm**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| piper-en-gb-southern-english-female-low | webgpu | measured | 12.07 s | 12.00–12.18 s | 5 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| piper-en-gb-southern-english-female-low | webgpu | First completed source chunk | 138.250 | ms | 5 |
| piper-en-gb-southern-english-female-low | webgpu | First PCM block | 138.245 | ms | 5 |
| piper-en-gb-southern-english-female-low | webgpu | Generated audio | 1052.880 | s | 5 |
| piper-en-gb-southern-english-female-low | webgpu | Generation / audio duration | 0.011 | ratio | 5 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| piper-en-gb-southern-english-female-low | 1 | 1 | 1 (en) | en_GB-southern_english_female-low (single speaker) |

Pinned benchmark checkpoint. One British English speaker in this checkpoint. The broader Piper voice repository contains other independent models and languages; they are not included in this count. Sources: [1](https://huggingface.co/rhasspy/piper-voices/resolve/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx.json), [2](https://huggingface.co/rhasspy/piper-voices/raw/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/MODEL_CARD).


![Generation chart](chart.svg)

- **piper-en-gb-southern-english-female-low / webgpu**: Observed 1585 WebGPU compute dispatches during a separate untimed synthesis. WebGPU + WASM operator fallback; eSpeak preprocessing runs on CPU. Hooks were removed before timed generation.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

AC power attached; CPU completed first, WebGPU second; load averages at start 3.51, 3.65, 3.38; coordinator confirms no competing inference; other background activity not instrumented; thermal telemetry unavailable (no CPU power status or temperature reading).

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
