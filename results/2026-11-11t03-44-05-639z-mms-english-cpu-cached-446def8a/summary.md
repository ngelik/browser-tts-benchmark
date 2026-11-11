# 2026-11-11t03-44-05-639z-mms-english-cpu-cached-446def8a

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| mms-english | cpu | measured | 1562.65 s | 1562.65–1562.65 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| mms-english | cpu | First completed source chunk | 17928.285 | ms | 1 |
| mms-english | cpu | First PCM block | 17928.275 | ms | 1 |
| mms-english | cpu | Generated audio | 1216.848 | s | 1 |
| mms-english | cpu | Generation / audio duration | 1.284 | ratio | 1 |
| mms-english | cpu | Model initialization | 764.948 | ms | 1 |
| mms-english | cpu | Complete controller trial including setup/export | 1565966.038 | ms | 1 |
| mms-english | cpu | Transferred HTTP body data | 38404 | bytes | 1 |
| mms-english | cpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| mms-english | cpu | Whole-call Chrome process-tree peak RSS | 1958494208 | bytes | 1 |
| mms-english | cpu | Per-trial mean generation Chrome process-tree RSS | 1524368755 | bytes | 1 |
| mms-english | cpu | In-window Chrome RSS observations | 3113.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| mms-english | 1 | 1 | 1 (en) | English fixed voice |

Pinned English checkpoint, not the wider multilingual MMS family. Single English speaker. Official Xenova ONNX export removes training-only weights. Benchmark spells out numeric tokens before the official grapheme tokenizer to avoid dropping digits absent from its vocabulary. Sources: [1](https://huggingface.co/facebook/mms-tts-eng/blob/c71de0fe7204c83f1c10820a7d696d0b450048ba/README.md).


![Generation chart](chart.svg)

- **mms-english / cpu**: Explicit single-thread WASM provider.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Campaign 2026-11-10T15-16-09-103Z-2e95f2b088d2; cell 14/25; source 955a87683c0c899cc299161a7b8b127fb75617be; AC attached; native arm64; 8 CPU cores and 16 GiB RAM. Headed Chrome, disposable profiles, sequential inference. Ordinary user applications remain open; owned caffeinate -di assertion for campaign lifetime; no persistent system power settings changed; temperature not instrumented.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
