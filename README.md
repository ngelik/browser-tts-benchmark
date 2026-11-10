# Browser TTS Benchmark

[![Validate benchmark submissions](https://github.com/ngelik/browser-tts-benchmark/actions/workflows/validate.yml/badge.svg)](https://github.com/ngelik/browser-tts-benchmark/actions/workflows/validate.yml)

Repeatable, local text-to-speech benchmarks in **Google Chrome**: CPU/WASM,
and WebGPU. Select a model, run a fixed
20,000-character English article, then contribute a result through a pull request.

All inference happens in the browser. A local Node process serves static assets
and controls Chrome; it never performs speech synthesis. Results are not uploaded
automatically. Model assets are pinned, verified and kept outside Git.

[▶ Listen to the benchmark samples](https://ngelik.github.io/browser-tts-benchmark/audio/) · [Run a benchmark](#run-a-benchmark)

## Reference results

<!-- benchmark-results:start -->

Generated from every submitted result. Latest warm attempt per model/backend and exact environment is shown; errors are retained. No cross-machine or cross-protocol speedup is implied.

- **E1**: Apple M1 Pro reference machine · Google Chrome 157.0.8103.39 · macOS 26.6.2.
- **E2**: Apple M1 Pro / 16 GiB · Google Chrome 157.0.8103.39 · Darwin 25.6.0.
- **E3**: MacBook Pro (Apple M1 Pro, 16 GB) · Google Chrome 157.0.8103.39 · Darwin 25.6.0.

| Model | Environment | Model weights (MB) | CPU warm median | WebGPU warm median | Evidence scope |
|---|---|---:|---:|---:|---|
| Leokani 4.5M INT8 | E1 | 5.14 | [55.96 s](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [61.57 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| Leokani 7M INT8 | E1 | 7.84 | [75.19 s](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [58.11 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| Paradee 8M INT8 | E1 | 8.46 | [111.15 s](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [18.72 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| Phonon 31M q8 | E1 | 64.51 | [270.41 s](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [51.73 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| PiVo 1.4M curated (Pi voice) | E1 | 5.84 | [87.92 s](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [2562.69 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| Underdog Woof one-voice (Isla) | E1 | 31.71 | — | [181.81 s](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | Historical; distinct timing protocols |
| Paradee 8M INT8 | E2 | 8.46 | [103.92 s](results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/summary.md) | [18.74 s](results/2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0/summary.md) | Native; matched source |
| Piper en-GB Southern English Female low | E2 | 63.10 | [170.64 s](results/2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981/summary.md) | [12.07 s](results/2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392/summary.md) | Native; matched source |
| Supertonic 3 FP32 (M3) | E3 | 398.08 | [1332.06 s](results/2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0/summary.md) | [67.09 s](results/2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808/summary.md) | Native; matched source |

Each measured warm cell uses five scored full 20,000-character articles. Missing values are not zero. Open receipts for voice, precision, timing boundaries, power conditions and observed min–max.

MB = 1,000,000 bytes. Model size counts pinned core model-weight files (including the vocoder), verified against the displayed run receipts; it excludes runtime, G2P, voice/config files and transfer overhead.

### Chrome RAM during generation

Dedicated full-article memory runs measure an isolated Chrome instance with one benchmark tab, including inference workers and browser baseline. These are separate resource diagnostics; their timings do not replace the warm speed measurements above. RSS may double-count shared pages and is not model-only RAM or GPU VRAM. Values are the mean of generation-window samples, averaged equally across recorded articles. [Method and reproduction](docs/MEMORY.md).

**RAM 1** · MacBook Pro (Apple M1 Pro, 16 GB) · Google Chrome 157.0.8103.39 · Darwin 25.6.0 · browser-tts-cached-v1-resources · 1 full article(s) per measured cell · source [`fb3290e1`](https://github.com/ngelik/browser-tts-benchmark/commit/fb3290e1fca0c3a416e1352a1cb7fc8232ea826c).

| Model | Model weights (MB) | CPU avg Chrome RAM (MB) | WebGPU avg Chrome RAM (MB) |
|---|---:|---:|---:|
| Leokani 4.5M INT8 | 5.14 | [1292.11](results/2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b/summary.md) | [2321.36](results/2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc/summary.md) |
| Leokani 7M INT8 | 7.84 | [1424.72](results/2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530/summary.md) | [2503.38](results/2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50/summary.md) |
| Paradee 8M INT8 | 8.46 | [1317.83](results/2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05/summary.md) | [1864.65](results/2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822/summary.md) |
| Phonon 31M q8 | 64.51 | [1195.93](results/2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34/summary.md) | [1268.30](results/2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e/summary.md) |
| Piper en-GB Southern English Female low | 63.10 | [1384.05](results/2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea/summary.md) | [1909.32](results/2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8/summary.md) |
| PiVo 1.4M curated (Pi voice) | 5.84 | [1143.26](results/2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6/summary.md) | [1969.37](results/2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4/summary.md) |
| Supertonic 3 FP32 (M3) | 398.08 | [1971.02](results/2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c/summary.md) | [2506.28](results/2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf/summary.md) |
| Underdog Woof one-voice (Isla) | 31.71 | [unsupported](results/2026-11-10t12-29-27-973z-woof-cpu-cached-0c9a58d8/summary.md) | [1043.96](results/2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663/summary.md) |

![Average Chrome RAM during generation](docs/reference-memory.svg)

### Voice and language support

Counts describe the pinned model/catalog, not the number of voices or languages benchmarked. All current measurements use English and one selected voice per model. Other checkpoints in a family are excluded.

| Model | Supported voices | Bundled voices | Supported languages | Scope / source |
|---|---:|---:|---|---|
| Paradee 8M INT8 | 4 | 4 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#paradee) |
| Phonon 31M q8 | 102 | 1 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#phonon) |
| Leokani 7M INT8 | 1 | 1 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#leokani-7m) |
| Leokani 4.5M INT8 | 1 | 1 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#leokani-4.5m) |
| PiVo 1.4M curated (Pi voice) | 2 | 2 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#pivo-curated) |
| Underdog Woof one-voice (Isla) | 1 | 1 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#woof) |
| Piper en-GB Southern English Female low | 1 | 1 | 1 (en) | [Details](docs/MODEL_SUPPORT.md#piper-en-gb-southern-english-female-low) |
| Supertonic 3 FP32 (M3) | 10 | 1 | 31 | [Details](docs/MODEL_SUPPORT.md#supertonic-3) |

### Controlled native comparisons

Only compatible receipts enter these comparisons; source, settings, fixture and environment checks must pass.

[m1-pro-paradee-native — table and input receipts](comparisons/m1-pro-paradee-native/summary.md)

![m1-pro-paradee-native](comparisons/m1-pro-paradee-native/chart.svg)

[m1-pro-piper-native — table and input receipts](comparisons/m1-pro-piper-native/summary.md)

![m1-pro-piper-native](comparisons/m1-pro-piper-native/chart.svg)

[m1-pro-supertonic3-native — table and input receipts](comparisons/m1-pro-supertonic3-native/summary.md)

![m1-pro-supertonic3-native](comparisons/m1-pro-supertonic3-native/chart.svg)

### Historical resource measurements

Startup, memory and download figures below belong to the original campaign. They were not remeasured in subsequent warm-only runs. CPU and later GPU timer boundaries differ; do not calculate a speedup ratio across them.

![Historical generation, startup, memory and transfer](docs/reference-overview.svg)

### Listening samples

[▶ Open the listening room](https://ngelik.github.io/browser-tts-benchmark/audio/) — play and compare recordings in your browser, without cloning. GitHub README previews do not embed audio controls; each Listen link opens the matching player.

Synthetic speech from the actual recorded runs. [Listening instructions and attribution](audio/README.md). Compact clips stay in Git; full recordings are repository release assets.

| Model | Backend | Source run | 30-second clip | Full article WAV |
|---|---|---|---|---|
| Leokani 4.5M INT8 | cpu | [Receipt](results/2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b--leokani-4.5m--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b--leokani-4.5m--cpu-full.wav) |
| Leokani 4.5M INT8 | cpu | [Receipt](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-primary-warm--leokani-4.5m--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-primary-warm--leokani-4.5m--cpu-full.wav) |
| Leokani 4.5M INT8 | webgpu | [Receipt](results/2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc--leokani-4.5m--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc--leokani-4.5m--webgpu-full.wav) |
| Leokani 4.5M INT8 | webgpu | [Receipt](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-gpu-warm--leokani-4.5m--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-gpu-warm--leokani-4.5m--webgpu-full.wav) |
| Leokani 7M INT8 | cpu | [Receipt](results/2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530--leokani-7m--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530--leokani-7m--cpu-full.wav) |
| Leokani 7M INT8 | cpu | [Receipt](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-primary-warm--leokani-7m--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-primary-warm--leokani-7m--cpu-full.wav) |
| Leokani 7M INT8 | webgpu | [Receipt](results/2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50--leokani-7m--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50--leokani-7m--webgpu-full.wav) |
| Leokani 7M INT8 | webgpu | [Receipt](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-gpu-warm--leokani-7m--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-gpu-warm--leokani-7m--webgpu-full.wav) |
| Paradee 8M INT8 | cpu | [Receipt](results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f--paradee--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f--paradee--cpu-full.wav) |
| Paradee 8M INT8 | cpu | [Receipt](results/2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05--paradee--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05--paradee--cpu-full.wav) |
| Paradee 8M INT8 | webgpu | [Receipt](results/2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0--paradee--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0--paradee--webgpu-full.wav) |
| Paradee 8M INT8 | webgpu | [Receipt](results/2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822--paradee--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822--paradee--webgpu-full.wav) |
| Phonon 31M q8 | cpu | [Receipt](results/2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34--phonon--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34--phonon--cpu-full.wav) |
| Phonon 31M q8 | cpu | [Receipt](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-primary-warm--phonon--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-primary-warm--phonon--cpu-full.wav) |
| Phonon 31M q8 | webgpu | [Receipt](results/2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e--phonon--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e--phonon--webgpu-full.wav) |
| Phonon 31M q8 | webgpu | [Receipt](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-gpu-warm--phonon--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-gpu-warm--phonon--webgpu-full.wav) |
| Piper en-GB Southern English Female low | cpu | [Receipt](results/2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981--piper-en-gb-southern-english-female-low--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981--piper-en-gb-southern-english-female-low--cpu-full.wav) |
| Piper en-GB Southern English Female low | cpu | [Receipt](results/2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea--piper-en-gb-southern-english-female-low--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea--piper-en-gb-southern-english-female-low--cpu-full.wav) |
| Piper en-GB Southern English Female low | webgpu | [Receipt](results/2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392--piper-en-gb-southern-english-female-low--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392--piper-en-gb-southern-english-female-low--webgpu-full.wav) |
| Piper en-GB Southern English Female low | webgpu | [Receipt](results/2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8--piper-en-gb-southern-english-female-low--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8--piper-en-gb-southern-english-female-low--webgpu-full.wav) |
| PiVo 1.4M curated (Pi voice) | cpu | [Receipt](results/2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6--pivo-curated--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6--pivo-curated--cpu-full.wav) |
| PiVo 1.4M curated (Pi voice) | cpu | [Receipt](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-primary-warm--pivo-curated--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-primary-warm--pivo-curated--cpu-full.wav) |
| PiVo 1.4M curated (Pi voice) | webgpu | [Receipt](results/2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4--pivo-curated--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4--pivo-curated--webgpu-full.wav) |
| PiVo 1.4M curated (Pi voice) | webgpu | [Receipt](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-gpu-warm--pivo-curated--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-gpu-warm--pivo-curated--webgpu-full.wav) |
| Supertonic 3 FP32 (M3) | cpu | [Receipt](results/2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0--supertonic-3--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0--supertonic-3--cpu-full.wav) |
| Supertonic 3 FP32 (M3) | cpu | [Receipt](results/2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c--supertonic-3--cpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c--supertonic-3--cpu-full.wav) |
| Supertonic 3 FP32 (M3) | webgpu | [Receipt](results/2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808--supertonic-3--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808--supertonic-3--webgpu-full.wav) |
| Supertonic 3 FP32 (M3) | webgpu | [Receipt](results/2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf--supertonic-3--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf--supertonic-3--webgpu-full.wav) |
| Underdog Woof one-voice (Isla) | webgpu | [Receipt](results/2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663--woof--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663--woof--webgpu-full.wav) |
| Underdog Woof one-voice (Isla) | webgpu | [Receipt](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [▶ Listen](https://ngelik.github.io/browser-tts-benchmark/audio/?sample=historical-2026-11-08-m1pro-gpu-warm--woof--webgpu.wav) | [Download / listen](https://github.com/ngelik/browser-tts-benchmark/releases/download/benchmark-audio-v1/historical-2026-11-08-m1pro-gpu-warm--woof--webgpu-full.wav) |

<details>
<summary>All submitted results — every scenario and earlier run</summary>

| Run | Models / backends | Scenario / protocol | Status | Table | Chart |
|---|---|---|---|---|---|
| 1 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | cached / legacy-storage-v0-network-cached-return | measured | [Report](results/historical-2026-11-08-m1pro-network-cached-return/summary.md) | [SVG](results/historical-2026-11-08-m1pro-network-cached-return/chart.svg) |
| 2 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | network / legacy-storage-v0-network-cold | measured | [Report](results/historical-2026-11-08-m1pro-network-cold/summary.md) | [SVG](results/historical-2026-11-08-m1pro-network-cold/chart.svg) |
| 3 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | switch / legacy-storage-v0-network-switch | measured | [Report](results/historical-2026-11-08-m1pro-network-switch/summary.md) | [SVG](results/historical-2026-11-08-m1pro-network-switch/chart.svg) |
| 4 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | offline / legacy-storage-v0-offline-cache-verification | measured | [Report](results/historical-2026-11-08-m1pro-offline-cache-verification/summary.md) | [SVG](results/historical-2026-11-08-m1pro-offline-cache-verification/chart.svg) |
| 5 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | cached / legacy-storage-v0-primary-cached | measured | [Report](results/historical-2026-11-08-m1pro-primary-cached/summary.md) | [SVG](results/historical-2026-11-08-m1pro-primary-cached/chart.svg) |
| 6 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | cold / legacy-storage-v0-primary-cold | measured | [Report](results/historical-2026-11-08-m1pro-primary-cold/summary.md) | [SVG](results/historical-2026-11-08-m1pro-primary-cold/chart.svg) |
| 7 · 2026-11-08 | phonon/cpu, paradee/cpu, leokani-7m/cpu, leokani-4.5m/cpu, pivo-curated/cpu, woof/webgpu | warm / legacy-storage-v0-primary-warm | measured | [Report](results/historical-2026-11-08-m1pro-primary-warm/summary.md) | [SVG](results/historical-2026-11-08-m1pro-primary-warm/chart.svg) |
| 8 · 2026-11-08 | woof/webgpu, phonon/webgpu, paradee/webgpu, leokani-7m/webgpu, pivo-curated/webgpu, leokani-4.5m/webgpu | warm / legacy-gpu-pcm-v0 | measured | [Report](results/historical-2026-11-08-m1pro-gpu-warm/summary.md) | [SVG](results/historical-2026-11-08-m1pro-gpu-warm/chart.svg) |
| 9 · 2026-11-09 | paradee/cpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/summary.md) | [SVG](results/2026-11-09t04-55-36-509z-paradee-cpu-warm-244b2a2f/chart.svg) |
| 10 · 2026-11-09 | paradee/webgpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0/summary.md) | [SVG](results/2026-11-09t05-06-08-477z-paradee-webgpu-warm-c3836dc0/chart.svg) |
| 11 · 2026-11-09 | piper-en-gb-southern-english-female-low/cpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/summary.md) | [SVG](results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/chart.svg) |
| 12 · 2026-11-09 | piper-en-gb-southern-english-female-low/cpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981/summary.md) | [SVG](results/2026-11-09t20-33-26-966z-piper-en-gb-southern-english-female-low-cpu-warm-9a0ba981/chart.svg) |
| 13 · 2026-11-09 | piper-en-gb-southern-english-female-low/webgpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392/summary.md) | [SVG](results/2026-11-09t20-52-18-629z-piper-en-gb-southern-english-female-low-webgpu-warm-d8fb8392/chart.svg) |
| 14 · 2026-11-10 | supertonic-3/cpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0/summary.md) | [SVG](results/2026-11-10t07-43-34-755z-supertonic-3-cpu-warm-a07fded0/chart.svg) |
| 15 · 2026-11-10 | supertonic-3/webgpu | warm / browser-tts-warm-v1 | measured | [Report](results/2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808/summary.md) | [SVG](results/2026-11-10t09-58-29-882z-supertonic-3-webgpu-warm-97865808/chart.svg) |
| 16 · 2026-11-10 | paradee/cpu | cached / browser-tts-cached-v1-resources | error | [Report](results/2026-11-10t12-11-42-908z-paradee-cpu-cached-f3fc560d/summary.md) | [SVG](results/2026-11-10t12-11-42-908z-paradee-cpu-cached-f3fc560d/chart.svg) |
| 17 · 2026-11-10 | paradee/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05/summary.md) | [SVG](results/2026-11-10t12-13-43-130z-paradee-cpu-cached-becd1b05/chart.svg) |
| 18 · 2026-11-10 | paradee/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822/summary.md) | [SVG](results/2026-11-10t12-18-50-239z-paradee-webgpu-cached-66f2f822/chart.svg) |
| 19 · 2026-11-10 | leokani-4.5m/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b/summary.md) | [SVG](results/2026-11-10t12-19-17-960z-leokani-4.5m-cpu-cached-31b8534b/chart.svg) |
| 20 · 2026-11-10 | leokani-4.5m/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc/summary.md) | [SVG](results/2026-11-10t12-20-20-070z-leokani-4.5m-webgpu-cached-2527e2cc/chart.svg) |
| 21 · 2026-11-10 | leokani-7m/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530/summary.md) | [SVG](results/2026-11-10t12-21-33-736z-leokani-7m-cpu-cached-05654530/chart.svg) |
| 22 · 2026-11-10 | leokani-7m/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50/summary.md) | [SVG](results/2026-11-10t12-22-54-319z-leokani-7m-webgpu-cached-fd1cde50/chart.svg) |
| 23 · 2026-11-10 | phonon/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34/summary.md) | [SVG](results/2026-11-10t12-24-03-928z-phonon-cpu-cached-26724b34/chart.svg) |
| 24 · 2026-11-10 | phonon/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e/summary.md) | [SVG](results/2026-11-10t12-28-29-585z-phonon-webgpu-cached-4f21d78e/chart.svg) |
| 25 · 2026-11-10 | woof/cpu | cached / browser-tts-cached-v1-resources | unsupported | [Report](results/2026-11-10t12-29-27-973z-woof-cpu-cached-0c9a58d8/summary.md) | [SVG](results/2026-11-10t12-29-27-973z-woof-cpu-cached-0c9a58d8/chart.svg) |
| 26 · 2026-11-10 | woof/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663/summary.md) | [SVG](results/2026-11-10t12-29-29-399z-woof-webgpu-cached-14969663/chart.svg) |
| 27 · 2026-11-10 | piper-en-gb-southern-english-female-low/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea/summary.md) | [SVG](results/2026-11-10t12-32-39-591z-piper-en-gb-southern-english-female-low-cpu-cached-fff0c4ea/chart.svg) |
| 28 · 2026-11-10 | piper-en-gb-southern-english-female-low/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8/summary.md) | [SVG](results/2026-11-10t12-35-36-473z-piper-en-gb-southern-english-female-low-webgpu-cached-b3f670b8/chart.svg) |
| 29 · 2026-11-10 | supertonic-3/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf/summary.md) | [SVG](results/2026-11-10t12-35-56-902z-supertonic-3-webgpu-cached-3af494cf/chart.svg) |
| 30 · 2026-11-10 | supertonic-3/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c/summary.md) | [SVG](results/2026-11-10t12-37-17-447z-supertonic-3-cpu-cached-9f32062c/chart.svg) |
| 31 · 2026-11-10 | pivo-curated/cpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6/summary.md) | [SVG](results/2026-11-10t12-59-54-018z-pivo-curated-cpu-cached-60e6cfd6/chart.svg) |
| 32 · 2026-11-10 | pivo-curated/webgpu | cached / browser-tts-cached-v1-resources | measured | [Report](results/2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4/summary.md) | [SVG](results/2026-11-10t13-01-23-404z-pivo-curated-webgpu-cached-d9ffb3e4/chart.svg) |

</details>

<!-- benchmark-results:end -->

## Use with an AI agent

Give your agent this instruction:

> Use the [browser-tts-benchmark skill](skills/browser-tts-benchmark/SKILL.md).
> Benchmark MODEL in Google Chrome on CPU (and WebGPU if requested), verify the
> full article and audio, then prepare a table, chart and result pull request.
> I authorize publishing the reviewed source and result metadata to my fork.

Replace MODEL with a catalog ID or Hugging Face model URL. A new model goes through
runtime/asset/license verification and a code PR before scored results. For a
random model, the skill records the eligible pool, seed and selection before any
timing. It never treats smoke tests, native Python inference or CPU fallback as
successful browser GPU measurements.

The skill is agent-neutral Markdown with a small Node.js selection helper. Agents
can read it directly from the clone. For Codex discovery, copy the entire
`skills/browser-tts-benchmark/` folder to `~/.codex/skills/browser-tts-benchmark/`
when that destination does not already exist, then invoke `$browser-tts-benchmark`.
Review an existing installed copy before replacing it. Other agents can load the
same `SKILL.md`; no Codex-only tool is required by the workflow.

Publication follows the user's authorization. Without it, the skill prepares
local result files and does not push. Model binaries stay local; explicitly
authorized audio uses verified clips and repository release assets.

The [fresh-clone skill trial](docs/SKILL_TRIAL.md) exercised this workflow.
All submitted runs, including Piper, appear in [Reference results](#reference-results).

## Run a benchmark

Requirements: Node.js 22 or newer, npm, installed Google Chrome, enough free disk
space for selected assets, and a desktop session for headed Chrome. A hardware
WebGPU adapter is required for GPU measurements. Start with one model.

```sh
git clone https://github.com/ngelik/browser-tts-benchmark.git
cd browser-tts-benchmark
npm ci
npm run assets -- fetch --model phonon
npm run bench -- run --model phonon --backend cpu --smoke
npm run bench -- run --model phonon --backend cpu --scenario warm
```

See the [command reference](docs/CLI.md) for model selection, GPU runs, cached,
cold, offline, bandwidth-limited and model-switch scenarios. Assets are fetched/imported separately and hash-verified before running.
Use a smoke check to validate installation; use the full article and five
repetitions for a publishable warm result. Do not run models concurrently.

Pinned model IDs (use these with `--model`):

| Model ID | CPU/WASM | WebGPU | Local terms acknowledgment |
|---|---|---|---|
| `phonon` | Yes | Yes | No |
| `paradee` | Yes | Yes, mixed operators | No |
| `leokani-7m` | Yes | Yes, CPU G2P/iSTFT | `--accept-license` |
| `leokani-4.5m` | Yes | Yes, CPU G2P/iSTFT | `--accept-license` |
| `pivo-curated` | Yes | Yes, current adapter is slow | No |
| `woof` | Unavailable in pinned runtime | Yes | `--accept-license` |
| `piper-en-gb-southern-english-female-low` | Yes | Yes, mixed operators | `--accept-license` |
| `supertonic-3` | Yes | Yes, mixed operators | `--accept-license` |

Phonon, Woof and Piper use official browser runtimes. Supertonic 3 reuses its official MIT browser helper with documented module/lifecycle integration. Model-specific adapters
record their preprocessing, voice and allowed CPU operator fallback.

New native warm runs use one common CPU/GPU timing boundary: first chunk request
through final CPU-readable PCM, excluding warm-up, validation, hashing and export.
Model loading is excluded. One full article warm-up is followed by five scored
articles with the model resident. The historical PiVo GPU configuration can take
over four hours for this sequence.

## Publish your result through a pull request

Fork this repository on GitHub first. Replace `YOUR_USERNAME` below with your
account; keep the original `origin` remote pointing to upstream.

```sh
npm run report -- runs/<run-id>/result.json
npm run submit -- runs/<run-id>/result.json
npm run validate
npm test
git switch -c results/my-machine
git add results/<run-id>
git commit -m "Add benchmark results for my machine"
git remote add fork https://github.com/YOUR_USERNAME/browser-tts-benchmark.git
git push -u fork results/my-machine
```

Open a pull request from your fork. The submitted bundle contains a JSON receipt,
generated Markdown table, SVG chart and checksums. CI validates these artifacts;
it does not pretend a shared GitHub runner reproduces your laptop's GPU timings.
Use `npm run compare -- --out comparisons/my-machine results/<cpu-id>/result.json results/<gpu-id>/result.json` for a combined table and chart of compatible runs.
See [CONTRIBUTING.md](CONTRIBUTING.md) for review requirements and adding models.

## Generate speech with TTSBuddy

[TTSBuddy](https://www.ttsbuddy.com) converts text, documents and webpages to speech.
Use the [TTSBuddy CLI](https://github.com/ngelik/ttsbuddy-cli) from your terminal or
AI agent to choose voices from supported models, including Kokoro and Supertonic,
and save generated audio locally.

[CLI guide](https://www.ttsbuddy.com/docs/developers/cli) · [AI agent skill](https://github.com/ngelik/ttsbuddy-cli/blob/main/skills/tts-buddy/SKILL.md) · [Raw SKILL.md](https://raw.githubusercontent.com/ngelik/ttsbuddy-cli/main/skills/tts-buddy/SKILL.md)

TTSBuddy generation uses its hosted service and your account's plan allowance.
The benchmark results in this repository measure local browser inference.

## Scope and licensing

The original harness, agent skill and fixture are MIT licensed; [retained notices](NOTICE.md) identify exceptions. Model/runtime licenses are
separate: Leokani weights and Woof have noncommercial restrictions; Paradee's
tested frontend includes a GPL component. Restricted weights, upstream engine
bundles and browser profiles are not redistributed here. Authorized recording clips and full WAV release assets retain their [attribution and terms](audio/README.md).
Read [component licensing](docs/LICENSING.md) before downloading or deploying.

See the [implementation validation record](docs/VALIDATION.md) for checks and limits.
Supported commands and validation status are documented, including limitations;
an unsupported path is not replaced by a fabricated score. The result schema,
privacy rules and evidence limits are in [docs/RESULTS.md](docs/RESULTS.md).
