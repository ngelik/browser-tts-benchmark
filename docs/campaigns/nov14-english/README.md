# Reproduce the November English TTS campaign

The [machine-readable plan](plan.json) reproduces the 14 full-article cells for Ming 3.0, Audio8 Realistic and Fun-CosyVoice3. It uses the 20,000-character English article in 93 spans. Seven cached cells collect generation-window Chrome process-tree RSS from one scored full article each. Seven warm cells each run one excluded full article followed by five timed articles. Each article has a 1,440-minute timeout. WebGPU runs precede CPU within each phase. The order in the plan is fixed. Ming Q8_0 GGUF and six-thread Fusor mixed-quantization CPU are distinct configurations. [Published campaign table and receipts](../../../reports/nov14-multilingual-english/overview.md)

The reference machine is a MacBook Pro with an 8-core Apple M1 Pro, 16 GiB RAM, arm64, Darwin 25.6.0 and headed Google Chrome 157.0.8103.40. Use AC power and a hardware WebGPU adapter, with one dedicated benchmark tab and no parallel model runs. Other machines can run the plan with their actual machine label. The controller records the installed environment alongside the measurements. [Protocol](../../PROTOCOL.md)

## Stage the pinned runtime

Keep the current documentation in one checkout and run the benchmark from the clean source commit used by the receipts. The plan was added after that commit.

```sh
git clone https://github.com/ngelik/tts-bench.git
cd tts-bench
campaign_docs="$PWD/docs/campaigns/nov14-english"
source_commit=ab5aec3e510420adbcac9971f35f92152b19959c
git worktree add --detach ../tts-bench-nov14 "$source_commit"
cd ../tts-bench-nov14
npm ci
npm ls --depth=0
```

Node 22+ is required. The reference host used Node 22.22.3 and npm 10.9.8. The lockfile supplies Playwright Core 1.65.0, Transformers.js 3.5.1, ONNX Runtime Web 1.23.2 and the separate `onnxruntime-web-pocket` alias at 1.31.1. Read the registered terms before using the acceptance flag. The asset commands fetch and hash-check the four configurations, including voice assets, tokenizers and runtimes. The Ming GGUF entry downloads its pinned 1,742,280,896-byte model and the matching `bench_browser.js`, `bench_browser.wasm` and `THIRD-PARTY-NOTICES.txt` from the benchmark's `audio-cpp-browser-v1` release. [Pinned asset lock](https://github.com/ngelik/tts-bench/blob/ab5aec3e510420adbcac9971f35f92152b19959c/assets.lock.json) · [License details](../../LICENSING.md)

```sh
for model in fun-cosyvoice3-0.5b-2512 ming-3.0-tts-0.5b-gguf \
             audio8-realistic-0.6b-int4 ming-3.0-tts-0.5b-fusor-mix-cpu
do
  npm run assets -- fetch --model "$model" --accept-license || exit 1
  npm run assets -- verify --model "$model" --accept-license || exit 1
done
```

## Run all 14 cells

```sh
machine='MacBook Pro / Apple M1 Pro 8-core / 16 GiB / arm64'
test "$(git rev-parse HEAD)" = "$source_commit" && \
  node tools/run-campaign.mjs --plan "$campaign_docs/plan.json" \
    --machine "$machine" --accept-license
```

The runner saves the plan, status, attempts ledger and final status in `runs/campaign-*/`. Per-run receipts and scored WAVs are under `runs/<run-id>/`. Cached resource trials and warm timing trials have separate protocol IDs. The standard runner adds its own campaign ID and cell-index note to each receipt. Results are eligible for submission only after validation. [Publication workflow](../../../CONTRIBUTING.md)

## Resume after an interruption

The standard runner stops for review if a cell fails or its RAM coverage is insufficient. Inspect the failed run and its source before retrying. Preserve every attempt. To continue, pass the original plan and every `attempts.jsonl` from **this reproduction** to the helper below. The helper verifies successful receipts and their source, keeps unsupported outcomes, and writes the still-pending cells in their original order. A partially generated article has no accepted receipt and restarts at that cell. A source change starts a new comparison cohort.

```sh
# Replace this path with the campaign directory printed by your run.
ledger=runs/campaign-YOUR-RUN/attempts.jsonl
node "$campaign_docs/remaining.mjs" "$campaign_docs/plan.json" "$ledger" > runs/nov14-remaining.json && \
  if test -s runs/nov14-remaining.json; then
    node tools/run-campaign.mjs --plan runs/nov14-remaining.json \
      --machine "$machine" --accept-license
  fi
```

On a second interruption, list the previous and new ledger paths together after the original plan argument. If a host interruption happened after the run wrote its receipt but before the controller recorded the ledger entry, manually validate that receipt and reconcile the ledger before resuming.
