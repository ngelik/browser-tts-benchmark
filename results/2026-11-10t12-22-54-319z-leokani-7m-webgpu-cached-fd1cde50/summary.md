# 2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.39

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| leokani-7m | webgpu | measured | 58.98 s | 58.98–58.98 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| leokani-7m | webgpu | First completed source chunk | 782.125 | ms | 1 |
| leokani-7m | webgpu | First PCM block | 782.120 | ms | 1 |
| leokani-7m | webgpu | Generated audio | 1401.025 | s | 1 |
| leokani-7m | webgpu | Generation / audio duration | 0.042 | ratio | 1 |
| leokani-7m | webgpu | Model initialization | 1629.435 | ms | 1 |
| leokani-7m | webgpu | Complete controller trial including setup/export | 64746.111 | ms | 1 |
| leokani-7m | webgpu | Transferred HTTP body data | 38404 | bytes | 1 |
| leokani-7m | webgpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| leokani-7m | webgpu | Whole-call Chrome process-tree peak RSS | 2704965632 | bytes | 1 |
| leokani-7m | webgpu | Per-trial mean generation Chrome process-tree RSS | 2503378296 | bytes | 1 |
| leokani-7m | webgpu | In-window Chrome RSS observations | 117.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| leokani-7m | 1 | 1 | 1 (en) | default |

Pinned benchmark checkpoint. One female American English voice; no other voice is exposed by this checkpoint. Sources: [1](https://huggingface.co/milliwattlabs/leokani-tts-7M/raw/ba0beb24f7b124dc1eb297ffc28d01db892462bd/README.md).


![Generation chart](chart.svg)

- **leokani-7m / webgpu**: Observed 4568 compute dispatches in a separate utterance. WebGPU TTS with WASM fallback; CPU G2P and JavaScript iSTFT. Hooks removed before timing.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Dedicated one-tab Chrome RAM diagnostic; AC power; sequential run; normal user background apps remain; no thermal instrumentation; timings are resource diagnostics, not warm scores.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
