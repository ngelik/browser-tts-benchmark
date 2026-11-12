# 2026-11-12t06-54-45-636z-mach-boom-cpu-cached-3e01ad4c

MacBook Pro / Apple M1 Pro 8-core / 16 GiB / arm64 · Apple M1 Pro · Google Chrome 157.0.8103.40

Protocol: **browser-tts-cached-v1-resources**, scenario **cached**. Native harness run.

First source-chunk request through final CPU-readable PCM; excludes initialization, validation, hashing, WAV encoding and save. Optional articleCallPeakRssBytes spans the entire browser call including post-timer validation/export. Generation RSS uses timestamped samples inside browser generation start/end boundaries; it includes the owned Chrome process tree and browser baseline.

| Model | Requested backend | Status | Median | Min–max | Runs |
|---|---|---|---:|---:|---:|
| mach-boom | cpu | measured | 1403.68 s | 1403.68–1403.68 s | 1 |

Additional metrics (median of available observations; scopes are distinct):

| Model | Backend | Metric | Median | Unit | n |
|---|---|---|---:|---|---:|
| mach-boom | cpu | First completed source chunk | 17359.390 | ms | 1 |
| mach-boom | cpu | First PCM block | 1011.425 | ms | 1 |
| mach-boom | cpu | Generated audio | 1173.920 | s | 1 |
| mach-boom | cpu | Generation / audio duration | 1.196 | ratio | 1 |
| mach-boom | cpu | Model initialization | 1726.041 | ms | 1 |
| mach-boom | cpu | Complete controller trial including setup/export | 1408991.500 | ms | 1 |
| mach-boom | cpu | Transferred HTTP body data | 38404 | bytes | 1 |
| mach-boom | cpu | Ideal body transfer at 1 Mbps | 0.307 | s | 1 |
| mach-boom | cpu | Whole-call Chrome process-tree peak RSS | 1509998592 | bytes | 1 |
| mach-boom | cpu | Per-trial mean generation Chrome process-tree RSS | 1085285366 | bytes | 1 |
| mach-boom | cpu | In-window Chrome RSS observations | 2796.000 | samples | 1 |

Model support (catalog capability, not coverage of this run):

| Model | Supported voices | Bundled voices | Languages | Tested voice |
|---|---:|---:|---|---|
| mach-boom | 4 | 1 | 1 (en) | Zoey |

Four named voices bundled upstream with this English checkpoint; Zoey staged for the benchmark. Zoey, Juniper, Everly and Harper are supplied upstream. Additional compatible Phonon voices are not counted here. Only Zoey in English is measured. Browser port uses CPU WebAssembly, not native x86 AMX/AVX. Sources: [1](https://huggingface.co/SyzygyResearch/Mach-Boom/blob/01860b06bdf8498761255ad1c64b99980b96486d/README.md), [2](https://huggingface.co/SyzygyResearch/Mach-Boom/blob/01860b06bdf8498761255ad1c64b99980b96486d/voices/voices.jsonl).


![Generation chart](chart.svg)

- **mach-boom / cpu**: Upstream Python/NumPy and portable C kernels execute inside one Chrome worker through WebAssembly. No host Python synthesis, AMX, or GPU.

Capability checks run separately before timing. GPU dispatch does not imply GPU-exclusive execution.

Raw WAV is saved locally; opt-in audio publication is separate from timing and automatic result submission.

Screenshot campaign mach-pocket-2026-11-11-v1; cell order mach-boom/cpu, pocket-tts-100m-english-int8/webgpu, pocket-tts-100m-english-int8/cpu, mach-boom/webgpu; sequential headed Chrome on AC power. Other user apps left open; no controlled thermal stabilization or universal performance claim. Process-scoped idle-sleep prevention is active. No dedicated cold-load check. Separate single-article generation RSS diagnostic after warm campaign.

RSS is sampled every 500 ms across the owned Chrome process tree, including the Chrome baseline and inference workers. Whole-call peak spans post-timer validation/export; generation mean uses only in-window samples from browser generation start through final CPU-readable PCM.

Different protocols, fixtures, settings or machines must not be pooled into a speedup ranking. This report does not rate speech quality.
