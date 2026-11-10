# Contribute a benchmark

## Choose the contribution route

Reference-result PRs require a **MacBook Pro with Apple M1 Pro**, running natively
as **arm64** in headed Google Chrome. The current baseline has 8 CPU cores and
16 GiB RAM. Record the actual hardware, RAM, architecture, OS and Chrome version;
other M1 Pro configurations remain separate cohorts and require review. Matching
hardware establishes eligibility, not automatic acceptance. Generic ARM, other
Apple Silicon chips and Rosetta/x64 runs do not qualify for baseline submissions.
The harness remains usable for personal experiments on other hardware.

Without verified baseline hardware, submit an **evaluation-request PR** instead:
copy [the template](evaluation-requests/TEMPLATE.md) to
`evaluation-requests/<model-slug>.md`, supply the model name and public model URL,
and title the PR `[Evaluation request] <org/model>`. Other fields are optional.
No run, scores, adapter or audio is required. Select the request route in the PR
template and mark result checks not applicable. See the
[README example](README.md#request-a-model-evaluation).

Maintainers review feasibility and terms before arranging a baseline evaluation.
Merging a request does not automatically execute its linked code or promise a
completion date. The eventual implementation and results go through their own
reviewed PRs; result PRs update README Reference results. Request files do not
belong in `results/` or in generated score tables. Existing published evidence is
preserved. Code-only maintenance and adapter proposals remain welcome; they do
not establish a measured baseline result.

## Submit measured baseline results

Result submission is a normal pull request. The CLI does not upload results,
audio or machine details automatically.

1. Fork and clone the repository; install the pinned dependencies with `npm ci`.
2. Read [the protocol](docs/PROTOCOL.md), fetch the selected assets and verify their
   hashes. Run a smoke check first. Use a clean committed checkout for scored runs.
3. Run a full benchmark on the verified M1 Pro baseline in headed Google Chrome.
   Supply an accurate, non-identifying machine label such as
   `MacBook Pro (Apple M1 Pro, 16 GB)`. Do not relabel another machine as baseline.
4. Inspect `runs/<run-id>/result.json`, errors, output validation and local audio.
   Keep failed cells; do not replace measured values with estimates.
5. Prepare a public bundle:

   ```sh
   npm run submit -- runs/<run-id>/result.json
   npm run reference -- --check
   npm run validate
   npm test
   ```

6. Review the generated `results/<run-id>/` files for privacy and completeness.
   Commit `result.json`, `summary.md`, `chart.svg`, `checksums.json` and the updated
   README Reference results section on the same branch. `npm run submit` refreshes
   the section; `npm run reference` refreshes it after adding comparisons or audio.
   Open a pull request using the template. Do not commit `.cache/`, `runs/`, unregistered audio,
   weights, browser profiles, screenshots of personal apps or raw traces.

CI checks the result contract, hashes, generated reports and unit tests. It does
not rerun the GPU benchmark on GitHub-hosted hardware and does not authenticate
that a contributor's timing claims are true. Maintainers review baseline hardware
eligibility, provenance, backend evidence and comparability before merging. CI
does not authenticate hardware claims; this hardware rule is a contribution-review
policy. A merge publishes the result in this repository. Self-reported results should remain labelled as such.

## Add a model

Add a manifest entry with immutable upstream revisions, file hashes, voice,
precision, license and expected sample rate. Implement the browser adapter using
the same lifecycle and PCM messages as the existing adapters. All frontend work
and inference stay in the browser. Document any CPU fallback and pronunciation
overrides. Add correctness tests for lifecycle, unsupported backends, output
validation and cleanup, then demonstrate a real Chrome smoke and full-article run.

Do not silently replace weights, fix fixture wording for one model, or change
timing boundaries under an existing protocol ID. Version those changes. An asset
hash mismatch fails closed; investigate it rather than accepting new bytes.

See [the adapter contract](docs/ADDING_MODELS.md) for adding a model or backend.

For a multi-run table and SVG, use `npm run compare -- --out comparisons/<name> results/<id>/result.json results/<other-id>/result.json`. Commit the input bundles and generated comparison together; CI checks both.

Please follow [community conduct](CODE_OF_CONDUCT.md). Automated dependency PRs
are maintenance proposals, not evidence that changed runtimes preserve a model’s
performance: update byte/hash pins deliberately and run affected Chrome adapters
before merging runtime changes. Keep `.gitattributes` LF normalization so source
fingerprints and the fixed article remain identical across operating systems.

Record voice/language counts and primary sources in the model support metadata;
keep checkpoint/catalog scope distinct from tested voice/language. For approved
recordings, follow [audio publication](audio/README.md) and refresh the same
Reference results section before opening the PR.
