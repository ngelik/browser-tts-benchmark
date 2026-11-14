# audio.cpp GGUF browser runtime

The C++ bridge in this directory is benchmark-specific code compiled with the
pinned [audio.cpp](https://github.com/0xShug0/audio.cpp) source at
`d38518a0d6a7aaab9d3f3dd91e9780c69857b0ac`. The bridge calls audio.cpp's C
API; it does not replace or relicense audio.cpp. The WebAssembly runtime also
contains GGML, SentencePiece and its bundled dependencies, cJSON, LibYAML,
LZ4, utf8proc, Emscripten system libraries, and Dawn's WebGPU C/C++ bindings.
Their original license texts and per-file SHA-256 values are included in the
release asset `THIRD-PARTY-NOTICES.txt`.

To regenerate that release notice from the pinned local source checkouts and
print its digest:

```sh
node tools/build-audio-cpp-notices.mjs
```

The command writes the ignored release artifact at
`.cache/nov14/release/THIRD-PARTY-NOTICES.txt`. Verify an existing artifact
without changing it with:

```sh
node tools/build-audio-cpp-notices.mjs --check
```

The generator requires the exact audio.cpp and Emscripten source revisions
listed in the notice. `AUDIO_CPP_CACHE=/path/to/nov14-cache` can select another
cache root containing `audio-cpp/` and `emsdk/`. It intentionally uses only the
13 component license files required by the shipped runtime; it does not
redistribute build-tree source or unrelated project dependencies.

The wrapper/worker/bridge source remains under the repository's MIT license.
The generated runtime's components retain their own licenses, and the Ming,
Audio8, and other model files retain model-specific terms documented
separately in `docs/LICENSING.md`.
