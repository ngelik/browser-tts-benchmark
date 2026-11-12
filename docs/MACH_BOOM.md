# Mach Boom browser benchmark

The screenshot introduces [Mach Boom](https://huggingface.co/SyzygyResearch/Mach-Boom/blob/01860b06bdf8498761255ad1c64b99980b96486d/README.md),
a 3–4-bit trellis/int8/int4 compression of Phonon 31M. Only Mach Boom and the
original Pocket TTS are newly selected from that screenshot. Phonon is excluded
at the user's request; Kitten Nano, Woof and Supertonic 3 already have results.
The screenshot's word-error percentages are publisher measurements, not our
benchmark's speech-quality results.

The measured Mach Boom and Pocket TTS browser results, settings, comparison and
RAM scope are summarized in the [campaign results note](MACH_POCKET_RESULTS.md).

Mach Boom has 18,155,776 bytes of core weights. The publisher's 19.5 MB download
includes a different native runnable stack. Our browser download additionally
needs Pyodide/CPython, NumPy, tokenizer code and compiled WASM; do not equate its
weights column with total transfer. All sizes are decimal MB unless specified.

The original release has no browser runtime. The [port and source/change notice](../web/mach-boom/NOTICE.md)
describe the local Chrome implementation. CPU uses one worker thread and no x86
AMX/AVX instructions. WebGPU is explicitly unsupported by this implementation.
Do not apply the publisher's native CPU speed or RAM claims to the browser port.

## Reproduce

```sh
npm ci
npm run assets -- fetch --model mach-boom
node tools/check-mach-boom.mjs
npm run bench -- run --model mach-boom --backend cpu --smoke
npm run bench -- run --model mach-boom --backend cpu --scenario warm --machine "Your actual hardware" --note "Actual power/background conditions"
npm run bench -- run --model mach-boom --backend cpu --scenario cached --resources --repetitions 1 --machine "Your actual hardware"
npm run bench -- run --model mach-boom --backend webgpu --scenario warm --machine "Your actual hardware"
```

The full run requires clean committed source, one excluded 20,000-character warmup
and five scored repetitions. RAM uses a separate article and includes owned Chrome
processes/workers and baseline, not GPU VRAM. No dedicated cold-load checks are
part of this campaign. GPU's unsupported receipt has no fabricated duration.

The numeric/tokenizer audit is separate from timing. Its tokenizer oracle uses
Hugging Face Rust tokenizers 0.22.2 with the pinned tokenizer and unmodified
`frontend_en.normalize` on every canonical span, including decoded text and the word count used by
end-of-speech handling. PCM and token coverage checks
do not establish intelligibility or faithful pronunciation; listen to actual runs.

## Rebuild kernels

Install Emscripten SDK 4.0.9 in a local tool directory. The tested emsdk tag resolves
to `3bcf1dcd01f040f370e10fe673a092d9ed79ebb5`, SDK build
`cb2a69bce627bd2247624c71fc12907cb8785d2f`. After staging the assets:

```sh
python3 tools/build-mach-boom.py --emcc /path/to/emsdk/upstream/emscripten/emcc
```

The build verifies each upstream C source against `assets.lock.json` and checks
that the output exactly matches the published WASM artifact's byte count and
SHA-256. It does not execute native TTS. Keep compiled kernels in ignored storage.

To independently rebuild/check the tokenizer oracle, use a local Python virtual
environment with `tokenizers==0.22.2`, then run
`python3 tools/mach-boom-tokenizer-oracle.py`. This command performs only text
processing, not synthesis. `--write` explicitly regenerates the reviewed oracle.
