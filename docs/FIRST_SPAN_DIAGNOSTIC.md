# Warm first-span diagnostic

Use this short run to compare Chrome execution on the opening 233 characters of `english-20k-v1`. The separate [full benchmark](../README.md#reference-results) uses all 93 spans and repeated 20,000-character article runs. A short run has one measured observation and cannot establish an article score.

Run these commands in a clean checkout with Google Chrome installed. Review the selected model's license and stage its pinned assets first.

```sh
node bin/bench.mjs assets fetch --model audio8-realistic-0.6b-int4 --accept-license
node tools/probe-first-span.mjs audio8-realistic-0.6b-int4 cpu audio8-cpu-first-span --accept-license
node tools/probe-first-span.mjs audio8-realistic-0.6b-int4 webgpu audio8-gpu-first-span --accept-license
```

Replace the model ID with a registered adapter and give each run a new directory name. The tool verifies staged files and launches an isolated Chrome instance. GPU runs check hardware dispatch on a short sentence in a disposable worker. Timing uses a fresh, uninstrumented worker with the same settings. CPU runs initialize the timed worker directly. Both paths generate the complete first span once as a warm-up, then time one repeat. The timer covers the synthesis request through final CPU-readable PCM. Output validation, PCM hashing and WAV export follow the timing boundary. The network guard blocks requests outside the local benchmark origin. WebGPU requires observed hardware dispatch and the receipt identifies any configured WASM fallback.

`runs/<directory-name>/diagnostic.json` records the model revision, source commit, dirty-checkout status, Chrome version, hardware, span offsets, input and PCM hashes, and timing for both passes. `output.wav` contains all measured samples as mono PCM16. Compare measured generation time alongside output duration (`samples / sampleRate`) when models speak at different speeds. Share public comparisons only from clean source matching the recorded commit.

Use `--probe-only` to exercise backend initialization and short-sentence synthesis without publishing a passage time. Ming also accepts `--threads=1..16` for exploratory diagnostics. Check `configuration.settings.threads` in its receipt for the effective count. Use `--timeout-ms=1000..1800000` to set a shorter watchdog. The default is 30 minutes.
