# Implementation validation

Validated on Apple M1 Pro (8 logical cores, 16 GiB), macOS/Darwin 25.6.0 arm64,
installed headed Google Chrome 157.0.8103.39. These checks establish the tested
configuration; they do not establish portability to every Chrome/device pair.

## Native harness checks

| Path | Evidence |
|---|---|
| Paradee CPU and WebGPU | Clean independent checkout; one full 20,000-character warm-up and five scored full articles per backend; output WAV hashes, sample counts and 24 kHz rate independently checked |
| Leokani 7M and 4.5M, CPU and WebGPU | Full 20,000-character correctness runs plus short dispatch checks; all 93 chunks, finite PCM, WAV hashes and 24 kHz output checked |
| Phonon CPU and WebGPU | Real Chrome smoke generation, actual GPU dispatch, independent WAV/hash/rate checks; cold/cached, offline and optional RSS diagnostics |
| PiVo curated CPU and WebGPU | Real Chrome smoke generation; actual GPU dispatch; full CPU article completed offline with zero inference network bytes and independently checked 16 kHz WAV/hash |
| Woof WebGPU | Actual dispatch and full article completed offline with zero inference network bytes; independently checked 24 kHz WAV/hash; pinned runtime explicitly reports CPU unavailable |
| Cached and offline | Separate new-engine cached runs; offline execution verifies an uncached request fails and inference transfers zero HTTP body bytes |
| Bandwidth limit | Shared 1 Mbps cap across concurrent HTTP responses tested; Paradee browser diagnostic observed 177.66 s initialization for a 21.84 MB runnable transfer (174.68 s ideal transfer time) |
| Model switch | Phonon to Paradee CPU; predecessor disposal and target initialization included in transition measurement |
| Interruption | SIGINT produces an explicit error receipt and closes the owned Chrome process/profile |

Short diagnostics and development-checkout correctness runs are not published as
ranked benchmark scores. The reference results are labelled historical imports.
Only full clean native runs are eligible for the native comparison command.

A fresh public GitHub clone installed successfully and passed the automated suite,
asset fetch and real CPU/WebGPU Phonon smoke checks.

## Automated and publication checks

- Fixture length/hash and contiguous per-chunk hashes.
- Pinned assets, package versions, byte counts, shared runtime targets and hashes.
- Rejection of smoke/dirty/incomplete/GPU-without-dispatch submissions.
- Deterministic tables, SVG charts and checksums; missing backends are not plotted as zero.
- Comparison rejects mixed timing protocols, fixture/hardware/source drift and
  different inference settings for the same model.
- Loopback file confinement, browser isolation headers and aggregate bandwidth cap.
- Tracked-file check excludes weights, audio, caches, browser profiles, private
  absolute paths and recognizable credential formats.

CI validates submitted evidence and report arithmetic. It does not authenticate
self-reported hardware or rerun GPU timings. Maintainers must inspect provenance
and listen to locally generated audio when evaluating quality.
