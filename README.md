# Browser TTS Benchmark

[![Validate benchmark submissions](https://github.com/ngelik/browser-tts-benchmark/actions/workflows/validate.yml/badge.svg)](https://github.com/ngelik/browser-tts-benchmark/actions/workflows/validate.yml)

Repeatable, local text-to-speech benchmarks in **Google Chrome**: CPU/WASM,
WebGPU and explicit WebGL compatibility results. Select a model, run a fixed
20,000-character English article, then contribute a result through a pull request.

All inference happens in the browser. A local Node process serves static assets
and controls Chrome; it never performs speech synthesis. Results are not uploaded
automatically. Model assets are pinned, verified and kept outside Git.

## Standardized native results

The packaged protocol was independently exercised from a clean checkout on an
Apple M1 Pro (8 cores, 16 GiB), headed Chrome 157. One full article warm-up and
five scored full articles per backend use the same CPU-readable PCM timer.

| Model | Backend | Median | Observed min–max | Scored runs |
|---|---|---:|---:|---:|
| Paradee 8M | CPU/WASM | 103.92 s | 103.69–103.99 s | 5 |
| Paradee 8M | WebGPU + WASM operators | 18.74 s | 18.61–18.80 s | 5 |

![Standardized Paradee CPU and GPU comparison](comparisons/m1-pro-paradee-native/chart.svg)

The median ratio is **5.55×** for this configuration and machine. It is not a
universal hardware claim. CPU ran before GPU, on mains power; desktop background
processes were present and thermal state was not instrumented. These new native
scores must not be pooled with the historical reference campaign below.

[Full table, additional metrics and input receipts](comparisons/m1-pro-paradee-native/summary.md).

## Reference results

Apple M1 Pro · Chrome 157 · five warm repetitions · same 93 article chunks.
These are **historical imports** from the experiment that motivated this project.
CPU times include local PCM storage; the later GPU timer excludes it. Do not
calculate speedup ratios between those two protocols. Woof was already WebGPU
in the first experiment and has no CPU score.

| Model | CPU warm | WebGPU warm | Original download | Ideal at 1 Mbps |
|---|---:|---:|---:|---:|
| Paradee 8M | 111.15 s | **18.72 s** | 21.1 MB | 2:49 |
| Phonon 31M q8 | 270.41 s | 51.73 s | 69.3 MB | 9:14 |
| Leokani 7M | 75.19 s | 58.11 s | 38.9 MB | 5:11 |
| Leokani 4.5M | **55.96 s** | 61.57 s | 36.2 MB | 4:49 |
| Woof | Not measured | 181.81 s | 31.8 MB | 4:14 |
| PiVo curated | 87.92 s | 2,562.69 s | 21.4 MB | 2:51 |

![Generation, startup, browser memory and download comparison](docs/reference-overview.svg)

Downloads are the original complete runtime/model stacks, not new GPU bundle
measurements. Times at 1 Mbps are ideal body-transfer estimates, in minutes:seconds.
All six pinned WebGL paths were unsupported or unavailable. GPU paths may include
CPU preprocessing and disclosed WASM operator fallback. PiVo's slow GPU result
describes the current custom adapter, not its theoretical best performance.

Inspect [the raw historical results](results/), [GPU trial table](results/historical-2026-11-08-m1pro-gpu-warm/summary.md),
[original warm table](results/historical-2026-11-08-m1pro-primary-warm/summary.md),
and [backend dispatch evidence](docs/backend-evidence.json). See the
[methodology](docs/PROTOCOL.md). There are 102 original article measurements
and 30 later GPU measurements; failures and diagnostic limitations remain explicit.
Speech quality is left to listening review.

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

WebGL is an explicit compatibility probe; none of these pinned model paths
produced a successful WebGL score. Model catalog backend lists describe adapter
probe targets, not a guarantee that a model graph is compatible. Phonon and Woof
use official browser runtimes. The ONNX models use explicit browser adapters,
with upstream frontends and model-specific processing documented in their settings.

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

## Scope and licensing

The original harness and fixture are MIT licensed. Model/runtime licenses are
separate: Leokani weights and Woof have noncommercial restrictions; Paradee's
tested frontend includes a GPL component. Restricted weights, upstream engine
bundles, recordings and browser profiles are not redistributed here.
Read [component licensing](docs/LICENSING.md) before downloading or deploying.

See the [implementation validation record](docs/VALIDATION.md) for checks and limits.
Supported commands and validation status are documented, including limitations;
an unsupported path is not replaced by a fabricated score. The result schema,
privacy rules and evidence limits are in [docs/RESULTS.md](docs/RESULTS.md).
