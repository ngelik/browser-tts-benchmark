import test from 'node:test';
import assert from 'node:assert/strict';
import { selectModel, verifySelection } from '../skills/browser-tts-benchmark/scripts/select-model.mjs';
const pool = { scope: 'Test fixture: two eligible public models', candidates: ['a','b'].map(id => ({ id, source: 'https://huggingface.co/test/' + id, revision: 'a'.repeat(40), reason: 'Test fixture' })) };
test('random selection replays and verifies the complete frozen pool', () => {
 const draw = selectModel(pool, '0'.repeat(64));
 assert.deepEqual(draw, selectModel(pool, draw.seed));
 assert.deepEqual(verifySelection(draw), pool.candidates[draw.index]);
 const tampered = structuredClone(draw); tampered.selected.id = 'changed';
 assert.throws(() => verifySelection(tampered), /differs/);
 const changedPool = structuredClone(draw); changedPool.pool.scope = 'Changed eligibility';
 assert.throws(() => verifySelection(changedPool), /differs/);
});
test('invalid or duplicate candidates and malformed seeds cannot produce a draw', () => {
 assert.throws(() => selectModel({ ...pool, candidates: [pool.candidates[0]] }));
 assert.throws(() => selectModel({ ...pool, candidates: [pool.candidates[0], pool.candidates[0]] }));
 assert.throws(() => selectModel(pool, 'chosen-to-win'));
 assert.throws(() => selectModel({ ...pool, candidates: [{...pool.candidates[0], revision:'main'}, pool.candidates[1]] }));
});
