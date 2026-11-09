# Security and privacy

Benchmark only model/runtime sources you trust. A model adapter is executable
browser code. The local controller serves assets only on loopback and should
allow only the staged asset tree and harness files, never arbitrary local paths.

Keep raw runs and Chrome profiles out of Git. Published submissions should contain
only the fixed fixture identifier, coarse hardware metadata, hashes, timings and
validation outcomes. The privacy check is a heuristic, not a secret scanner guarantee.

CI uses read-only repository permissions, no secrets and no self-hosted GPU runner.
Never change result validation to run untrusted pull-request code with privileged
credentials (`pull_request_target`) or on a personal machine automatically.

Report sensitive security issues through [GitHub private vulnerability reporting](https://github.com/ngelik/browser-tts-benchmark/security/advisories/new).
Do not include credentials or private machine data in a public issue.
