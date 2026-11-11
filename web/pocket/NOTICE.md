# Pocket TTS browser source notice

The inference flow and worker frontend in `upstream-worker.mjs` are adapted from
the Apache-2.0 browser demo at
[`KevinAHM/pocket-tts-web`](https://huggingface.co/spaces/KevinAHM/pocket-tts-web/tree/d0c0c79b7712256a32d691c67f20b8ae2e020d00),
source revision `d0c0c79b7712256a32d691c67f20b8ae2e020d00`. The unmodified
downloaded `inference-worker.js` SHA-256 is
`dace0a022e17dffcf60fdb7b86e49facf093f709b352fb306c1d6641ae0f5366`; the full
Apache-2.0 text is included as `LICENSE-upstream` and hash-pinned as a local
license asset. The tracked worker changes only the asset/runtime import paths,
explicit ONNX provider setup, benchmark RPC wrapping, temporary tensor cleanup,
and an explicit failure when an internal utterance reaches the upstream
500-frame ceiling without EOS.

The benchmark loads a deterministic Unigram tokenizer conversion derived from
the export's public `tokenizer.model` and audited against the original
SentencePiece implementation; the conversion is reproducible with
[`tools/build-pocket-tokenizer.py`](../../tools/build-pocket-tokenizer.py). The
derived tokenizer JSON is model data and retains the model's CC-BY-4.0 terms.
Chrome uses the project's existing pinned Transformers.js 3.5.1 runtime with
remote model loading disabled. Model graphs come from the public
`KevinAHM/pocket-tts-onnx` export at revision
`58a6d00cf13d239b6748cb0769f35c580a8f606c`. The bundled `voices.bin` comes from
the pinned browser Space because it is absent from the public model-repository
English tree. The browser Space records that graph files match the export;
graph inspection shows four dynamically quantized graphs and one FP32 text
conditioner, despite all five filenames carrying an `_int8` suffix. The export
card declares CC-BY-4.0 and links the upstream Pocket TTS model. The benchmark
only uses the bundled `alba` voice and does not upload, synthesize or publish a
voice clone.

The upstream browser worker uses ONNX Runtime Web 1.20.0 and selects a
hardware-concurrency-based WASM thread count capped at eight. This adapter uses
the Pocket-specific ONNX Runtime Web 1.31.1 pin and fixes the CPU/WASM path to one
thread for the benchmark baseline; this runtime and thread-policy change is
explicit and does not alter model weights.

The original `english_2026-04` five-graph bundle, preset voices, config, source
tokenizer and BOS data totals 198,645,558 bytes. Chrome loads the same files but
uses the derived 116,539-byte tokenizer JSON in place of the 59,339-byte source
tokenizer, for a 198,702,758-byte inference bundle. The screenshot associated
with discovery described the model as 225.5 MB; that figure is not the byte
size of this pinned public ONNX bundle and is not used as its measured model
size. The pinned export card does not declare a parameter count, so this notice
records the exact checkpoint and file bytes rather than inferring a parameter
count from the screenshot.

The browser demo advertises CPU/WASM support. WebGPU is an explicit experimental
ONNX Runtime provider configuration in this adapter and is eligible for a
result only after Chrome demonstrates real compute dispatch and returns
CPU-readable PCM. Provider availability alone does not establish GPU support.
