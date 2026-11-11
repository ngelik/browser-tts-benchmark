# Code, models and publication

The MIT license applies to original harness code, benchmark result metadata,
documentation and the original English fixture. Downloaded components retain
their own licenses. A benchmark result is not a commercial-use clearance.

| Component | Recorded license / publication boundary |
|---|---|
| Phonon 31M weights, tokenizer, default voice | Apache-2.0 at the pinned revision |
| Official `phonon-tts` runtime | MIT OR Apache-2.0; compiled dependencies retain notices |
| Paradee weights | Apache-2.0 |
| Vendored Kokoro frontend / Paradee Misaki mapping | Apache-2.0; pinned sources, changes and full licenses in `web/paradee/` |
| Paradee browser phonemizer | Package Apache-2.0; compiled eSpeak NG is GPL-3.0; do not treat the whole stack as MIT |
| Derived Leokani config/vocabulary in `web/data/leokani/` | CC BY-NC 4.0; retain Milliwatt Labs attribution and adjacent change/source notice |
| Leokani 7M / 4.5M weights | CC BY-NC 4.0; commercial use needs additional rights |
| Leokani G2P | MIT code; CC BY 4.0 weights/lexicon |
| Leokani browser engine | Grant for the exact historical engine was not separately established; do not vendor it under MIT |
| Adapted PiVo frontend in `web/pivo/text.mjs` | Apache-2.0; source/change record and upstream notices in `web/pivo/` |
| PiVo | Apache-2.0 acoustic model/code, BSD/Opus FARGAN-derived component, CMU dictionary notices |
| Woof historical one-voice assets | Underdog noncommercial terms; exact one-voice lineage is less explicit than newer releases; weights/runtime assets remain excluded; opt-in attributed evaluation recordings are documented in audio/README.md |
| Piper en-GB Southern English Female low weights | The pinned card lists the training dataset as CC BY-SA 4.0 and says it was fine-tuned from Ryan low. The Ryan card lists its dataset as CC BY-NC-SA 4.0. The cards do not state a separate model or output license; model/runtime redistribution remains excluded; approved evaluation audio retains these notices separately from the code license. |
| Piper official browser files and eSpeak data | `rhasspy/piper-samples` at `da672d1157136d07365790f51da3357a17cf9650` has no separate license file in its pinned tree. Its JavaScript, WebAssembly, and data bundle remain in the ignored local cache; do not redistribute the runtime. The eSpeak NG COPYING file is staged for reference, but it does not establish terms for the overall browser bundle. |
| Supertonic 3 model and preset voice styles | OpenRAIL-M at the pinned revision; use-based restrictions apply. The licensor claims no rights in outputs except as stated in the license, and users remain responsible for outputs and their uses. Model/voice assets remain in the ignored cache. |
| Adapted official Supertonic browser helper | MIT, Supertone Inc.; retained license and exact source/change record in `web/supertonic/`. |
| ONNX Runtime Web | MIT, with third-party notices |

The small Apache-2.0 frontend source files in `web/paradee/` retain separate
license files and a source/change manifest. They are exceptions to the root MIT
license. The small derived Leokani configuration/vocabulary files in
`web/data/leokani/` retain CC BY-NC 4.0 terms and attribution.
Restricted or unclear-license runtime files belong only in a local ignored cache.
Use upstream download/import instructions and read their terms before running.
Accepting an upstream license is a local decision, not a grant from this project.
Do not upload weights, voices, minified upstream engines or browser profiles.
Explicitly authorized evaluation audio uses the documented audio manifest,
small in-repository clips and full-recording release assets. Preserve attribution
and applicable model/output terms; Woof requires credit wherever outputs play.
See [listening provenance and terms](../audio/README.md).

Changing a frontend to avoid a license obligation changes the implementation.
Benchmark it as a new configuration and compare its outputs before substituting it.

Primary sources:

- [Phonon model](https://huggingface.co/gradium/phonon-31m-en)
- [Phonon runtime](https://www.npmjs.com/package/phonon-tts/v/0.6.0)
- [Paradee model](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.2)
- [Phonemizer source](https://github.com/xenova/phonemizer.js)
- [eSpeak NG license](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)
- [Leokani 7M](https://huggingface.co/milliwattlabs/leokani-tts-7M)
- [Leokani 4.5M](https://huggingface.co/milliwattlabs/leokani-tts-4.5M)
- [PiVo](https://huggingface.co/empero-ai/PiVo-1.4M)
- [Woof](https://underdog.ai/woof)
- [Piper en-GB model card](https://huggingface.co/rhasspy/piper-voices/blob/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/MODEL_CARD)
- [Piper Ryan low ancestry model card](https://huggingface.co/rhasspy/piper-voices/blob/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_US/ryan/low/MODEL_CARD)
- [Piper browser sample source at the pinned revision](https://github.com/rhasspy/piper-samples/tree/da672d1157136d07365790f51da3357a17cf9650)
- [ONNX Runtime](https://github.com/microsoft/onnxruntime/blob/v1.23.2/LICENSE)

- [Supertonic 3 model license](https://huggingface.co/Supertone/supertonic-3/blob/3cadd1ee6394adea1bd021217a0e650ede09a323/LICENSE)
- [Official Supertonic browser source](https://github.com/supertone-oss-archive/supertonic/tree/1e9799e964ea4c0dad7cde993b65c3c813a7b373/web)

## 2026-11-10 discovery cohort

| Component | Terms and source |
| --- | --- |
| Kokoro 82M v1 model and voice styles | [Apache-2.0 model card](https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/README.md). Weights/styles remain in ignored cache. |
| Kokoro official browser helper | Apache-2.0, hexgrad/Xenova. Readable adapted source, full license and change notice retained in `web/kokoro/`. |
| Kitten Nano 0.8 FP32 and voice archive | [Apache-2.0 model card](https://huggingface.co/KittenML/kitten-tts-nano-0.8-fp32/blob/e73cfb095bd949c786ccdcf3b8ab04eb36c47442/README.md). Weights/styles remain in ignored cache. |
| Kitten ONNX frontend port | Apache-2.0 upstream contract/token mapping; attribution and license retained in `web/kitten/`. Browser integration is original benchmark code. |
| MMS English | [CC BY-NC 4.0 model card](https://huggingface.co/facebook/mms-tts-eng/blob/c71de0fe7204c83f1c10820a7d696d0b450048ba/README.md). Noncommercial evaluation; Facebook/Meta MMS attribution retained. [Pinned ONNX export](https://huggingface.co/Xenova/mms-tts-eng/tree/3f8955a2adbd6487ce57420620d4916de22b9dac). |
| Transformers.js 3.5.1 | Apache-2.0. Its embedded ONNX Runtime is pinned separately from the existing benchmark's ORT 1.23.2; exact runtime MIT license and third-party notices are staged with its assets. |

The new recordings are authorized benchmark outputs with model/source attribution;
listing a model license does not claim it settles every output or voice right.
The small Apache-2.0 adapted source files are exceptions to the repository's root
MIT license. No model weights or bundled upstream engines are committed.

Sano Amy's pinned [model card](https://huggingface.co/ampixa/sanoTTS/blob/4a8194aa1dd958033ee449b3ad30c37e536b216e/README.md)
lists GPL-3.0; the official `sanotts-web@0.3.0` browser runtime is
GPL-3.0-or-later. Runtime and model bytes stay in ignored cache with the GPL
text staged separately. The project's MCU/mobile MIT carve-outs do not cover
this browser runtime. The root MIT license does not relicense those components;
any redistribution of a combined browser application must respect their terms.

Inflect Micro v2's [official package](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/tree/91b1ab6432323064ec0e8e9704d92fcecd24855f)
is Apache-2.0; the VITS/Tacotron-derived symbol inventory retains its MIT notice.
The browser frontend port retains notices under `web/inflect/`. The fixed voice
is described upstream as synthetic, with no reference recording required.
The model's private training recipe/data are not fully released; open model
weights do not imply an open training corpus. Weights remain in ignored cache.

## Liquid AI LFM3 Audio / Omni GGUF

The official weights use **LFM Open License v1.0**, not an OSI-approved permissive
license. The license contains a USD 10 million annual revenue threshold for
commercial use; retain the upstream terms and notices and assess the exact use.
The pinned licenses are fetched with the weights. Sources:
[Audio terms](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF/blob/39670cb5c42e9c4bfe046519ba7ffbe47f9552ad/LICENSE),
[Omni terms](https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/blob/d508b88f08a5b4286f2d2805a6a8d69a0ff44c72/LICENSE).

The official WebGPU Space provides a JavaScript runtime without separately
established redistribution terms. It is pinned and downloaded into ignored local
storage; this repository does not relicense or redistribute that bundle or the
weights. The original benchmark adapter is MIT. Recordings use the benchmark's
original article and retain model attribution/terms in the audio manifest.
See [configuration and reproducibility details](LIQUID_LFM3.md).
