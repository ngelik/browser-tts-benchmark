# Benchmark dashboard

Live: <https://ngelik.github.io/browser-tts-benchmark/>.
The original listening room and deep links remain at `/audio/`.

## Build and preview

With Node 22 or newer, from a full repository clone:

```sh
npm ci --ignore-scripts
npm run dashboard:build
npm run dashboard:preview
# In another terminal, run the headed Google Chrome UI checks:
npm run dashboard:check
```

Open the loopback address printed by the preview server. The generated site lives
in `.cache/listening-site`, which is ignored. The site build itself uses only Node
built-ins and needs no model assets. Never publish private runs or model caches.

`dashboard/index.html`, `style.css` and `app.mjs` are a framework-free static UI.
System fonts keep every page request on the same origin. The only fetched data is
the generated JSON; audio files load after a deliberate play action. Full WAVs
remain links to the existing GitHub release assets.

## Evidence selection

`tools/dashboard-data.mjs` builds `assets/data.json` from the pinned catalog,
validated published result bundles and the audio manifest. It does not run models
or invent measurements. The date comes from retained receipts, not build time.

- Latest warm attempt per model/backend, preferring native evidence to historical
  imports. Failures remain visible instead of being replaced by older success.
- Only warm trials supply generation medians, ranges and first PCM timings.
- Average RAM comes from separate native cached resource diagnostics. Mean and
  sampled peak use only the recorded generation window. Each metric keeps its
  own source, protocol, environment, date and result link.
- Verified core model weights determine model MB. Runtime, voice and configuration
  assets are excluded. MB means 1,000,000 bytes.
- A matched pair requires compatible native CPU/GPU source, assets, environment,
  fixture and model configuration. Different pairs can belong to different cohorts.
  Historical CPU/GPU timing protocols are not interchangeable.
- Source cohort filters apply to warm timing evidence. RAM retains its own source
  in model details; it is not relabeled as a warm measurement.
- Exact selected warm recordings are preferred. When absent, a published recording
  from the same model/backend is clearly identified as a separate example receipt.
  Every recording keeps its voice, attribution and model terms.

All-model charts provide an overview of published evidence, not a controlled
cross-cohort ranking. Sorts do not imply speech quality. Unsupported or unavailable
paths remain explicit, never zero. Details expose voice and language counts for
the pinned model/catalog, not the number tested (English and one selected voice).

## Checks and publication

```sh
npm test
npm run validate
node tools/compare.mjs --check comparisons
npm run reference -- --check
npm run audio -- check
npm run dashboard:build
# Review and stage intended changes, then:
node tools/publication-check.mjs
```

Review in real Chrome at desktop and mobile widths: search, license/source filters,
sorting, all chart metrics, model details and keyboard focus, audio playback and
legacy `/audio/?sample=...` links. Inspect console/network errors and confirm no
third-party requests on load. `?model=MODEL_ID` opens a model's details directly.

Publish changes through a pull request. The existing validation workflow builds
the dashboard. After merge to `main`, `listening.yml` builds and deploys GitHub
Pages when UI, results, catalog, audio or builder dependencies change. Verify the
exact merge commit's workflow and the live page before reporting publication.
New benchmark submissions automatically enter this same dashboard via their
validated result bundles and verified audio manifest; do not hand-edit generated
scores or create a competing results page.

The default table and Reset sort by CPU generation time, fastest first. Column
headings (or the mobile Sort menu) can select another table order. Each chart
sorts independently by its displayed value, lowest first: generation seconds,
average memory, or model size. Unavailable measurements stay last, and ties use
the model name. Table sorting does not change chart ranking.
