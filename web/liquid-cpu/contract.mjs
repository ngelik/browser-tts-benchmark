/** Pure checks shared by the CPU worker and its boundary tests. */
export function validateFusorManifest(manifest, variant) {
  if (manifest?.format !== 2 || manifest?.model?.repo !== variant.modelRepo || manifest?.model?.profile !== 'q7') {
    throw new Error('The staged Fusor bundle does not match the selected q7 model variant.');
  }
  if (variant.sourceRevision && manifest.model.revision !== variant.sourceRevision) {
    throw new Error('The staged Fusor bundle references an unexpected base-model revision.');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.model.revision ?? '') || !Array.isArray(manifest.parts) || !manifest.parts.length) {
    throw new Error('The staged Fusor manifest has no valid model revision or parts.');
  }
  const seen = new Set();
  for (const part of manifest.parts) {
    if (!Number.isSafeInteger(part.bytes) || part.bytes <= 0 || !/^[0-9a-f]{64}$/.test(part.blake3 ?? '') || seen.has(part.file)) {
      throw new Error('The staged Fusor manifest contains an invalid digest, size or duplicate file.');
    }
    const isWeight = part.file === `parts/${part.blake3}.bin`;
    const isSupport = ['config.json', 'tokenizer.json'].includes(part.file);
    if (!isWeight && !isSupport) throw new Error('The staged Fusor manifest contains an unexpected part path.');
    seen.add(part.file);
  }
  if (!seen.has('config.json') || !seen.has('tokenizer.json') || ![...seen].some(file => file.startsWith('parts/'))) {
    throw new Error('The staged Fusor manifest is missing config, tokenizer or model weights.');
  }
  return true;
}

export function validateGenerationPlan(plan, { maxReplyRows = 4096, maxContextRows = 8192 } = {}) {
  if (!plan || !Number.isSafeInteger(plan.prompt_tokens) || plan.prompt_tokens < 1 ||
      !Number.isSafeInteger(plan.max_tokens) || plan.max_tokens !== maxReplyRows) {
    throw new Error('Fusor prompt or reply budget is invalid or truncated.');
  }
  if (plan.prompt_tokens + plan.max_tokens > maxContextRows) {
    throw new Error('Fusor prompt exceeds the pinned context budget; input truncation is forbidden.');
  }
  return true;
}
