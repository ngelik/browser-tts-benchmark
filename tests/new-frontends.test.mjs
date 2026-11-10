import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMms, numberWords} from '../web/mms/normalize.mjs';
import {kittenTokens} from '../web/kitten/tokens.mjs';
import {readVoiceNpz} from '../web/kitten/voice.mjs';
import {readFile} from 'node:fs/promises';

test('MMS preserves numeric meaning that its official vocabulary cannot encode', () => {
  assert.equal(normalizeMms('At 7:10, pay $43.75 for 26,000 items in 1998.'), 'At seven ten, pay forty three point seven five dollars for twenty six thousand items in one thousand nine hundred ninety eight.');
  assert.equal(normalizeMms('9\nitems & 8.5%'), 'nine items and eight point five percent');
  assert.equal(numberWords(0), 'zero');
  assert.throws(() => numberWords(Number.MAX_SAFE_INTEGER + 1));
});
test('MMS full fixture normalization retains every alphabetic source word and no unsupported digits', async () => {
  const source=await readFile(new URL('../fixtures/en-20000.txt',import.meta.url),'utf8');
  const normalized=normalizeMms(source);assert.doesNotMatch(normalized,/\d/);
  const words=source.match(/[A-Za-z]+/g);let at=0;
  for(const word of words){at=normalized.indexOf(word,at);assert.ok(at>=0,'Lost source word '+word);at+=word.length;}
});
test('Kitten preserves official sentinel ordering and rejects unknown phonemes', () => {
  const ids=kittenTokens('həlˈoʊ.');assert.equal(ids[0],0);assert.deepEqual(ids.slice(-2),[10,0]);
  assert.throws(()=>kittenTokens('hello🙂'),/Unknown Kitten phoneme/);
  assert.throws(()=>kittenTokens(''),/Empty Kitten/);
});
test('Kitten voice parser rejects missing entries and malformed data',()=>{
  assert.throws(()=>readVoiceNpz(new ArrayBuffer(64),'Bella'),/Voice not found/);
  const b=new ArrayBuffer(64);new DataView(b).setUint32(0,0x02014b50,true);
  assert.throws(()=>readVoiceNpz(b,'Bella'),/Voice not found/);
});

import {expandSyllabicConsonants} from '../web/kokoro/phoneme-compat.mjs';
test('Kokoro syllabic consonants retain an explicit vowel nucleus',()=>{
 assert.equal(expandSyllabicConsonants('l̩ n̩ m̩'), 'əl ən əm');
 assert.equal(expandSyllabicConsonants('r̩'), 'r̩'); // unmapped cases still fail the strict tokenizer
});
