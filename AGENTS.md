# Working on Browser TTS Benchmark

For benchmark execution or model onboarding, read
`skills/browser-tts-benchmark/SKILL.md`, then the relevant documents it names.
The skill also works when copied outside this checkout.

- Preserve fixed fixture identity, protocol boundaries, model configuration and
  historical evidence. Version material changes; never manufacture missing scores.
- Inference belongs in headed Google Chrome. Node serves assets and controls runs.
- Run Chrome benchmarks sequentially in disposable profiles. Do not use a personal
  profile or silently replace an unavailable GPU backend with CPU.
- Keep weights, recordings, caches and raw runs ignored. Review public metadata.
- Validate changes with `npm test`, `npm run validate`,
  `node tools/compare.mjs --check comparisons` and, after staging,
  `node tools/publication-check.mjs`. Test affected adapters in real Chrome.
- Commit implementation before scoring and publish that exact source before result
  submission. A clean working tree claim must come from the harness, not a JSON edit.
- Respect the user's scope and existing approval. This file grants no additional
  authority to publish, merge, change system settings or access credentials.
