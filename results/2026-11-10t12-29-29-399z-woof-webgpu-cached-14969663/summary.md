# 2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.39

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| woof | webgpu | measured | 183.35 s | 183.35–183.35 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| woof | webgpu | First completed source chunk | 2271.035 | ms | 1 |
| woof | webgpu | First PCM block | 219.880 | ms | 1 |
| woof | webgpu | Generated audio | 1253.440 | s | 1 |
| woof | webgpu | Generation / audio duration | 0.146 | ratio | 1 |
| woof | webgpu | Model initialization | 395.257 | ms | 1 |
| woof | webgpu | Complete controller trial including setup/export | 187361.471 | ms | 1 |
| woof | webgpu | Transferred HTTP body data | 38404 | bytes | 1 |
| woof | webgpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| woof | webgpu | Whole-call Chrome process-tree peak RSS | 1853734912 | bytes | 1 |
| woof | webgpu | Per-trial mean generation Chrome process-tree RSS | 1043963253 | bytes | 1 |
| woof | webgpu | In-window Chrome RSS observations | 365.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| woof | 1 | 1 | 1 (en) | Isla |

Pinned benchmark checkpoint. The pinned browser one-voice case uses Isla. The separate two-voice Juno/Mira release is not this measured case. Sources: [1](https://huggingface.co/ConwayResearch/Underdog-Woof/raw/be702960539777fc3f698e54335276a8391b00f9/README.md), [2](https://github.com/ngelik/browser-tts-benchmark/blob/8dae4a37e61e662037fd73a58c7254e1dac9dd89/web/workers/woof.mjs).


![Generation chart](chart.svg)

- **woof / webgpu**: Observed 40170 WebGPU compute dispatches during untimed synthesis; instrumentation removed before timing.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Dedicated one-tab Chrome RAM diagnostic; AC power; sequential run; normal user background apps remain; no thermal instrumentation; timings are resource diagnostics, not warm scores.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
