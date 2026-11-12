# Listening samples

These recordings are synthetic speech from the benchmark's original 20,000-character
English article. They are actual scored outputs, not upstream demo recordings.
All model/backend samples are linked in the root README **Reference results** section.

[**Open the listening room**](https://ngelik.github.io/browser-tts-benchmark/audio/) to play all published clips directly in your browser. Each README **Listen** link selects its exact recording. GitHub strips audio controls from README previews, so the players live on GitHub Pages. No installation or sign-in is needed; clips load only when played. The hosted page serves existing recordings and performs no synthesis.

For local playback, clone the repository, run `npm ci`, then:

```sh
npm run listen
```

Open the printed loopback URL. Filter by model/backend and play clips in Chrome.
This serves static local files only; it performs no synthesis and sends no text
or audio to an external service. Playback does not enter timing measurements.
The clips can also be opened directly from `audio/samples/` after cloning.
Full article WAV files are attached to this repository's `benchmark-audio-v1`
GitHub release and linked beside each clip.

## Publishing the listening page

`npm run listen:build` verifies every recording and prepares only the player,
manifest and approved clips in the ignored `.cache/listening-site/` directory.
The Pages workflow deploys this directory after changes reach `main` through a
reviewed PR. No model weights, browser profiles or raw runs enter the site.
New result PRs must include their clip, manifest and regenerated README; deployment
then includes the new recording automatically. Full recordings remain release assets.

## Provenance and reproduction

`manifest.json` binds every clip to a published result, scored trial index, voice,
full WAV hash and byte count. A clip contains the first 30 seconds (or the entire
recording if shorter), copied as PCM16 with no normalization, editing, transcoding
or re-synthesis. Only its RIFF size fields change. The clip limit is 3 MB, sufficient for 30 seconds of mono PCM16 up to 48 kHz. The source full WAV must match
an actual scored receipt before the tool will create the clip.

```sh
npm run audio -- add --result results/RUN/result.json --wav /path/to/full.wav --model MODEL --backend cpu
npm run audio -- check
npm run reference
```

Audio publication requires authorization and review of the source terms. The tool
prepares files only; it does not upload automatically. Upload the exact full WAV
to the manifest's uniquely named release asset, never overwrite a different file
under that name, and verify its download digest. Include the clip, manifest and
updated Reference results in the result PR. Model weights and runtimes remain
excluded from Git. CI verifies clip integrity and its declared receipt binding;
it does not download every large release WAV or certify perceptual quality.

## Attribution and terms

The root MIT license does **not** relicense generated recordings, voice likenesses,
models or upstream datasets. Per-recording attribution, model terms and primary
source URLs are retained in `manifest.json` and displayed by the player. The
recordings are provided for non-commercial benchmark evaluation; this is not a
commercial-use clearance or a grant of rights in upstream voices.

- Phonon: Gradium; Pocket TTS and Mimi lineage by Kyutai. Pinned weights Apache-2.0.
- Paradee: Sahil Mahendrakar; Kokoro-82M teacher by hexgrad. Pinned model Apache-2.0.
- Leokani: Milliwatt Labs; Kokoro-generated synthetic training speech. CC BY-NC 4.0 model terms; synthetic outputs retain the model's watermark.
- PiVo: Leon Lehmann / Empero Research; Apache-2.0 acoustic component and BSD FARGAN-derived vocoder.
- **Voice by Underdog Woof.** Non-commercial terms and output attribution apply; see the pinned license/notice links in the asset manifest.
- Supertonic 3: Supertone Inc., M3 preset voice. OpenRAIL-M model terms include use-based restrictions and output responsibilities; the code license is separate.
- Piper: rhasspy/Piper Southern English Female low. The card names CC BY-SA 4.0 training data and Ryan low ancestry (whose card names CC BY-NC-SA 4.0 data). Neither card supplies a separate output license. These notices are retained without treating the code's MIT license as an output license.


- Kokoro 82M: hexgrad, `af_heart` English voice; Apache-2.0 model terms, with official JavaScript source attribution retained.
- Kitten Nano 0.8: KittenML, Bella preset; Apache-2.0 model terms, with the pinned frontend implementation attributed.
- Sano Amy: ampixa, Amy English checkpoint; GPL-3.0 model card and GPL-3.0-or-later browser runtime terms are documented separately.
- Inflect Micro v2: Owen Song, fixed synthetic English voice; Apache-2.0 model/export terms and MIT symbol-inventory attribution.
- MMS English: Meta, English single-speaker checkpoint; CC BY-NC 4.0 model terms. Broader MMS language coverage is not claimed for this checkpoint.
- Mach Boom: SyzygyResearch, tested Zoey voice; the Apache-2.0 checkpoint notice credits Gradium Phonon and Kyutai Pocket TTS/Mimi. This result uses an experimental Chrome Pyodide/NumPy WebAssembly port, not the upstream Linux/x86 optimized runtime. Its WebGPU path was unsupported in this campaign.
- Pocket TTS: Kyutai checkpoint through KevinAHM's public ONNX export and browser frontend, tested `alba` preset. CC-BY-4.0 and upstream prohibited-use conditions apply. Four of the five ONNX graphs are dynamically quantized; the text conditioner is FP32. CPU uses one-thread WASM; the experimental WebGPU path used explicit WebGPU/WASM providers, actual dispatch proof and awaited CPU-readable PCM. GPU timing is not GPU-exclusive.

See [component licensing](../docs/LICENSING.md) and the linked primary sources.
No listening quality score is inferred from speed, waveform hashes or file size.

- LFM3 Audio and Omni: Liquid AI; American English female prompted style. Official GGUF WebGPU and Fusor q7 CPU configurations are distinguished in every recording. LFM Open License v1.0 applies; runtime licenses do not relicense weights or recordings. Very short output spans, where observed, are disclosed with the results; audio validity does not verify complete reading.
