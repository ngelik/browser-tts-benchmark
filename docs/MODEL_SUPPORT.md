# Voice and language support

Counts describe the pinned checkpoint and explicitly identified compatible catalog, not the coverage of this English benchmark. Every run tests one selected voice. Voice accents/locales do not count as additional languages. Unknown values must be null, not guessed.

<a id="paradee"></a>

## Paradee 8M INT8

Supported voices: **4**. Bundled voices: **4**. Supported languages: **1** (en).

Pinned benchmark checkpoint. Four embedded voices: af_heart, bf_isabella, am_puck, bm_fable. Only af_heart is benchmarked. Accents are not separate languages.

[Primary source 1](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.2/raw/ed2934d4df8a4fd891e29584c5e1104649409765/README.md), [Primary source 2](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.2/resolve/ed2934d4df8a4fd891e29584c5e1104649409765/config.json).

<a id="phonon"></a>

## Phonon 31M q8

Supported voices: **102**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint plus separately pinned compatible voice catalog. 102 embeddings in the separately pinned official catalog; only default is staged and benchmarked. Voice catalog locales do not expand this English checkpoint language support.

[Primary source 1](https://huggingface.co/gradium/phonon-31m-en/raw/92741c5b07d085ff840e26fea8ce43110b87852f/README.md), [Primary source 2](https://huggingface.co/gradium/phonon-voices/resolve/0ee17205f254b5abc43b266c8a0f215565c352f7/voices.jsonl).

<a id="leokani-7m"></a>

## Leokani 7M INT8

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint. One female American English voice; no other voice is exposed by this checkpoint.

[Primary source 1](https://huggingface.co/milliwattlabs/leokani-tts-7M/raw/ba0beb24f7b124dc1eb297ffc28d01db892462bd/README.md).

<a id="leokani-4.5m"></a>

## Leokani 4.5M INT8

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint. One female American English voice, Dala; the 7M and 4.5M checkpoints share the voice.

[Primary source 1](https://huggingface.co/milliwattlabs/leokani-tts-4.5M/raw/d9eb742dfb6567872fe451d559674ec42c32e6c8/README.md).

<a id="pivo-curated"></a>

## PiVo 1.4M curated (Pi voice)

Supported voices: **2**. Bundled voices: **2**. Supported languages: **1** (en).

Pinned benchmark checkpoint. Two embedded voices, Pi and Vo; this adapter benchmarks Pi only.

[Primary source 1](https://huggingface.co/empero-ai/PiVo-1.4M/raw/515d84fc3420da6ae138f1b81017fcbc24d622a8/README.md).

<a id="woof"></a>

## Underdog Woof one-voice (Isla)

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint. The pinned browser one-voice case uses Isla. The separate two-voice Juno/Mira release is not this measured case.

[Primary source 1](https://huggingface.co/ConwayResearch/Underdog-Woof/raw/be702960539777fc3f698e54335276a8391b00f9/README.md), [Primary source 2](https://github.com/ngelik/tts-bench/blob/8dae4a37e61e662037fd73a58c7254e1dac9dd89/web/workers/woof.mjs).

<a id="piper-en-gb-southern-english-female-low"></a>

## Piper en-GB Southern English Female low

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint. One British English speaker in this checkpoint. The broader Piper voice repository contains other independent models and languages; they are not included in this count.

[Primary source 1](https://huggingface.co/rhasspy/piper-voices/resolve/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx.json), [Primary source 2](https://huggingface.co/rhasspy/piper-voices/raw/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/MODEL_CARD).

<a id="supertonic-3"></a>

## Supertonic 3 FP32 (M3)

Supported preset voices: **10**. Bundled voices: **1**. Supported languages: **31** (en, ko, ja, ar, bg, cs, da, de, el, es, et, fi, fr, hi, hr, hu, id, it, lt, lv, nl, pl, pt, ro, ru, sk, sl, sv, tr, uk, vi).

Pinned Supertonic 3 checkpoint and ten supplied preset voice styles. Ten supplied presets F1–F5 and M1–M5; only M3 (Robert) is staged and tested in English. Language-agnostic mode na is not an additional language. Custom voice profiles are outside this preset count. Eight denoising steps and effective speed 1.05 match the linked demo defaults (UI speed 1.0).

[Primary source 1](https://huggingface.co/Supertone/supertonic-3/blob/3cadd1ee6394adea1bd021217a0e650ede09a323/README.md), [Primary source 2](https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles), [Primary source 3](https://huggingface.co/spaces/Supertone/supertonic-3/blob/4402acca094e2ff2b3dff446e0bf915f3fccc462/script.js).

<a id="kokoro-82m"></a>

## Kokoro 82M FP32

Supported voices: **54**. Bundled voices: **1**. Supported languages: **8** (en, es, fr, hi, it, ja, pt, zh).

Kokoro v1.0 model catalog; English browser runtime exercised. 54 named preset voices across 8 languages (English has US/GB accents). The export also contains a legacy af.bin alias, not a distinct named catalog voice. Official JS 1.2.1 exposes 28 English voices; only af_heart is staged and tested.

[Primary source 1](https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/VOICES.md).

<a id="mms-english"></a>

## MMS English FP32

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned English checkpoint, not the wider multilingual MMS family. Single English speaker. Official Xenova ONNX export removes training-only weights. Benchmark spells out numeric tokens before the official grapheme tokenizer to avoid dropping digits absent from its vocabulary.

[Primary source 1](https://huggingface.co/facebook/mms-tts-eng/blob/c71de0fe7204c83f1c10820a7d696d0b450048ba/README.md).

<a id="kitten-nano-0.8"></a>

## Kitten Nano 0.8 FP32

Supported voices: **8**. Bundled voices: **8**. Supported languages: **1** (en).

Pinned Kitten Nano 0.8 checkpoint and supplied voice archive. Eight preset voices; all styles bundled in voices.npz. Only Bella is tested. Official clean_text=false path with browser eSpeak and strict token mapping; no silent unknown-symbol skips.

[Primary source 1](https://huggingface.co/KittenML/kitten-tts-nano-0.8-fp32/blob/e73cfb095bd949c786ccdcf3b8ab04eb36c47442/config.json).

<a id="sano-amy"></a>

## Sano Amy 1.46M (English)

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned Sano Amy 1.46M checkpoint and FP32 browser bundle only. Amy browser bundle uses the official en-us eSpeak frontend and synthesizes at 22,050 Hz. The broader Sano family supports additional voices and languages; they are outside this pinned checkpoint.

[Primary source 1](https://huggingface.co/ampixa/sanoTTS/blob/4a8194aa1dd958033ee449b3ad30c37e536b216e/amy-en-1p46m/README.md), [Primary source 2](https://huggingface.co/ampixa/sanoTTS/blob/4a8194aa1dd958033ee449b3ad30c37e536b216e/web/voices/amy/meta.json).

<a id="inflect-micro-v2"></a>

## Inflect Micro v2 FP32

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned Inflect Micro v2 complete English checkpoint and official FP32 ONNX export. One fixed synthetic English voice; no reference recording or voice-cloning model required. 9,356,513 deployable parameters including waveform decoder. Browser port uses a disclosed seeded JavaScript normal-noise generator rather than NumPy bitwise parity.

[Primary source 1](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/blob/91b1ab6432323064ec0e8e9704d92fcecd24855f/README.md), [Primary source 2](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/blob/91b1ab6432323064ec0e8e9704d92fcecd24855f/onnx/SOURCE.json), [Primary source 3](https://huggingface.co/owensong/Inflect-Micro-v2/blob/9d862840734dcc53afb5d27ef468459daad020fa/README.md).

<a id="lfm3-audio-2b-gguf"></a>

## LFM3-Audio-2B (GGUF Q4_K_M / Q8_0)

Supported languages: **18** (en, ar, da, de, el, fi, fr, he, it, ja, ko, nl, pl, pt, es, sv, tr, zh). Fixed voice count: **unknown**. Male/female prompt controls are not a catalog of fixed voices; only American English female is tested.

18 spoken languages (English has US and UK locales). Female/male prompt controls do not establish a count of fixed voices. Benchmark selects American English female. Weight size includes complete pinned GGUF files, including modality components not exercised by TTS.

[Official checkpoint](https://huggingface.co/LiquidAI/LFM3-Audio-2B) · [Configuration](LIQUID_LFM3.md).

<a id="lfm3-omni-2b-gguf"></a>

## LFM3-Omni-2B (GGUF Q4_K_M / Q8_0)

Supported languages: **18** (en, ar, da, de, el, fi, fr, he, it, ja, ko, nl, pl, pt, es, sv, tr, zh). Fixed voice count: **unknown**. Male/female prompt controls are not a catalog of fixed voices; only American English female is tested.

18 spoken languages (English has US and UK locales). Female/male prompt controls do not establish a count of fixed voices. Benchmark selects American English female. Weight size includes complete pinned GGUF files, including modality components not exercised by TTS.

[Official checkpoint](https://huggingface.co/LiquidAI/LFM3-Omni-2B) · [Configuration](LIQUID_LFM3.md).

<a id="lfm3-audio-2b-fusor-q7-cpu"></a>

## LFM3-Audio-2B (Fusor q7 / CPU 6 threads)

Supported spoken languages: **18**. Fixed voice count: **unknown**. Male/female style controls are not fixed voice IDs. Only American English female is tested. The pinned q7 bundle runs on six CPU threads; no other language, voice or backend is implied by this measurement.

18 spoken languages; English has US and UK locales. Male/female prompt controls do not establish a fixed-voice count. Only American English female is tested. Six-thread Fusor WASM q7 configuration; different weights/runtime/sampling from the official WebGPU GGUF configuration.

[Bundle manifest](https://huggingface.co/fusorlabs/lfm3-audio-2b-web/blob/e273326dda2bb26870549ed7b39324ae086e5fe7/manifest.json) · [Runtime and configuration](LIQUID_LFM3_CPU.md).

<a id="lfm3-omni-2b-fusor-q7-cpu"></a>

## LFM3-Omni-2B (Fusor q7 / CPU 6 threads)

Supported spoken languages: **18**. Fixed voice count: **unknown**. Male/female style controls are not fixed voice IDs. Only American English female is tested. The pinned q7 bundle runs on six CPU threads; no other language, voice or backend is implied by this measurement.

18 spoken languages; English has US and UK locales. Male/female prompt controls do not establish a fixed-voice count. Only American English female is tested. Six-thread Fusor WASM q7 configuration; different weights/runtime/sampling from the official WebGPU GGUF configuration.

[Bundle manifest](https://huggingface.co/fusorlabs/lfm3-omni-2b-web/blob/09f4fc6ddbbb3cc6cd30f74b1e76cc894f4901f4/manifest.json) · [Runtime and configuration](LIQUID_LFM3_CPU.md).

<a id="mach-boom"></a>

## Mach Boom 3.5-bit browser port

English only (**1 language**). **4 named voices** ship in the
[pinned release](https://huggingface.co/SyzygyResearch/Mach-Boom/blob/01860b06bdf8498761255ad1c64b99980b96486d/voices/voices.jsonl):
Zoey, Juniper, Everly and Harper. Only Zoey is staged and measured (**1 bundled
benchmark voice**). Upstream also supports compatible Phonon voice files, but
that external catalog is not included in this four-voice count. CPU WebAssembly
is an experimental local port; no WebGPU inference path is implemented.

<a id="pocket-tts-100m-english-int8"></a>

## Original Pocket TTS English INT8/FP32

The selected `english_2026-04` checkpoint supports **1 language (English)** and
**8 bundled preset voices**: alba, azelma, cosette, eponine, fantine, javert, jean
and marius. Only **alba** is tested. Counts come from the
[pinned bundle metadata](https://huggingface.co/KevinAHM/pocket-tts-onnx/blob/58a6d00cf13d239b6748cb0769f35c580a8f606c/onnx/english_2026-04/bundle.json)
and [browser voice bundle](https://huggingface.co/spaces/KevinAHM/pocket-tts-web/tree/d0c0c79b7712256a32d691c67f20b8ae2e020d00/onnx/english_2026-04).
The broader export family advertises six languages; that is not the language
count for this English-only configuration. Arbitrary voice cloning is also not
counted as a finite preset catalog. This is the original approximately 100M model
[family described by Kyutai](https://kyutai.org/tts/) and shown in the screenshot,
not the newer 18.2M Pocket model.

<a id="audio8-realistic-0.6b-int4"></a>

## Audio8 TTS Realistic Air 0.6B

Edge0 lists **23 languages** and supports open-ended voice conditioning. This configuration uses English and a reference-free voice with **zero bundled presets**. [Checkpoint and export details](AUDIO8_REALISTIC.md).

<a id="fun-cosyvoice3-0.5b-2512"></a>

## Fun-CosyVoice3 0.5B (2512)

The checkpoint supports **9 languages** and open-ended reference voices. The browser export bundles **one English preset**, derived from LibriTTS-R speaker 4446. [Checkpoint, preset and license details](COSYVOICE3.md).
