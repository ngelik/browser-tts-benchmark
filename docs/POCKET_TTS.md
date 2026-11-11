# Original Pocket TTS browser benchmark

This configuration evaluates the original approximately 100M Pocket TTS family
[described by Kyutai](https://kyutai.org/tts/) and shown in the screenshot, using the public community
[KevinAHM ONNX export](https://huggingface.co/KevinAHM/pocket-tts-onnx/tree/58a6d00cf13d239b6748cb0769f35c580a8f606c)
and [browser runtime](https://huggingface.co/spaces/KevinAHM/pocket-tts-web/tree/d0c0c79b7712256a32d691c67f20b8ae2e020d00).
It does not substitute the newer 18.2M Pocket model. These are community browser
artifacts, not an official Kyutai browser runtime. No gated original weights are
fetched. We use the selected April 2026 English checkpoint and the alba preset.

The five ONNX files total **146,155,686 bytes**. With `bundle.json`, SentencePiece
model, BOS seed and all eight bundled voice states, the selected inference data
totals **198,645,558 bytes** in the original bundle. The browser port uses a
116,539-byte JSON conversion of the same tokenizer; Transformers.js and ONNX
Runtime add further bytes. Original tokenizer/source files are also staged for
reproduction and auditing. The screenshot's approximately 226 MB is not an exact match for
this pinned export; do not equate it to our weights or transfer-size columns.
Decimal MB means 1,000,000 bytes. Hashes and asset categories are in the manifest.

The pinned files use **mixed INT8/FP32**. Direct ONNX 1.20.1 inspection found
`MatMulInteger` in flow main (26 nodes), flow flow (26), MIMI decoder (8) and MIMI
encoder (9), with both INT8 and FP32 initializers in each. The text conditioner
contains one FP32 initializer and no quantized operators. The model card's older
statement that the encoder remains FP32 does not describe these exact files;
filenames alone are not precision evidence.

The original Emscripten tokenizer requires dynamic JavaScript evaluation, which
the benchmark CSP forbids. The port derives a Unigram JSON tokenizer from the
public SentencePiece model and uses Transformers.js 3.5.1 with punctuation-space
cleanup disabled. It keeps the security policy unchanged. The text-only oracle
runs the pinned original JavaScript frontend with native SentencePiece 0.2.1;
the Chrome audit checks every prepared span, internal utterance, token sequence,
decoded text and end-of-speech frame setting. Derived tokenizer data retains model
terms rather than the repository MIT code license.

## Reproduce

```sh
npm ci
npm run assets -- fetch --model pocket-tts-100m-english-int8 --accept-license
node tools/check-pocket-tokenizer.mjs
npm run bench -- run --model pocket-tts-100m-english-int8 --backend cpu --smoke --accept-license
npm run bench -- run --model pocket-tts-100m-english-int8 --backend webgpu --smoke --accept-license
npm run bench -- run --model pocket-tts-100m-english-int8 --backend cpu --scenario warm --accept-license --machine "Your actual hardware" --note "Actual power/background conditions"
npm run bench -- run --model pocket-tts-100m-english-int8 --backend webgpu --scenario warm --accept-license --machine "Your actual hardware" --note "Actual power/background conditions"
npm run bench -- run --model pocket-tts-100m-english-int8 --backend cpu --scenario cached --resources --repetitions 1 --accept-license --machine "Your actual hardware"
```

Run a matching WebGPU RAM diagnostic only if that backend completes actual
hardware inference. Full scores require clean published source, the canonical
20,000-character article, one excluded full warmup and five scored repetitions.
No dedicated cold-load checks are included in this campaign. Keep initialization
and backend failures visible; never substitute CPU timing for a GPU request.

The adapter passes all 93 canonical spans intact into the pinned frontend, which
normalizes text and can split spans into smaller sentence/token-limited utterances.
The frontend's voice, sampling, stopping, and inserted inter-utterance silence are
recorded in the receipt settings. Output is actual 24 kHz PCM. A frame-limit exit
without normal EOS fails the run rather than publishing truncated audio.

GPU requests use ONNX Runtime WebGPU with explicit WASM operator fallback and
must demonstrate real hardware compute dispatch during a separate untimed probe.
This is mixed execution, not GPU-exclusive inference. The CPU path uses one WASM
thread. Both Pocket backends use ONNX Runtime Web **1.31.1**, installed under the
isolated `onnxruntime-web-pocket` npm alias; other model runtime pins are
unchanged. The upstream Space used 1.20.0 with adaptive thread count. A 1.23.2
GPU diagnostic failed on an empty tensor, while 1.31.1 completed hardware
inference after serializing its five session creations. Session initialization
is excluded from warm timing. No node-placement override is used. Temporary tensors are released after consumption and the owned worker is
terminated on disposal. Only runtime/resource handling is adapted; the pinned
frontend's synthesis equations and preprocessing are retained.

[Model terms](LICENSING.md#original-pocket-tts-english-onnx) apply separately from
the repository code license. [Voice/language scope](MODEL_SUPPORT.md#pocket-tts-100m-english-int8)
distinguishes the selected English checkpoint from the broader family. Audio and
PCM coverage checks do not establish pronunciation or transcript accuracy; listen
to the published measured recordings when assessing speech quality.

To independently verify the tokenizer conversion and reference, use a local
Python virtual environment with `sentencepiece==0.2.1` and `protobuf==7.36.2`:

```sh
/path/to/venv/bin/python tools/build-pocket-tokenizer.py
node tools/pocket-tokenizer-oracle.mjs --python /path/to/venv/bin/python
```

Both tools perform only text processing, never native speech generation. They
check committed artifacts by default; `--write` explicitly regenerates them for
review. Normal benchmark execution needs no host Python dependency.
