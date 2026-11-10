// Token ordering and spacing ported from KittenML/KittenTTS, Apache-2.0,
// b9517e3050adced306219f8bea5f117d87ecfaa7 kittenml/kittentts_legacy/onnx_model.py.
const punctuation = ';:,.!?¡¿—…"«»"" ';
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
const vocab = Object.fromEntries(Array.from('$' + punctuation + letters + ipa, (s, i) => [s, i]));
export function kittenTokens(phones) {
  const spaced = (phones.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) ?? []).join(' ');
  const tokens = Array.from(spaced, symbol => {
    if (vocab[symbol] === undefined) throw new Error('Unknown Kitten phoneme: ' + JSON.stringify(symbol));
    return vocab[symbol];
  });
  if (!tokens.length) throw new Error('Empty Kitten phonemes');
  return [0, ...tokens, 10, 0];
}
