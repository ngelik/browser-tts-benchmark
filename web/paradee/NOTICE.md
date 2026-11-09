# Third-party frontend sources

These two files are not covered by the benchmark's MIT license:

- `frontend.js`: Kokoro.js phonemization frontend, from hexgrad/kokoro,
  Apache-2.0. Only its import was changed to use the locally staged, pinned
  phonemizer package. The original source and exact hashes are in `sources.json`.
- `misaki.js`: Paradee's eSpeak-to-Misaki conversion, from
  sahilmahendrakar/paradee, Apache-2.0, unmodified.

The complete applicable licenses are `frontend.js.LICENSE` and
`misaki.js.LICENSE`. Compiled eSpeak is not vendored here. The separately installed
phonemizer package includes compiled eSpeak NG; that component retains GPL-3.0
terms. See the project component license inventory before distributing a widget.
