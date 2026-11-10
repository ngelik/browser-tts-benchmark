# Supertonic browser helper provenance

`helper.mjs` is derived from the MIT-licensed upstream `web/helper.js` at
[`supertone-oss-archive/supertonic` commit `1e9799e964ea4c0dad7cde993b65c3c813a7b373`](https://github.com/supertone-oss-archive/supertonic/blob/1e9799e964ea4c0dad7cde993b65c3c813a7b373/web/helper.js).
The original upstream file is 19,345 bytes with SHA-256
`a8200d50e2eabeb18c777b218ecb5214fd33fb623477e8b8378b4696179d125a`.

Two local source-only edits adapt it to this benchmark: the ONNX Runtime bare
import points to `./ort-runtime.mjs`, and trailing whitespace is stripped.
Restoring the original import in the vendored copy produces the whitespace-
normalized upstream SHA-256
`8d254a8e900a2553c987efbd8d9eabd084819e79a286f1a008e8c8ecdeabe08d`.
Synthesis, normalization, duration prediction, latent sampling and paragraph/
sentence chunking logic remain upstream helper code. The canonical 93 source
spans yield 111 internal utterances; the helper adds 0.3 seconds between the 18
intra-span splits. The adapter's `audio.mjs` applies the same output trim as
the pinned official `web/main.js` (`floor(sampleRate * duration[0])`, then
`slice(0, wavLen)`); the helper itself does not perform this trim. The original
`web/main.js` SHA-256 is
`084e8392dc3f44ebb3c6f2939a250fc66f74f54363410ad6022613b39053e55c`.
`ort-runtime.mjs` tracks temporary helper tensors and session outputs for
cleanup.

The included [`LICENSE`](./LICENSE) is the upstream repository's MIT license
for source code. Model and voice terms are documented separately in the
benchmark's licensing record.
