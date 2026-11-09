# Result contract

Each published directory has exactly four generated artifacts:

- `result.json`: protocol, environment, fixture, assets and per-cell trial evidence.
- `summary.md`: derived table, notes and chart link.
- `chart.svg`: deterministic visualization; unsupported/error cells have no plotted score.
- `checksums.json`: SHA-256 of the preceding three files.

[JSON Schema](../schemas/result.schema.json) describes the structural contract.
`tools/results.mjs` is the executable semantic validator: it also checks counts,
canonical fixture identity, clean source provenance, GPU dispatch evidence,
publication eligibility and common private-path/credential patterns.

`generationMs` is elapsed wall time, not CPU-seconds. `samples` is mono sample
count and `sampleRate` is Hz. `pcmSha256` hashes the actual float PCM representation
specified by the adapter. Optional `audio.sha256` identifies the saved WAV and is
not interchangeable with the float digest. Original historical records lacking
float hashes use `null`, and must retain the genuine WAV hash.

Trials are sequential, one-based, and stored separately from excluded warm-ups.
All timings are positive finite numbers. Medians and min–max ranges are calculated
from recorded trials, never entered by hand. Only `measured` cells receive scores;
an `error` may retain partial trial evidence, and `unsupported` has no scores.

Optional numeric `metrics` fields use unit suffixes: `Ms`, `Seconds`, `Bytes`.
`underrunSamples` counts playback samples. `null` means unavailable, never zero.
Metrics with different sampling windows or instruments require separate protocol
IDs or explicit notes. The new timing-only GPU campaign did not measure resources;
the historical resource values belong to their original backends.

Historical imports retain source summary hashes and are labelled as imports.
They are not evidence that the newly packaged code produced those older numbers.
The new CLI must be validated separately on real hardware. Hashes and CI establish
internal consistency, not honesty of arbitrary contributor measurements.

## Privacy

Use a coarse hardware label, not a hostname. Never include absolute home paths,
account names, browser profile data, tokens, private URLs or unrelated screenshots.
Inspect generated JSON before submitting it. Validation rejects common patterns,
but human review is still needed. No automatic upload occurs in any benchmark run.
