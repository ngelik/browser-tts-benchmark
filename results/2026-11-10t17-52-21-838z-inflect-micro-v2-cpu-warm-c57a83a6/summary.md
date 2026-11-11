# 2026-11-10t17-52-21-838z-inflect-micro-v2-cpu-warm-c57a83a6

MacBook Pro (Apple M1 Pro, 16 GB) · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-warm-v1**, scenario **warm**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| inflect-micro-v2 | cpu | measured | 916.34 s | 916.23–916.41 s | 5 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| inflect-micro-v2 | cpu | First completed source chunk | 10266.410 | ms | 5 |
| inflect-micro-v2 | cpu | First PCM block | 10266.400 | ms | 5 |
| inflect-micro-v2 | cpu | Generated audio | 1224.771 | s | 5 |
| inflect-micro-v2 | cpu | Generation / audio duration | 0.748 | ratio | 5 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| inflect-micro-v2 | 1 | 1 | 1 (en) | English (single speaker; eSpeak en-us) |

Pinned Inflect Micro v2 complete English checkpoint and official FP32 ONNX export. One fixed synthetic English voice; no reference recording or voice-cloning model required. 9,356,513 deployable parameters including waveform decoder. Browser port uses a disclosed seeded JavaScript normal-noise generator rather than NumPy bitwise parity. Sources: [1](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/blob/91b1ab6432323064ec0e8e9704d92fcecd24855f/README.md), [2](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/blob/91b1ab6432323064ec0e8e9704d92fcecd24855f/onnx/SOURCE.json), [3](https://huggingface.co/owensong/Inflect-Micro-v2/blob/9d862840734dcc53afb5d27ef468459daad020fa/README.md).


![Generation chart](chart.svg)

- **inflect-micro-v2 / cpu**: Explicit one-thread WASM; an untimed CPU utterance passed.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Campaign 2026-11-10T15-16-09-103Z-2e95f2b088d2; cell 5/25; source 955a87683c0c899cc299161a7b8b127fb75617be; AC attached; native arm64; 8 CPU cores and 16 GiB RAM. Headed Chrome, disposable profiles, sequential inference. Ordinary user applications remain open; owned caffeinate -di assertion for campaign lifetime; no persistent system power settings changed; temperature not instrumented.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
