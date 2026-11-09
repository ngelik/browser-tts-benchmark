Creator: Milliwatt Labs.

`config-7m.json` derives from the official Leokani 7M config at revision
`ba0beb24f7b124dc1eb297ffc28d01db892462bd`:
https://huggingface.co/milliwattlabs/leokani-tts-7M/raw/ba0beb24f7b124dc1eb297ffc28d01db892462bd/config.json

`config-4.5m.json` derives from the official Leokani 4.5M config at revision
`d9eb742dfb6567872fe451d559674ec42c32e6c8`:
https://huggingface.co/milliwattlabs/leokani-tts-4.5M/raw/d9eb742dfb6567872fe451d559674ec42c32e6c8/config.json

Each file retains the model vocabulary and sample-rate setting and adds local
model/G2P/runtime asset paths and hash metadata needed by this benchmark. The
worker resolves those paths to its same-origin cache; this path adaptation
does not change the pinned weights or frontend implementation. These files
retain the model terms and are not covered by the repository's MIT license.
The model artifacts require local acceptance of CC BY-NC 4.0 before staging or
use: https://creativecommons.org/licenses/by-nc/4.0/ . See
`docs/LICENSING.md` for component-level terms.
