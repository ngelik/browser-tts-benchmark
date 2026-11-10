# Inflect Micro v2 browser integration

The selected checkpoint is the Apache-2.0 FP32 ONNX export from
[`owensong/Inflect-Micro-v2-ONNX`](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX),
pinned at revision `91b1ab6432323064ec0e8e9704d92fcecd24855f`. Its provenance
identifies the source checkpoint at `3e8c567f9bce1a309eea12d38ca9fbf7050df72e`
and credits the ONNX conversion from
[`robertbak/webtts-inflect`](https://github.com/robertbak/webtts-inflect),
commit `60832b1978115e4ed7fdddce4d9b9fd9161f9fe7`. Its Apache-2.0 browser
implementation informed the integration and is retained as a source reference;
this repository's adapter and frontend are an independent implementation.

The worker uses the two pinned ONNX graphs with ONNX Runtime Web 1.23.2 and the
locally staged Apache-2.0 `phonemizer` JavaScript package, which embeds eSpeak-NG
data and code under its GPL-3.0-or-later terms. Model weights and upstream
runtime packages remain in the ignored asset cache. The repository contains an
independent JavaScript port of the pinned VITS text frontend and the exact
ordered symbol inventory; it does not copy upstream Python files.

The copied Apache-2.0 model/export license is in `notices/LICENSE-Inflect-ONNX`.
The copied MIT license for the model's ordered symbol inventory is in
`notices/LICENSE-Inflect-symbols` (copyright Keith Ito, 2017). Runtime package
and phonemizer license files remain with their separately staged assets.

The text frontend preserves the Python normalizer's word overrides, number/date/
time expansion, punctuation transformations, two phoneme overrides, stress and
strict symbol mapping. A 97-input parity check over the 93 canonical spans and
four edge cases matched 96 inputs. The sole deliberate difference fixes an
upstream whitespace bug: `7:10 each` becomes `seven ten each` rather than
`seven teneach`, preserving the word boundary.

The number normalization is a JavaScript port of the pinned ONNX frontend's
normalization logic, with the one noted whitespace correction. The browser
phonemizer uses the pinned eSpeak package; unsupported phoneme symbols fail the
chunk instead of being dropped.

Each canonical source span follows the official 280-character sentence and
punctuation splitter. The implementation appends the source's punctuation-based
gaps and 5 ms edge fades inside the timed generation call, only between internal pieces of the same source span;
the benchmark keeps canonical span boundaries intact. Speed is 1.0, noise
variation is 0.667, and samples are clipped to `[-1, 1]` at 24 kHz. A seeded
Mulberry32 plus Box-Muller generator supplies standard-normal latent noise; its
sequence is intentionally not claimed to match NumPy PCG64 bit for bit. The seed
restarts at zero for each canonical source span and advances for internal pieces.

CPU uses one-thread WASM. WebGPU requests the hardware adapter, configures
WebGPU with WASM fallback, probes actual compute dispatch in an untimed
synthesis, and awaits CPU-readable output. GPU dispatch is not a GPU-only claim.
