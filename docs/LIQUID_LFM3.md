# Liquid AI LFM3 speech evaluation

The [LFM3 announcement](https://www.liquid.ai/blog/lfm3) includes six models.
**LFM3-Audio-2B** and **LFM3-Omni-2B** generate speech. The text, VL and decision
variants are not separate TTS candidates. These approximately two-billion-parameter
multimodal models are a larger-model extension of the tiny-TTS benchmark.

## Official WebGPU configurations

`lfm3-audio-2b-gguf` and `lfm3-omni-2b-gguf` use the unmodified
[official WebGPU runtime](https://huggingface.co/spaces/LiquidAI/LFM3-Omni-2B-WebGPU)
pinned to `9c2fb176f4c222da394e8037d3c0d0837f70b978`. The same speech architecture
loads both official GGUF checkpoints; both paths are checked in headed Chrome.
The runtime is fetched to ignored local storage, not copied into this MIT repository.
All URLs, byte counts and SHA-256 digests are recorded in `assets.lock.json`.

The language backbone uses Q4_K_M weights; the multimodal projection file uses
Q8_0. Model size includes both complete selected GGUF files, including input
modality components that are not exercised by TTS. Local static HTTP range
requests load these large files without buffering an entire copy in the Node
server. Node does not run inference.

The system prompt is `Perform TTS in American English using a female voice.`
Each unchanged canonical source span is passed as a user message. The session is
reset for each span; no previous sentence or output is added to its context.
Generation uses audio mode, 4,096 context tokens and a 2,048 output-token ceiling.
Input capacity is checked before generation. Any non-stop completion, empty or
nonfinite PCM fails the attempt; cap-terminated output is not accepted as a score.
A normal stop alone does not establish that every word was spoken.
The output is mono 24 kHz. The first streamed PCM event is observed separately
from completion of the full source span.

The official speech decoder retains its stochastic defaults. Its high-level
session API does not expose a speech seed; `do_sample: false` governs text/control
tokens and does not make speech deterministic. Replicate timings and published
recordings therefore describe actual generated samples, not bitwise reproducibility.
GPU compute dispatches are counted during a separate untimed synthesis probe,
then hooks are removed. Tokenization, scheduling and PCM handling run in CPU
JavaScript; these are not GPU-only end-to-end timings.

## CPU feasibility

The official ONNX exports are not a drop-in WASM alternative. Upstream's
[ORT Web compatibility tests](https://github.com/Liquid4All/onnx-export/blob/main/tests/web/README.md)
document that quantized LFM3 decoder graphs need `GatherBlockQuantized`, which is
absent from the tested WASM backend. A native Python/ORT CPU result must not be
reported as browser CPU. Any community CPU runtime uses its own explicit model
configuration, asset closure and precision; do not compute a controlled CPU/GPU
speedup across different weight formats.

The browser CPU alternative is documented in [Fusor q7 CPU configurations](LIQUID_LFM3_CPU.md).

## Reproduce

```sh
npm ci
npm run assets -- fetch --model lfm3-audio-2b-gguf --accept-license
npm run bench -- run --model lfm3-audio-2b-gguf --backend webgpu --smoke --accept-license
npm run bench -- run --model lfm3-audio-2b-gguf --backend webgpu --scenario warm --accept-license --machine "MacBook Pro / Apple M1 Pro / 16 GiB" --note "Record actual power and background conditions"
npm run bench -- run --model lfm3-audio-2b-gguf --backend webgpu --scenario cached --resources --repetitions 1 --accept-license --machine "MacBook Pro / Apple M1 Pro / 16 GiB"
```

Substitute `lfm3-omni-2b-gguf` for Omni. Warm scores require a clean committed
checkout, one complete excluded warmup and five complete scored articles.
Each article is exactly 20,000 English characters / 93 canonical spans.
Cold-load checks are excluded from this campaign. Memory is a separate sampled
Chrome-process-tree diagnostic, including the browser baseline; it is not VRAM.
Audio validity does not establish pronunciation quality or faithful reading.
Listen to the receipt-bound recordings before making quality claims.
