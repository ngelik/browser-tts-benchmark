# Mach Boom and Pocket TTS campaign notes

This report covers two screenshot candidates on the same source and machine. It
does not include Phonon, which was explicitly excluded. The pinned checkpoint,
source commit, fixture and every retained attempt are linked from the
[campaign overview](../reports/mach-pocket/overview.md). The result bundles were produced by headed
Google Chrome 157.0.8103.40 on a MacBook Pro with Apple M1 Pro, 8 CPU cores,
16 GiB RAM, arm64 and Darwin 25.6.0. Runs were sequential on AC power; normal
user background applications remained open, and no thermal instrumentation or
controlled thermal stabilization was used.

“Native” in the report identifies the live benchmark harness receipts. It does
not mean every model used its publisher's native runtime. Mach Boom's upstream
release targets Linux/x86; this result is an experimental Chrome port using
Pyodide, NumPy and single-thread CPU WebAssembly SIMD128. It is not the publisher's
AMX/AVX-optimized native implementation. The Mach Boom WebGPU request was
unsupported because this port has no GPU inference implementation; it has no
score or RAM measurement.

Pocket TTS uses the original English 2026-04 checkpoint, not the newer 18.2M
family member. Its five ONNX graphs total 146,155,686 bytes (146.16 decimal MB):
four graphs are dynamically quantized and the text conditioner is FP32. The
separate inference bundle is 198,702,758 bytes with the locally derived browser
tokenizer. The screenshot's approximate 225.5 MB figure does not describe these
pinned files. Both Pocket backends use the `alba` voice, temperature 0.7, one
latent flow step, the same sentence splitting and EOS settings, and one WASM
thread. Latent noise is unseeded, so audio output can vary between repetitions.

The Pocket WebGPU setting explicitly requests ONNX Runtime WebGPU with WASM
fallback. Real WebGPU dispatch was observed, and each call awaited CPU-readable
PCM. This is mixed execution, not GPU-exclusive inference. Its 2,158.19 s median
was 2.53 times the Pocket CPU/WASM median of 854.52 s on this machine and these
settings. This is a measured timing relationship, not a general claim that CPU
is faster than GPU. Mach Boom has no cross-backend ratio because its GPU path was
unsupported.

| Measured warm cell | Generation median (min–max, n=5) | First PCM median | Audio duration / RTF | Core model weights |
|---|---:|---:|---:|---:|
| Pocket TTS · alba · CPU/WASM | 854.52 s (847.79–856.45) | 312.38 ms | 1,101.73 s / 0.775 | 146.16 MB |
| Mach Boom · Zoey · CPU/WebAssembly | 1,426.15 s (1,420.75–1,432.03) | 463.22 ms | 1,173.92 s / 1.215 | 18.16 MB |
| Pocket TTS · alba · WebGPU/WASM | 2,158.19 s (2,099.83–2,225.88) | 898.01 ms | 1,097.89 s / 1.966 | 146.16 MB |

Each warm cell used one excluded full-article warm-up and five full scored
20,000-character / 93-source-span runs. Cached RAM was collected separately with
one full generation in a one-tab disposable Chrome session. The following is
the mean and maximum sampled RSS within each generation window, not the
separate whole-call peak:

| Cached resource cell | Mean Chrome process-tree RSS | Maximum sampled RSS |
|---|---:|---:|
| Mach Boom CPU/WebAssembly | 1,085.29 MB (2,796 samples) | 1,142.73 MB |
| Pocket TTS CPU/WASM | 1,761.60 MB (1,682 samples) | 1,991.46 MB |
| Pocket TTS WebGPU/WASM | 2,135.24 MB (4,223 samples) | 2,756.64 MB |

RSS includes Chrome baseline and inference workers and may double-count shared
pages. It is not model-only RAM, total CPU/GPU allocation or VRAM. Decimal MB is
1,000,000 bytes. No cold-load measurements are included. PCM integrity, source
coverage and stop checks do not verify transcript fidelity or speech quality;
no human listening review is claimed.

Model/output terms and recording attribution are documented in
[`audio/README.md`](../audio/README.md), [licensing](LICENSING.md),
and each receipt. Compact clips are bound to scored trial 5; the full WAVs are
separate release assets.
