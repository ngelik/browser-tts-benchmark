# Liquid LFM3 run notes

Raw submitted receipts are immutable. These notes record later observations and
explain which attempts supply the displayed scores. All full attempts remain in
README Reference results; unscored smoke checks stay local.

## Omni CPU loading

The [first full attempt](../results/2026-11-11t10-20-13-321z-lfm3-omni-2b-fusor-q7-cpu-cpu-warm-72b62949/summary.md)
was stopped during untimed initialization after about twelve minutes with no
warmup or scored trial completed. Controller/worker diagnostics showed the page
and six compute workers had started. All 52 OPFS files existed, but one expected
47,256,576-byte part was empty; the other files totaled 2,465,223,610 bytes.
The worker remained responsive while compute workers were idle. The controller
inspector was enabled only for this failed, unscored attempt.

The receipt reports the resulting page/context closure. A fresh-profile smoke
check also stalled during initialization. The exact underlying Chrome/OPFS cause
was not established. The [loading fix](LIQUID_LFM3_CPU.md#loading-policy-and-observed-setup-failures)
removes Omni's optional OPFS cache and adds bounded HTTP-part failures. Successful
results after the fix use their own published source commit; earlier failures
are not presented as an unsupported CPU model or a timing score.

## Audio CPU memory repeat

The [initial memory diagnostic](../results/2026-11-11t10-36-42-360z-lfm3-audio-2b-fusor-q7-cpu-cpu-cached-a50978d5/summary.md)
had a roughly 0.33-second Node unit-test process overlap. Its original no-test
note describes the intended condition, which was not fully met. No additional
Chrome or inference was started, and the sampler covers only the owned Chrome
process tree, but this run is retained as ancillary evidence rather than the
selected memory result.

The [clean repeat](../results/2026-11-11t10-46-24-864z-lfm3-audio-2b-fusor-q7-cpu-cpu-cached-b8404098/summary.md)
ran without that overlap and supplies the displayed Audio CPU memory value.
Both runs cite the same clean source as Audio's five-repetition warm benchmark.
The warm timing repetitions were unaffected by the later memory-test overlap.

## Speech completeness

Audio's official GGUF WebGPU run contains a 0.88-second source-span output in
scored trial 5 and a separate 0.64-second span in its excluded warmup. These are
reported as output-length observations, not a proved truncation diagnosis.
The public full WAV and clip correspond to scored trial 5. Finite/nonempty PCM
and a normal stop do not establish faithful reading or pronunciation quality.
The benchmark has not performed an ASR or subjective speech-quality evaluation.

## Completed CPU and GPU coverage

Both speech-generating family members now have five-repetition warm CPU and
WebGPU results, separate one-article memory diagnostics, and archived final-trial
WAVs. Each timing score excludes one full-article warmup. No dedicated cold-load
or throttled-download experiment was run in this campaign.

The [Omni CPU report](../reports/lfm3-omni-cpu/overview.md) uses clean source
`35f6b1982836fe137fa2293810d9e4a144f76cd7` for both timing and memory. All five
scored CPU outputs have identical PCM hashes under seed 0; this is repeatability
evidence, not a speech-quality score. Its memory diagnostic had no overlapping
inference or tests. Audio CPU and official GPU results retain their own source
cohorts in [their reports](../README.md#campaign-overviews).

[Compare the family table and listen](https://ngelik.github.io/tts-bench/?q=LFM3).
CPU q7/Fusor and GPU GGUF Q4_K_M/Q8_0 differ in precision, runtime, packaging,
context and sampling settings. Do not interpret their time ratio as isolated
hardware acceleration. RAM is the sampled owned Chrome process tree during
one article, including workers and browser baseline, not dedicated GPU memory.
