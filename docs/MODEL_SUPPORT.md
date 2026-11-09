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

[Primary source 1](https://huggingface.co/ConwayResearch/Underdog-Woof/raw/be702960539777fc3f698e54335276a8391b00f9/README.md), [Primary source 2](https://github.com/ngelik/browser-tts-benchmark/blob/8dae4a37e61e662037fd73a58c7254e1dac9dd89/web/workers/woof.mjs).

<a id="piper-en-gb-southern-english-female-low"></a>

## Piper en-GB Southern English Female low

Supported voices: **1**. Bundled voices: **1**. Supported languages: **1** (en).

Pinned benchmark checkpoint. One British English speaker in this checkpoint. The broader Piper voice repository contains other independent models and languages; they are not included in this count.

[Primary source 1](https://huggingface.co/rhasspy/piper-voices/resolve/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx.json), [Primary source 2](https://huggingface.co/rhasspy/piper-voices/raw/e7229f7d33a10e145e109b886d661984201ac3c4/en/en_GB/southern_english_female/low/MODEL_CARD).
