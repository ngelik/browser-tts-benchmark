# Reference-table memory and model size

All table sizes use decimal MB (1 MB = 1,000,000 bytes).

## Average memory during generation

The table uses only evidence belonging to the exact displayed result, model and
backend. Native warm-only runs did not collect memory samples. They show **Not
measured**. A peak, an average of peaks, JavaScript heap size, or another run's
memory is never substituted for average generation memory.

The original campaign retained Chrome process-tree RSS observations, sampled
nominally every 500 ms. For each scored article we select samples whose observation
timestamp is within its recorded `synthesisStartedAt` through `finalPcmAt` interval (cross-checked against the corresponding browser events).
Loading, warm-up, WAV assembly/export and subsequent playback are excluded. We
calculate the arithmetic mean of valid RSS observations within each trial, then
the arithmetic mean of the five trial means. This is a sample average, not an
exact time-weighted integral. Sampling intervals may vary.

RSS includes the entire owned Chrome process tree and browser baseline. Shared
pages may be counted more than once. It is not model-only RAM, GPU VRAM, or a
baseline-subtracted estimate. Sampling can affect execution time. Historical
memory applies only to its historical protocol and machine.

## Reproducible evidence

`memory-evidence/` contains sanitized timestamp-offset/RSS pairs, full article
window boundaries, original run IDs and input hashes. No process commands, PIDs,
profile paths or personal filesystem paths are published. Each file binds to an
unchanged public result by SHA-256 and each trial by WAV hash, duration and index.
CI checks sample ordering/windows, all scored trials and agreement with the previously published synthesis peak using the original bracketing observations. Those two boundary observations are retained separately and excluded from the average. It recomputes the
averages directly; there is no hand-maintained average field.

The original campaign summary digest must match the digest already recorded in
the historical result. Owners of the original archive can reproduce the import:

```sh
node tools/import-historical-memory.mjs /path/to/original/archive
npm run validate
npm run reference
```

The six original warm model/backend cells have retained samples. The latest
reference row for Woof uses a later GPU timing-only run, so that row still says
Not measured. Earlier Woof memory remains in the evidence directory. Later native
Paradee, Piper and Supertonic runs also remain Not measured. Fresh measurements
require a separately disclosed resource run; the existing `--resources` flag
records a whole-call **peak**, not the synthesis-window average described here.

## Model size

The Model weights column sums the exact bytes of `model-weights` assets in the
pinned manifest, including acoustic and vocoder components. Each weight's digest
and byte count must appear in the displayed receipts; otherwise size is Unknown.
It excludes auxiliary G2P models/data, voice presets, configuration, runtime
JavaScript/WASM, licenses and transport overhead. For complete download cost use
the separately measured transfer metrics. Parameter count is not file size.
