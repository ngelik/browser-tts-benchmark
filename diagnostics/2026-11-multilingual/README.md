# English first-span recordings

The paired recordings use the opening 233 characters of `english-20k-v1`. Each model renders a short capability probe, the full first span as a warm-up, and one timed repeat. The WAV contains the timed repeat. Playback duration comes from its frame count and sample rate. The development observations in the JSON include their own warm-up and input metadata.

The [run procedure](../../docs/FIRST_SPAN_DIAGNOSTIC.md) produces a WAV and a JSON receipt. Each entry in [audio.json](audio.json) records the public WAV URL, original receipt digest, model terms and source attribution. The corresponding receipts are stored in [receipts](receipts/). [Full-article results](../../README.md#reference-results) use all 93 spans and five timed repetitions.

Run `npm run listen:build` to verify the recorded source, fixture, provider and audio checksum and stage the WAVs for the inline players. The script reuses verified files in `.cache/first-span-2026-11/`. A clean source reproduction needs the public Git history, the model and runtime assets for the selected adapter, and Chrome on the M1 Pro baseline.
