# Liquid LFM3 CPU adapter provenance

This benchmark wrapper calls the unmodified Fusor WebAssembly runtime. Audio uses the upstream bundle loader; Omni uses the HTTP-only loading port described below. On the M1 Pro baseline it requests six compute threads. The upstream loader selects the relaxed-SIMD build when the browser supports it, then falls back to a single-thread build if thread initialization fails; the wrapper rejects that fallback rather than recording a single-thread run.

The upstream browser Space is pinned to `fusorlabs/liquidai-lmf3-wasm@572fc51e58808d3536bc8a8bea9d74a11b4b88bc`; its `engine/dist/host/worker.js`, `loader.js`, runtime glue, WASM and wasm-bindgen worker helpers are dynamically imported from locally staged assets. The runtime files remain cache-only. The source repositories are `fusor-rs/liquidai-lmf3-wasm@d21345320af38a5f2246a6d2e608d7cf178d92ef` and submodule `fusor-ai@67bbe1ebeb140f11262f15996b79825bbe1cf461`.

`web/liquid-cpu/compute-pool.mjs` is a narrow MIT-attributed local port of the page-side pool in `fusor-ai/packages/host/compute.js` from the pinned submodule. It retains the `SPAWN_COMPUTE` / `RAYON_INIT` / `RAYON_READY` / `RAYON_ERROR` protocol strings from its `protocol.js`, while adding pinned-URL/count validation, a ready timeout, cleanup, and fatal handling of post-ready Rayon errors. It is local adapter glue, not a modified WASM runtime or model.

The local wrapper selects one q7 bundle, sets seed 0 for each canonical source span, yields between official runtime steps, validates the staged manifest identity and drains the official 24 kHz PCM buffer after every step. It does not replace the prompt, model, tokenizer, decoder, runtime kernels or speech sampler. Seed 0 is a benchmark override: the upstream demo chooses a fresh random seed for each message. CPU q7 and WebGPU GGUF Q4_K_M are distinct configurations and do not support a paired speedup comparison.

Both model bundles use Liquid AI's LFM Open License v1.0. The pinned Audio manifest names base weights `LiquidAI/LFM3-Audio-2B@9d49701c372d6011d900f6abb40c6b296fb706dd`. The pinned Omni bundle manifest identifies `LiquidAI/LFM3-Omni-2B@ce2458cbce4ad970f92032ed94e3d18d30b04f9c`; this is independent of the separate GPU GGUF bundle.

`notices/LICENSE-Fusor` is the MIT license text from the app and `fusor-ai` commits. Both pinned repos contain the same license blob (SHA-256 `b34d36a9d1d848b09e80fae4c50aa6ad4ca452452ce4ba87069e21db1f919a90`, Git blob SHA-1 `a3feefb5b0d93f333c5180dcf1181b60affc5a81`); the asset lock records each repo target. `notices/LICENSE-LFM-Open-v1.0` contains the model bundle license text. The threaded WASM worker helper comes from `wasm-bindgen-rayon@1.3.0`, pinned by the upstream Fusor `Cargo.lock`. Its Cargo metadata declares Apache-2.0; release tag `v1.3.0` resolves to commit `6a09d723ed5eed586d1db808f9cc56625b36ff77`. Its license copy is `notices/LICENSE-wasm-bindgen-rayon-1.3.0` (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`). `assets.lock.json` records byte counts and SHA-256 values for model, runtime and license files. Scored runs cite a clean, published implementation commit.

`part-loader.mjs` is a local MIT-attributed port of the model-part streaming code
in the same pinned Fusor `packages/host/loader.js`. Omni bypasses that loader's
optional OPFS persistence, preserving four parallel lanes, approximately 4 MiB
writes and the neural runtime's BLAKE3 verification. It adds exact byte checks,
120-second part timeouts and cancellation of sibling requests. Audio retains
the upstream OPFS loader. This is loading glue; neural WASM and model files are
unchanged and remain outside Git. See `docs/LIQUID_LFM3_CPU.md` for the policy.
