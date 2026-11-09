# Listening samples

These recordings are synthetic speech from the benchmark's original 20,000-character
English article. They are actual scored outputs, not upstream demo recordings.
All model/backend samples are linked in the root README **Reference results** section.

For an interactive listening room, clone the repository, run `npm ci`, then:

```sh
npm run listen
```

Open the printed loopback URL. Filter by model/backend and play clips in Chrome.
This serves static local files only; it performs no synthesis and sends no text
or audio to an external service. Playback does not enter timing measurements.
The clips can also be opened directly from `audio/samples/` after cloning.
Full article WAV files are attached to this repository's `benchmark-audio-v1`
GitHub release and linked beside each clip.

## Provenance and reproduction

`manifest.json` binds every clip to a published result, scored trial index, voice,
full WAV hash and byte count. A clip contains the first 30 seconds (or the entire
recording if shorter), copied as PCM16 with no normalization, editing, transcoding
or re-synthesis. Only its RIFF size fields change. The source full WAV must match
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
- Piper: rhasspy/Piper Southern English Female low. The card names CC BY-SA 4.0 training data and Ryan low ancestry (whose card names CC BY-NC-SA 4.0 data). Neither card supplies a separate output license. These notices are retained without treating the code's MIT license as an output license.

See [component licensing](../docs/LICENSING.md) and the linked primary sources.
No listening quality score is inferred from speed, waveform hashes or file size.
