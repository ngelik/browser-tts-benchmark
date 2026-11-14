# Command reference

Use Node 22+, npm and an installed desktop Google Chrome. Run commands from the
repository root. Chrome runs headed in a disposable profile; close unrelated
heavy applications and keep the benchmark foregrounded. Do not run two benchmark
commands at once. Use `--note "Mains power; performance mode; room temperature 22 C"`
to record relevant power/thermal conditions without personal information. `--chrome PATH` or `CHROME_PATH` selects an explicit Chrome binary.

## Install and stage assets

```sh
npm ci
npm run bench -- models
npm run assets -- fetch --model phonon
npm run assets -- verify --model phonon
```

`assets.lock.json` records upstream URLs, revisions, SHA-256 digests and exact byte
counts. A changed or missing upstream file fails explicitly. Staged model/runtime
files live in ignored `.cache/public/`; no text or audio is sent to upstream hosts.
The install/fetch stage uses the network; synthesis is confined to the local
static origin. Downloading assets is separate from measuring a customer's browser
transfer. The latter is measured by the cold/network scenarios.

For models requiring acknowledgment, review [LICENSING.md](LICENSING.md) and use
`--accept-license` on both asset and run commands. This acknowledges terms; it does
not grant commercial or redistribution rights. An administrator can instead copy
an already reviewed asset tree, preserving the lockfile's relative target paths:

```sh
npm run assets -- import --model phonon --source /path/to/asset-tree
```

Never commit this cache, downloaded weights or upstream bundles. Explicitly authorized recordings use the validated [audio publication workflow](../audio/README.md).

## Choose a backend and workload

```sh
npm run bench -- run --model phonon --backend cpu --smoke
npm run bench -- run --model phonon --backend webgpu --smoke
npm run bench -- run --model phonon --backend cpu --scenario warm --machine "My laptop"
```

`cpu` requests CPU/WASM explicitly; `webgpu` requires a real dispatch probe.
A software renderer or CPU-only fallback is not a GPU result. `--smoke` uses three canonical source
chunks, skips the full warm-up and defaults to one scored diagnostic repetition.
It cannot be submitted as a benchmark score.

Full `warm` runs default to **one excluded 20,000-character warm-up and five full
scored repetitions**. `--repetitions N` may increase this count, but may not reduce
a publishable warm run below five. The last scored output is saved as local WAV.
Default per-article timeout is 120 minutes; `--timeout-minutes N` accepts up to 1,440 (24 hours) for slow models. Campaign plans can set `timeoutMinutes` per cell. The timeout applies to each full article independently.
PiVo WebGPU can take several hours for the complete warm sequence.

## Other scenarios

Replace the model/backend in these examples as appropriate:

```sh
npm run bench -- run --model phonon --backend cpu --scenario cold
npm run bench -- run --model phonon --backend cpu --scenario cached
npm run bench -- run --model phonon --backend cpu --scenario network
npm run bench -- run --model phonon --backend cpu --scenario offline
npm run bench -- run --model paradee --backend cpu --scenario switch --predecessor phonon
```

- **Cold:** three trials, each with a new empty profile. Initialization and
  generation are separate metrics. `controllerTrialElapsedMs` additionally
  includes browser/page setup, validation and output export; it is not a widget
  click-to-audio measurement.
- **Cached:** three new-engine trials after a separate untimed capability/load
  pass populates the profile cache. It is not a resident warm model.
- **Network:** three fresh-profile trials with a shared **1,000,000 bit/s** HTTP
  body limiter across concurrent responses. Setup downloads are unthrottled.
  `loadMs` is observed initialization; `idealDownloadSecondsAt1Mbps` is arithmetic,
  not a simulated internet latency measurement. Browser HTML/runtime/model body
  bytes are included; headers and TLS are not. The server uses identity encoding.
- **Offline:** one trial after caching. The page is loaded, network is disabled,
  an uncached fetch must fail, then model initialization and generation must work.
  `offlineInferenceNetworkBytes` must be zero; overall `downloadBytes` also
  includes page bootstrap before the offline toggle.
- **Switch:** one trial. Initialize and exercise the predecessor, dispose it,
  initialize the target and generate. Both models must support the chosen backend.
  `switchTransitionMs` includes predecessor disposal plus target initialization;
  target transfer bytes exclude predecessor preparation. Generation stays separate.

Append `--resources` for 500 ms samples of the owned Chrome process-tree RSS on
macOS/Linux. This changes the protocol ID. RSS includes browser baseline and the
entire generation call, including validation/export after the synthesis timer;
it is not GPU VRAM. Generation-window sample averages and raw observations are
also retained for ordinary Chrome RAM comparison; use separate full-article
`--scenario cached --resources --repetitions 1` diagnostics for this purpose.
See [memory methodology](MEMORY.md). Unavailable values remain null. Prefer timing-only runs for
small performance differences. Windows resource sampling is unavailable.

## Inspect and contribute

Each run prints its relative result path. `runs/<id>/` contains progress, trial
receipts, final JSON, Markdown, SVG and the last WAV. It is ignored by Git. A
failure remains a failure receipt; do not relabel it as unsupported or discard
slow successful repetitions. A setup failure before loading the fixture produces
an error diagnostic rather than a benchmark score.

```sh
npm run report -- runs/<id>/result.json
npm run submit -- runs/<id>/result.json
npm run validate
npm test
```

Submission copies only the validated JSON, table, chart and checksums to
`results/<id>/`. Native submissions require a clean committed source checkout,
headed Chrome and a full workload. Inspect the bundle for personal information,
then follow [CONTRIBUTING.md](../CONTRIBUTING.md) to open a pull request. No command
uploads results automatically. CI validates evidence structure and arithmetic;
it cannot certify contributor hardware or reproduce local GPU measurements.

## Compare several published runs

After submitting compatible full runs, generate a combined table and chart:

```sh
npm run compare -- --out comparisons/my-machine results/<cpu-id>/result.json results/<gpu-id>/result.json
node tools/compare.mjs --check comparisons
```

Commit the comparison folder with its input result bundles. CI verifies input
hashes and regenerates the table/chart exactly. The comparison command rejects
historical imports, different timing protocols, source fingerprints, machines,
Chrome versions and repeated model/backend cells. For one model, voice, precision
and inference settings must match except for the selected execution providers.
Different models retain their own voices/configurations; a resource comparison
does not imply equal speech quality. Comparisons never pool repetitions from
independent runs. Keep all run-specific power/thermal/order notes in the inputs.
