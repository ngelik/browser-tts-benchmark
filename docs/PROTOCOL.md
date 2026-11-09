# Benchmark protocol

This is a browser inference benchmark, not a hosted TTS service. Node serves
local files and controls Chrome; text processing and synthesis run inside
Chrome. Static model downloads are allowed before inference. Sending article
text or audio to a remote synthesis endpoint is not.

## Fixed workload

`english-20k-v1` is an original AI-assisted story, created for this benchmark.
Its 20,000 ASCII characters include spaces, punctuation and a final LF.
The exact SHA-256 is
`4cd173ad03d14ba96df6eb1e58b193c0c796032c114cfb954838b5150651eb0b`.
All models receive the same 93 ordered source spans. Internal normalization
and model-specific pronunciation overrides must be disclosed. PiVo's curated
configuration is distinct from its strict frontend.

## Comparable warm runs

1. Use installed **Google Chrome**, headed, in a dedicated disposable profile.
2. Record the hardware label, OS, Chrome version, adapter/backend, source commit,
   source fingerprint and actual asset hashes. Recheck source and assets after
   generation; a checkout changed during a run cannot be published as a clean run. Never submit hostnames or home paths.
3. Verify the fixture and assets. Run a separate untimed capability synthesis.
   WebGPU results must demonstrate actual compute dispatch, not merely expose
   `navigator.gpu`. Record CPU preprocessing and allowed operator fallback.
4. Load one model. Generate the **entire article once as an excluded warm-up**.
5. Keep that engine resident. Generate the full article **five times**, sequentially.
6. Start each timer immediately before the first source-chunk request. Stop only
   after the final chunk's PCM reaches the page CPU. Await GPU outputs/readback;
   a dispatch submission time is not a completion time.
7. Validate finite, nonempty PCM, all 93 chunks, consistent sample rate and counts.
   Hashing, validation, joining, WAV encoding and saving happen after the timer.
8. Retain every repetition, including failure status. Save audio locally for
   listening; publish its digest rather than committing WAV files by default.
9. Report median and observed min–max, sample count, settings and limitations.
   Min–max is not a confidence interval. Do not cherry-pick the fastest repetition.

CPU and GPU use this same timer boundary in native v1 runs. A GPU pipeline is not
necessarily GPU-exclusive. Pure CPU fallback must never masquerade as a GPU score.
Unsupported backends have no timing value, not zero. A GPU-equipped computer may
still have no usable hardware WebGPU adapter; software rendering is not a GPU score.

## Other scenarios

Keep each scenario in a separate result/protocol group:

| Scenario | Required distinction |
|---|---|
| Cold | New empty browser profile; initialization and generation reported separately |
| Cached | New engine/process with previously populated asset cache; not a resident warm engine |
| Network | Fresh download under a stated aggregate bandwidth cap, not independent per-request caps |
| Offline | Cache assets first, then disable network and prove full generation succeeds |
| Switch | Record predecessor and target; transition cost must not be hidden inside target-only timings |

Download size means transferred HTTP bodies for the whole runnable stack, not
parameter count or model weights alone. At 1 Mbps, ideal transfer seconds are
`encoded body bytes / 125000`; this excludes protocol overhead, latency, cache reads
and initialization. Label arithmetic estimates separately from throttled observations.

Memory measurements must name their scope. Sampled Chrome process-tree RSS includes
browser baseline and can double-count shared pages; it is neither model RAM nor
GPU VRAM. Page heap and process RSS must not be summed. State sampling interval,
window and unavailable readings. Measure diagnostic tracing separately from scored
timing: instrumentation itself changes execution time.

## Historical reference results

The repository includes 102 selected original article measurements and 30 later
WebGPU warm measurements. They are **historical imports**, not runs of this newly
packaged CLI. Original warm timings include local PCM storage; later GPU warm
timings exclude it. They have different protocol IDs and must not produce a
CPU/GPU speedup ratio. The original campaign already used WebGPU for Woof.

Original float-PCM hashes were not retained in the first campaign; those fields
are `null`, with genuine WAV hashes retained instead. A WAV hash must never be
relabelled as a float-PCM hash. Historical imports preserve this evidence limit.

## Experimental controls and limits

Run on mains power, keep Chrome foregrounded, close unrelated heavy apps, and
record power/thermal conditions in notes. Do not benchmark models concurrently.
For repeated multi-model studies, randomize cell order with a recorded seed;
counterbalance order across campaigns when studying small differences.

Compare only matching fixture, protocol, voice, precision, settings and hardware.
Treat each machine as its own stratum rather than averaging laptop and desktop
results. One machine and five repetitions do not establish universal performance.
Do not infer speech quality from speed, output duration or a nonzero waveform.
Automated checks cannot certify that every word was pronounced correctly.

Long-running cases need an explicit timeout and a persisted failure receipt.
The historical PiVo GPU adapter took roughly 43 minutes per full generation;
one warm-up plus five scores can take over four hours. Smoke tests are for
installation/capability checks and are never publishable benchmark scores.
