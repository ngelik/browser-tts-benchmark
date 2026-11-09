# Add or select a model

Use the user's exact model when supplied. For a random request, define and freeze
a bounded candidate pool first: language, public access, model/download size,
license suitability and a plausible browser runtime. Explain that this is a
sample of the eligible pool, not a uniform draw from all of Hugging Face.
Exclude existing benchmark cases if the user asks for a new model.

`../scripts/select-model.mjs` records a reproducible random choice from a JSON pool:

```sh
node PATH_TO_SKILL/scripts/select-model.mjs --pool candidates.json --out selection.json
node PATH_TO_SKILL/scripts/select-model.mjs --verify selection.json
```

The pool is `{ "scope": "Eligibility and exclusions", "candidates": [
{ "id": "unique-id", "source": "https://huggingface.co/owner/model",
"revision": "immutable commit", "reason": "Why eligible" } ] }`.
Each candidate can include additional public evidence. Freeze it before running
the selector; keep the generated seed, pool digest, selection and exclusions with
the experiment. The optional `--seed` replays a supplied 64-character hex seed.
Do not redraw because a result is slow or fails. Report failures and choose a
replacement only with an explicit, recorded reason consistent with user intent.

For the selected model:

1. Inspect primary model card, exact weight/config/tokenizer/voice files, license
   and upstream browser implementation. Use immutable revisions and SHA-256/byte
   pins; branch names and claimed parameter counts are not enough. Treat weights,
   frontends, vocoders and training-data notices separately. Do not invent rights.
2. Prefer the official browser runtime. Adapt only the integration boundary needed
   for local asset paths, explicit providers, raw PCM and cleanup. Document changes.
   If no usable browser runtime exists, build an adapter and disclose the port,
   export/conversion steps, preprocessing and fallback. A Python/native speed
   claim is not evidence of browser execution.
3. Implement the adapter contract in `docs/ADDING_MODELS.md`. Each model must stage
   every runtime file it needs **by itself**, including compatibility probes.
   Check a fresh model-only cache; a shared development cache can hide missing files.
4. Verify correct tokenization/phonemes, tensor types and dimensions, speaker,
   speed/scales, sample rate, sentence handling and model-specific limits. Do not
   silently drop unknown tokens or truncate the canonical article. A pronunciation
   override is a disclosed configuration, not a replacement fixture.
5. Require finite, nonempty raw PCM and complete chunk coverage; dispose sessions,
   tensors, workers and devices. Verify readback completion and real GPU dispatch
   separately from timed runs. Check official runtime cleanup rather than assuming it.
6. Run automated checks, real Chrome smoke and full-article correctness. Test
   offline cache execution when implementing a new asset/runtime path. Keep
   unsupported capabilities explicit. Commit the implementation and ensure that
   exact source revision is remotely accessible before full publishable scoring.

Publish source and model metadata, not third-party weights or unclear-license
runtime bundles. Download those to the ignored cache when terms permit. Include
source/license URLs and attributions in the manifest and documentation. If an
upstream dependency cannot be used, record the specific blocker without replacing
its output with another model's audio.
