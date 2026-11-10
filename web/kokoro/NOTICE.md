# Official Kokoro browser helper

Source: hexgrad/Kokoro, commit `664c76a704021239ba59c84dcbaa4d3dece01fe9`,
`kokoro.js/src/{kokoro,phonemize,voices,splitter}.js`, corresponding to npm
`kokoro-js@1.2.1` gitHead. Apache-2.0, hexgrad and Xenova; LICENSE retained.

Changes: local imports, browser-only Node stubs, local voice URL with HTTP error
check, and explicit input/output tensor disposal after copying CPU-readable PCM.
Syllabic l/n/m from eSpeak are expanded to schwa + consonant because the model
vocabulary lacks the combining syllabic mark; this is a disclosed pronunciation
normalization, not a dropped source span. The worker enforces no truncation and rejects unknown phonemes. The official
stream splitter is retained but not used; canonical benchmark spans go through
`generate` sequentially. Model assets and bundled runtime engines remain ignored.

https://github.com/hexgrad/kokoro/tree/664c76a704021239ba59c84dcbaa4d3dece01fe9/kokoro.js/src
