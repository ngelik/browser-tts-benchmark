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
