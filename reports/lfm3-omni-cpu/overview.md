# Browser TTS campaign overview

**Cohort:** native headed-Chrome results from source commit `35f6b1982836fe137fa2293810d9e4a144f76cd7` (source fingerprint `4513eb4a58228274100310f743b48b2233037318bba7d9ad6679a9585b2aa79f`), on MacBook Pro / Apple M1 Pro 8-core / 16 GiB / arm64 · Darwin 25.6.0 · Apple M1 Pro · Google Chrome 157.0.8103.40 · GPU not reported. Fixture: `english-20k-v1`, 20,000 characters / 93 chunks, SHA-256 `4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b`.

The included receipts share one source, exact environment and fixture; voice, precision and non-backend settings are checked per model. The recorded non-backend model settings match; `executionProviders` identifies the requested runtime providers. Scenarios remain separate and are never pooled. Model support and terms: [voice/language counts](../../docs/MODEL_SUPPORT.md) · [licensing and publication boundaries](../../docs/LICENSING.md).

## Warm generation

Full warm workload: one excluded full-article warm-up and at least five scored 20,000-character / 93-chunk repetitions. Generation is the benchmark timer; values summarize scored repetitions only. First PCM is median of recorded per-trial values. Audio duration and RTF are reconciled from output samples, sample rate and generation time.

| Model | CPU generation median (min–max) | WebGPU generation median (min–max) | CPU first PCM median | WebGPU first PCM median | CPU audio / RTF median | WebGPU audio / RTF median |
|---|---:|---:|---:|---:|---:|---:|
| LFM3-Omni-2B (Fusor q7 / CPU 6 threads) | 536.34 s (534.00–540.61; n=5) | Unsupported (not declared in manifest) | 378.50 ms (n=5) | Unsupported (not declared in manifest) | 1393.44 s / 0.385 | Unsupported (not declared in manifest) |

## Resource diagnostics

Cached RAM is the mean process-tree RSS sampled during one full generation in a separate one-tab Chrome session. It includes browser baseline and inference workers, may double-count shared pages, and is not model-only RAM or VRAM. The peak column is the largest RSS sample inside the same generation window; process RSS does not measure total CPU plus GPU allocations. Decimal MB = 1,000,000 bytes.

| Model | CPU mean Chrome RSS | CPU max sampled RSS | WebGPU mean Chrome RSS | WebGPU max sampled RSS | Pinned model weights |
|---|---:|---:|---:|---:|---:|
| LFM3-Omni-2B (Fusor q7 / CPU 6 threads) | 4137.23 MB (n=1; 1102 samples) | 4217.29 MB (sampled max; n=1; 1102 samples) | Unsupported (not declared in manifest) | Unsupported (not declared in manifest) | 2494.57 MB |

## Submitted receipts

Each cell links to its submitted receipt and full per-run report. Missing entries are labeled, not treated as zero.

| Model | Warm CPU | Warm WebGPU | Cached CPU RAM | Cached WebGPU RAM | Support | License |
|---|---|---|---|---|---|---|
| LFM3-Omni-2B (Fusor q7 / CPU 6 threads) | [Report](../../results/2026-11-11t11-02-51-665z-lfm3-omni-2b-fusor-q7-cpu-cpu-warm-4378e428/summary.md) | Unsupported (manifest) | [Report](../../results/2026-11-11t11-57-01-791z-lfm3-omni-2b-fusor-q7-cpu-cpu-cached-42d33e30/summary.md) | Unsupported (manifest) | [Support details](../../docs/MODEL_SUPPORT.md#lfm3-omni-2b-fusor-q7-cpu) | [Terms](../../docs/LICENSING.md) |

## Unsupported and error outcomes

All submitted cells are measured.


![Campaign metrics chart](overview.svg)

This overview reports measured browser execution and resource diagnostics only. It does not rank speech quality or establish intelligibility. Compare scenarios only within their named protocol boundaries; unsupported, unavailable, unrecorded and not-submitted values remain distinct.
