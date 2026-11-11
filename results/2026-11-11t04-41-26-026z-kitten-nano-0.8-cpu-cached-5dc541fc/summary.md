# 2026-11-11t04-41-26-026z-kitten-nano-0.8-cpu-cached-5dc541fc

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| kitten-nano-0.8 | cpu | measured | 758.51 s | 758.51–758.51 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| kitten-nano-0.8 | cpu | First completed source chunk | 9043.965 | ms | 1 |
| kitten-nano-0.8 | cpu | First PCM block | 9043.955 | ms | 1 |
| kitten-nano-0.8 | cpu | Generated audio | 2007.075 | s | 1 |
| kitten-nano-0.8 | cpu | Generation / audio duration | 0.378 | ratio | 1 |
| kitten-nano-0.8 | cpu | Model initialization | 617.877 | ms | 1 |
| kitten-nano-0.8 | cpu | Complete controller trial including setup/export | 764347.331 | ms | 1 |
| kitten-nano-0.8 | cpu | Transferred HTTP body data | 38404 | bytes | 1 |
| kitten-nano-0.8 | cpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| kitten-nano-0.8 | cpu | Whole-call Chrome process-tree peak RSS | 2375565312 | bytes | 1 |
| kitten-nano-0.8 | cpu | Per-trial mean generation Chrome process-tree RSS | 1343165221 | bytes | 1 |
| kitten-nano-0.8 | cpu | In-window Chrome RSS observations | 1511.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| kitten-nano-0.8 | 8 | 8 | 1 (en) | Bella (expr-voice-2-f) |

Pinned Kitten Nano 0.8 checkpoint and supplied voice archive. Eight preset voices; all styles bundled in voices.npz. Only Bella is tested. Official clean\_text=false path with browser eSpeak and strict token mapping; no silent unknown-symbol skips. Sources: [1](https://huggingface.co/KittenML/kitten-tts-nano-0.8-fp32/blob/e73cfb095bd949c786ccdcf3b8ab04eb36c47442/config.json).


![Generation chart](chart.svg)

- **kitten-nano-0.8 / cpu**: Explicit single-thread WASM provider.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Campaign 2026-11-10T15-16-09-103Z-2e95f2b088d2; cell 20/25; source 955a87683c0c899cc299161a7b8b127fb75617be; AC attached; native arm64; 8 CPU cores and 16 GiB RAM. Headed Chrome, disposable profiles, sequential inference. Ordinary user applications remain open; owned caffeinate -di assertion for campaign lifetime; no persistent system power settings changed; temperature not instrumented.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
