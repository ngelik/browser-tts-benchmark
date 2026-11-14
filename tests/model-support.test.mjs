import test from 'node:test';import assert from 'node:assert/strict';import {validateSupport} from '../lib/model-support.mjs';import {listModels} from '../lib/catalog.mjs';
test('every catalog model has sourced support counts separate from bundled voices',()=>{for(const m of listModels())assert.equal(validateSupport(m.support),m.support);const p=listModels().find(m=>m.id==='phonon');assert.equal(p.support.voiceCount,102);assert.equal(p.support.bundledVoiceCount,1);assert.equal(p.support.languageCount,1);});
test('support rejects invented zero counts, inconsistent languages and unsourced claims; unknown is explicit',()=>{const good=structuredClone(listModels()[0].support);for(const modify of [s=>s.voiceCount=0,s=>s.languageCount=2,s=>s.sources=[],s=>s.bundledVoiceCount=999]){const s=structuredClone(good);modify(s);assert.throws(()=>validateSupport(s));}const unknown={...good,voiceCount:null,bundledVoiceCount:null,languageCount:null,languages:null};assert.doesNotThrow(()=>validateSupport(unknown));});

test('source links reject embedded credentials and unsafe Markdown characters',()=>{for(const u of ['https://name:secret@example.com/source','https://example.com/<x>','https://example.com/[bad]','https://example.com/a b']){const s=structuredClone(listModels()[0].support);s.sources=[u];assert.throws(()=>validateSupport(s));}});

import {readFile} from 'node:fs/promises';import {renderReport} from '../tools/report.mjs';
test('support prose is rendered as plain text, not injected markup',async()=>{const d=JSON.parse(await readFile('results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/result.json'));d.cells[0].support={...listModels()[0].support,scope:'[fake](https://example.com)',notes:'<a href="https://example.com">fake</a>'};const text=renderReport(d).markdown;assert.ok(!text.includes('[fake](https://example.com)'));assert.ok(!text.includes('<a href='));assert.ok(text.includes('&lt;a href='));});

test('support prose escaping preserves parentheses, brackets, pipes and literal words',async()=>{
 const d=JSON.parse(await readFile('results/2026-11-09t07-33-26-519z-piper-en-gb-southern-english-female-low-cpu-warm-810f85a3/result.json'));
 d.cells[0].support={...listModels()[0].support,scope:'[fake](https://example.com)',notes:'M3 (Robert) | English & more.'};
 const text=renderReport(d).markdown;
 assert.ok(text.includes('\\[fake\\]\\(https://example.com\\)'));
 assert.ok(text.includes('M3 \\(Robert\\) \\| English &amp; more.'));
 assert.ok(!text.includes('export function renderReport'));
});

test('reference-free models can ship zero preset voices', () => {
  const support = {...listModels()[0].support, voiceCount: null, bundledVoiceCount: 0};
  assert.doesNotThrow(() => validateSupport(support));
  assert.throws(() => validateSupport({...support, bundledVoiceCount: -1}));
});
