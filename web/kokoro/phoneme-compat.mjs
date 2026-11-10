// eSpeak may emit syllabic consonants absent from Kokoro v1's vocabulary.
// Expand their syllabic nucleus explicitly instead of mapping the mark to PAD.
export function expandSyllabicConsonants(phones) {
  return phones.replace(/([lmn])\u0329/gu, 'ə$1');
}
