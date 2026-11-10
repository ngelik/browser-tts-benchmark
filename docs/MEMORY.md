# Model size and Chrome RAM

All table sizes use decimal MB (1 MB = 1,000,000 bytes).

## Ordinary Chrome RAM during speech generation

The Reference results section includes a dedicated Chrome RAM table alongside the
warm speed table. Every memory value links to its own full-article diagnostic.
Groups retain exact hardware, Chrome, protocol, source and repetition counts.
A new memory run is never presented as memory sampled during an older timing run.

`--resources` samples the owned process tree of a fresh, isolated Chrome instance
with one benchmark tab at a nominal 500 ms interval. This includes the tab,
inference workers, GPU process and browser baseline. It is ordinary process RSS,
not JavaScript heap, model-only RAM, per-tab-only memory, or GPU VRAM. Shared pages
can be counted more than once; sampling itself can affect speed.

Only observations within the browser's recorded first source-chunk request through
final CPU-readable PCM window enter the generation average. Loading, validation,
hashing, WAV encoding and saving are excluded. Raw timestamp/RSS pairs are kept
in each trial's `memory` object. `generationMeanRssBytes` is their arithmetic
mean rounded to the nearest byte; `generationRssSampleCount` is the observation
count. A valid average requires at least two observations, at least 80% of the
nominal observation count (rounded up from `max(2, floor(windowMs / 500))`),
first/last observations within 2,000 ms of the boundaries, and no internal gap
longer than 5,000 ms. Insufficient sampling retains its explicit availability
state and raw observations; it never receives an invented average. Across repetitions,
the table uses the arithmetic mean of these trial means, giving each article equal
weight. It is a sample mean, not an exact time-weighted integral.

The initial memory comparison uses **one full 20,000-character article per cell**,
in the cached-assets scenario with a fresh engine. It is not a five-repeat warm
speed score. Reproduce sequentially for each model/backend:

```sh
npm run assets -- fetch --model MODEL --accept-license
npm run bench -- run --model MODEL --backend cpu --scenario cached --resources --repetitions 1 --accept-license --machine "Hardware / RAM" --note "Dedicated memory diagnostic; power and background conditions"
npm run bench -- run --model MODEL --backend webgpu --scenario cached --resources --repetitions 1 --accept-license --machine "Hardware / RAM" --note "Dedicated memory diagnostic; power and background conditions"
npm run submit -- runs/RUN_ID/result.json
npm run validate
npm run reference
```

Actual unsupported backends retain their status and never receive an invented RAM
number. Do not substitute a peak or reuse another model/backend's observation.
The older `articleCallPeakRssBytes` metric keeps its broader whole-call window,
including post-timer export, and is distinct from the generation mean.

## Historical sample recovery

The original campaign also retained 500 ms process samples. Its sanitized
`memory-evidence/` appendix preserves six original warm cells independently of
new diagnostics. Those observations are not used to fill the current RAM table.

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

## Model size

The Model weights column sums the exact bytes of `model-weights` assets in the
pinned manifest, including acoustic and vocoder components. Each weight's digest
and byte count must appear in the displayed receipts; otherwise size is Unknown.
It excludes auxiliary G2P models/data, voice presets, configuration, runtime
JavaScript/WASM, licenses and transport overhead. For complete download cost use
the separately measured transfer metrics. Parameter count is not file size.
