# 2026-11-10t22-06-51-166z-kokoro-82m-cpu-warm-a9cc8d21

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-warm-v1**, scenario **warm**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| kokoro-82m | cpu | measured | 2550.00 s | 2549.88–2550.72 s | 5 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| kokoro-82m | cpu | First completed source chunk | 29340.785 | ms | 5 |
| kokoro-82m | cpu | First PCM block | 29340.780 | ms | 5 |
| kokoro-82m | cpu | Generated audio | 1302.450 | s | 5 |
| kokoro-82m | cpu | Generation / audio duration | 1.958 | ratio | 5 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| kokoro-82m | 54 | 1 | 8 | af_heart |

Kokoro v1.0 model catalog; English browser runtime exercised. 54 named preset voices across 8 languages \(English has US/GB accents\). The export also contains a legacy af.bin alias, not a distinct named catalog voice. Official JS 1.2.1 exposes 28 English voices; only af\_heart is staged and tested. Sources: [1](https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/VOICES.md).


![Generation chart](chart.svg)

- **kokoro-82m / cpu**: Explicit single-thread WASM provider.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Campaign 2026-11-10T15-16-09-103Z-2e95f2b088d2; cell 8/25; source 955a87683c0c899cc299161a7b8b127fb75617be; AC attached; native arm64; 8 CPU cores and 16 GiB RAM. Headed Chrome, disposable profiles, sequential inference. Ordinary user applications remain open; owned caffeinate -di assertion for campaign lifetime; no persistent system power settings changed; temperature not instrumented.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
