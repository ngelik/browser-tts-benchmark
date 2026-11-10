import { phonemize } from '/runtimes/phonemizer/1.2.1/phonemizer.js';
export async function kittenPhones(text) {
  // eSpeak JS strips punctuation; retain delimiters as the Python preserve_punctuation frontend does.
  const pieces = text.split(/([;:,.!?¡¿—…"«»“”(){}\[\]]+)/u);
  const values = [];
  for (const piece of pieces) {
    if (!piece) continue;
    values.push(/^[;:,.!?¡¿—…"«»“”(){}\[\]]+$/u.test(piece) ? piece : (await phonemize(piece, 'en-us')).join(' '));
  }
  return values.join('');
}
