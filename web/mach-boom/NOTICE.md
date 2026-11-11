# Mach Boom browser port

Upstream: SyzygyResearch/Mach-Boom at
`01860b06bdf8498761255ad1c64b99980b96486d`, Apache-2.0. Its model is a
compressed Phonon checkpoint; the user's excluded Phonon benchmark configurations
are not rerun. The upstream license and NOTICE are retained beside this file.
Upstream Python/C, tokenizer, selected voice and weights are hash-pinned assets
fetched into ignored storage, not copied into the repository.

The upstream release targets Linux/x86. This experimental port executes its
Python/NumPy code and portable C kernels entirely inside a dedicated Chrome
worker, using Pyodide 0.29.3, NumPy 2.2.5 and Emscripten 4.0.9. There is no server
synthesis. This is not the publisher's AMX/AVX optimized native runtime.

Changes:

- `tools/build-mach-boom.py` removes the pthread worker pool and fixes C execution
  to one thread; numerical trellis decoding is retained. AMX is disabled.
- `matmul.c` is original FP32 SIMD128 matrix multiplication. `browser_patch.py`
  replaces 2D FP32 Python `@` operations with this kernel; other shapes/dtypes
  retain NumPy. It preserves increasing-K accumulation per output, without
  fast-math or FMA. All sources compile with `-O3 -msimd128 -DTMK_NO_AMX
  -sSIDE_MODULE=1`; unlike the native build, no source receives `-ffast-math`.
- The Python AST transformation retains the upstream architecture and generation
  algorithm. A source frame-limit exit becomes an error, preventing a silently
  capped output from being scored. Normal EOS handling is unchanged.
- Transformers.js 3.5.1 supplies Unigram tokenization. Rust regex hexadecimal
  escapes are translated to equivalent JavaScript Unicode escapes. The upstream
  English normalizer is unmodified. Metaspace `prepend_scheme: always` maps to
  the legacy Transformers.js `add_prefix_space: true` decoder option. All 93
  canonical normalized spans, token IDs, decoded text and word counts match Hugging Face Rust tokenizers 0.22.2, recorded in the adjacent oracle.
- Zoey, seed 0, one thread, 16-frame chunks and a two-frame first chunk are fixed.
  First PCM is reported when the first copied float block is available; final
  completion waits for all blocks. The wrapper yields between blocks, validates
  errors and terminates its owned worker on disposal.

`browser_patch.py`, `matmul.c` and browser glue are original MIT benchmark code;
imported Apache-2.0 source retains its own terms. Compiled artifacts are release
assets with recorded SHA-256, never Git binaries. Pyodide (MPL-2.0), CPython
(PSF), NumPy (BSD-3-Clause and bundled notices) and Transformers.js (Apache-2.0)
retain their component licenses. This port has no WebGPU execution path.
