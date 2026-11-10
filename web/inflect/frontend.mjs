// Independent JavaScript port of the pinned Inflect VITS frontend in
// owensong/Inflect-Micro-v2-ONNX/runtime/text/inflect_vits_frontend.py;
// source checkpoint/export revisions and the one normalization deviation are
// recorded in NOTICE.md. The symbol inventory below follows symbols.py.
const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

const WORD_OVERRIDES = Object.freeze([
  ['Qwen3', 'Qwen three'], ['Qwen', 'Qwen'], ['PyTorch', 'pie torch'],
  ['SQLite', 'ess cue lite'], ['USB-C', 'you ess bee see'],
  ['RTX 3060', 'ar tee ex thirty sixty'], ['RTX 3090', 'ar tee ex thirty ninety'],
  ['RTX 4090', 'ar tee ex forty ninety'], ['RTX 5080', 'ar tee ex fifty eighty'],
  ['RTX 5090', 'ar tee ex fifty ninety'],
]);

const LETTER_NAMES = Object.freeze({
  A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'gee',
  H: 'aitch', I: 'eye', J: 'jay', K: 'kay', L: 'ell', M: 'em', N: 'en',
  O: 'oh', P: 'pee', Q: 'cue', R: 'ar', S: 'ess', T: 'tee', U: 'you',
  V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee',
});

const ABBREVIATIONS = Object.freeze([
  ['Dr.', 'doctor'], ['Mr.', 'mister'], ['Mrs.', 'missus'], ['Ms.', 'miss'],
  ['Prof.', 'professor'], ['St.', 'saint'], ['vs.', 'versus'],
  ['etc.', 'et cetera'], ['e.g.', 'for example'], ['i.e.', 'that is'],
]);

const PUNCT_TRANSLATION = new Map([
  ['‘', "'"], ['’', "'"], ['“', '"'], ['”', '"'], ['–', '-'], ['—', ', '],
  ['…', '...'], ['(', ', '], [')', ', '], ['[', ', '], [']', ', '],
  ['{', ', '], ['}', ', '],
]);

const SMALL = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]);
const TENS = Object.freeze(['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']);
const ORDINAL_SMALL = Object.freeze([
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
  'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth',
]);
const ORDINAL_TENS = Object.freeze({
  20: 'twentieth', 30: 'thirtieth', 40: 'fortieth', 50: 'fiftieth',
  60: 'sixtieth', 70: 'seventieth', 80: 'eightieth', 90: 'ninetieth',
});
const SCALES = Object.freeze([
  '', 'thousand', 'million', 'billion', 'trillion', 'quadrillion',
  'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion',
  'decillion', 'undecillion', 'duodecillion', 'tredecillion',
  'quattuordecillion', 'quindecillion', 'sexdecillion', 'septendecillion',
  'octodecillion', 'novemdecillion', 'vigintillion',
]);
const ORDINAL_SCALES = Object.freeze(SCALES.map((scale, index) => index === 0 ? '' : scale + 'th'));

function wordsBelowThousand(value) {
  if (value < 20) return SMALL[value];
  if (value < 100) return TENS[Math.floor(value / 10)] + (value % 10 ? ' ' + SMALL[value % 10] : '');
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return SMALL[hundreds] + ' hundred' + (remainder ? ' and ' + wordsBelowThousand(remainder) : '');
}

function splitGroups(value) {
  const groups = [];
  while (value > 0n) {
    groups.push(Number(value % 1000n));
    value /= 1000n;
  }
  if (groups.length > SCALES.length) throw new Error('Inflect number is outside the supported English number-word range.');
  return groups;
}

function cardinalWords(value) {
  if (value === 0n) return 'zero';
  const groups = splitGroups(value);
  let result = '';
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    if (!group) continue;
    const separator = result
      ? (index === 0 && group < 100 ? ' and ' : ' ')
      : '';
    result += separator + wordsBelowThousand(group) + (index ? ' ' + SCALES[index] : '');
  }
  return result;
}

function ordinalBelowThousand(value) {
  if (value < 20) return ORDINAL_SMALL[value];
  if (value < 100) {
    const tens = Math.floor(value / 10) * 10;
    const remainder = value % 10;
    return remainder ? TENS[tens / 10] + ' ' + ORDINAL_SMALL[remainder] : ORDINAL_TENS[tens];
  }
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return remainder
    ? SMALL[hundreds] + ' hundred and ' + ordinalBelowThousand(remainder)
    : SMALL[hundreds] + ' hundredth';
}

function ordinalWords(value) {
  if (value < 1000n) return ordinalBelowThousand(Number(value));
  const groups = splitGroups(value);
  let lowest = groups.length - 1;
  for (let index = 0; index < groups.length; index++) {
    if (groups[index]) { lowest = index; break; }
  }
  let result = '';
  for (let index = groups.length - 1; index >= lowest; index--) {
    const group = groups[index];
    if (!group) continue;
    const isLast = index === lowest;
    let segment;
    if (isLast && index > 0) segment = wordsBelowThousand(group) + ' ' + ORDINAL_SCALES[index];
    else if (isLast) segment = ordinalBelowThousand(group);
    else segment = wordsBelowThousand(group) + ' ' + SCALES[index];
    const separator = result
      ? (isLast && index === 0 && group < 100 ? ' and ' : ' ')
      : '';
    result += separator + segment;
  }
  return result;
}

function words(value, ordinal = false) {
  const number = BigInt(value);
  return ordinal ? ordinalWords(number) : cardinalWords(number);
}

function digitWords(text) {
  return Array.from(text, digit => words(digit)).join(' ');
}

function identifierDigits(text) {
  return Array.from(text, (digit, index) => digit === '0' && index > 0 ? 'oh' : words(digit)).join(' ');
}

function expandIdentifierToken(token) {
  const match = /^([A-Za-z]?)(\d+)([A-Za-z]?)$/u.exec(token);
  if (!match) return token;
  const [, prefix, digits, suffix] = match;
  const pieces = [];
  if (prefix) pieces.push(LETTER_NAMES[prefix.toUpperCase()]);
  if (digits.length === 3 || digits.startsWith('0')) pieces.push(identifierDigits(digits));
  else pieces.push(words(digits));
  if (suffix) pieces.push(LETTER_NAMES[suffix.toUpperCase()]);
  return pieces.join(' ');
}

function validDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function expandMoney(raw) {
  const normalized = raw.replaceAll(',', '');
  const [dollars, cents] = normalized.split('.');
  const parts = [words(dollars), BigInt(dollars) === 1n ? 'dollar' : 'dollars'];
  if (cents !== undefined) {
    const centsValue = cents.slice(0, 2).padEnd(2, '0');
    if (BigInt(centsValue)) parts.push('and', words(centsValue), BigInt(centsValue) === 1n ? 'cent' : 'cents');
  }
  return parts.join(' ');
}

function expandTime(hourText, minuteText, suffix = '') {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parts = [words(hourText)];
  if (minute === 0) parts.push('o clock');
  else if (minute < 10) parts.push('oh', words(minuteText));
  else parts.push(words(minuteText));
  if (suffix) parts.push(...suffix.toLowerCase().replaceAll('.', '').replaceAll(' ', ''));
  return parts.join(' ');
}

function expandAcronym(value) {
  return Array.from(value, letter => LETTER_NAMES[letter] ?? letter).join(' ');
}

function replaceWord(text, source, replacement, flags = 'gu') {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, flags), replacement);
}

export function normalizeInflect(rawText) {
  if (typeof rawText !== 'string') throw new Error('Inflect input must be a string.');
  let text = rawText.replace(/[‘’“”–—…()\[\]{}]/gu, character => PUNCT_TRANSLATION.get(character)).replace(/\s+/gu, ' ').trim();

  for (const [source, replacement] of WORD_OVERRIDES) text = replaceWord(text, source, replacement);
  for (const [source, replacement] of ABBREVIATIONS) text = replaceWord(text, source, replacement, 'giu');

  text = text.replace(/(?<![\p{L}\p{N}_])([A-Z])(?:\.([A-Z]))+\./gu, match => Array.from(match).filter(ch => /[A-Z]/u.test(ch)).join(' '));
  text = text.replace(/(?<![\p{L}\p{N}_])(apartment|apt\.?|suite|unit|room|flight|extension|order|invoice|locker|aisle|gate)\s+([A-Za-z]?\d{1,4}[A-Za-z]?)(?![\p{L}\p{N}_])/giu,
    (_, label, token) => `${label} ${expandIdentifierToken(token)}`);
  text = text.replace(/(?<![\p{L}\p{N}_])(\d{3})(?=\s+(?:North|South|East|West)(?![\p{L}\p{N}_]))/giu, (_, digits) => identifierDigits(digits));
  text = text.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)/gu, (_, amount) => expandMoney(amount));
  text = text.replace(/(?<![\p{L}\p{N}_])(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2}|19\d{2})(?![\p{L}\p{N}_])/gu,
    (match, monthText, dayText, yearText) => {
      const month = Number(monthText), day = Number(dayText), year = Number(yearText);
      return validDate(year, month, day) ? `${MONTHS[month - 1]} ${words(dayText, true)} ${words(yearText)}` : match;
    });
  text = text.replace(/(?<![\p{L}\p{N}_])(\d{1,2}):(\d{2})\s*([AaPp]\.?\s*[Mm]\.?)?(?![\p{L}\p{N}_])/gu,
    (_, hour, minute, suffix = '') => expandTime(hour, minute, suffix));
  text = text.replace(/(?<![\p{L}\p{N}_])(\d{1,2})\s*([AaPp]\.?\s*[Mm]\.?)\b/giu,
    (_, hour, suffix) => `${words(hour)} ${Array.from(suffix.toLowerCase().replaceAll('.', '').replaceAll(' ', '')).join(' ')}`);
  text = text.replace(/(?<![\p{L}\p{N}_])(\d{3})-(\d{4})(?![\p{L}\p{N}_])/gu, (_, left, right) => `${digitWords(left)}, ${digitWords(right)}`);
  text = text.replace(/(?<![\p{L}\p{N}_])\d+(?:\.\d+){2,}(?![\p{L}\p{N}_])/gu,
    value => value.split('.').map(part => words(part)).join(' point '));
  text = text.replace(/(?<![\p{L}\p{N}_])(\d+)\.(\d+)(?![\p{L}\p{N}_])/gu,
    (_, whole, fraction) => `${words(whole)} point ${digitWords(fraction)}`);
  text = text.replace(/(?<![\p{L}\p{N}_])(\d+)(st|nd|rd|th)(?![\p{L}\p{N}_])/giu,
    (_, value) => words(value, true));
  // The final digit is required so a trailing comma stays punctuation, as in
  // Python's Unicode-aware `\b\d[\d,]*\b` in the pinned frontend.
  text = text.replace(/(?<![\p{L}\p{N}_])\d(?:[\d,]*\d)?(?![\p{L}\p{N}_])/gu, value => {
    const number = value.replaceAll(',', '');
    return number.length >= 5 && !number.startsWith('20') ? digitWords(number) : words(number);
  });
  text = text.replace(/(?<![\p{L}\p{N}_])[A-Z]{2,}(?![\p{L}\p{N}_])/gu, expandAcronym);
  text = text.replace(/,(?:\s*,)+/gu, ',');
  text = text.replace(/,\s*([.!?])/gu, '$1');
  text = text.replace(/\s+([,;:.!?])/gu, '$1');
  text = text.replace(/([,;:.!?])(?=\S)/gu, '$1 ');
  return text.replace(/\s+/gu, ' ').trim();
}

export function splitInflectText(text, limit = 280) {
  const normalized = text.split(/\s+/u).filter(Boolean).join(' ');
  const sentences = normalized.split(/(?<=[.!?;:])\s+/u).filter(Boolean);
  const chunks = [];
  for (const original of (sentences.length ? sentences : [normalized])) {
    let sentence = original;
    while (sentence.length > limit) {
      const search = sentence.slice(0, limit + 1);
      const punctuation = Math.max(search.lastIndexOf(','), search.lastIndexOf(';'), search.lastIndexOf(':'));
      const halfLimit = Math.floor(limit / 2);
      let splitAt = punctuation >= halfLimit ? punctuation + 1 : sentence.lastIndexOf(' ', limit);
      if (splitAt < halfLimit) splitAt = limit;
      chunks.push(sentence.slice(0, splitAt).trim());
      sentence = sentence.slice(splitAt).trim();
    }
    if (sentence) chunks.push(sentence);
  }
  return chunks;
}

const PUNCTUATION = new Set(Array.from(';:,.!?¡¿—…"«»“”'));
const PHONEME_OVERRIDES = Object.freeze([
  ['sˈæskɐtʃˌuːən', 'sɐskˈætʃəwən'],
  ['flʊɹɹˈɛsənt', 'flʊˈɹɛsənt'],
]);

export async function inflectPhonemeText(text, phonemize) {
  if (typeof phonemize !== 'function') throw new Error('Inflect requires the pinned browser eSpeak phonemizer.');
  const normalizedText = normalizeInflect(text);
  const pieces = normalizedText.split(/([;:,.!?¡¿—…"«»“”])/gu);
  let phonemeText = '';
  for (const piece of pieces) {
    if (!piece) continue;
    if (Array.from(piece).every(char => PUNCTUATION.has(char))) {
      phonemeText += piece;
      continue;
    }
    const leadingSpace = /^\s/u.test(piece) ? ' ' : '';
    const trailingSpace = /\s$/u.test(piece) ? ' ' : '';
    const value = await phonemize(piece.trim(), 'en-us');
    phonemeText += leadingSpace + (Array.isArray(value) ? value.join(' ') : String(value)) + trailingSpace;
  }
  for (const [source, replacement] of PHONEME_OVERRIDES) phonemeText = phonemeText.replaceAll(source, replacement);
  return { normalizedText, phonemeText: phonemeText.replace(/\s+/gu, ' ').trim() };
}

// This is the exact ordered inventory from the pinned model's symbols.py.
const SYMBOLS = Object.freeze([
  '_', ...Array.from(';:,.!?¡¿—…"«»“” '),
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'),
  ...Array.from("ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"),
]);
const SYMBOL_TO_ID = new Map(SYMBOLS.map((symbol, index) => [symbol, index]));

export function inflectTokenIds(phonemeText) {
  const ids = [];
  for (const symbol of Array.from(phonemeText)) {
    const id = SYMBOL_TO_ID.get(symbol);
    if (id === undefined) {
      const codePoint = symbol.codePointAt(0).toString(16).toUpperCase();
      throw new Error(`Inflect frontend produced unsupported symbol ${JSON.stringify(symbol)} (U+${codePoint}).`);
    }
    ids.push(id);
  }
  if (!ids.length) throw new Error('Inflect frontend produced no speakable tokens.');
  const tokens = new BigInt64Array(ids.length * 2 + 1);
  for (let index = 0; index < ids.length; index++) tokens[index * 2 + 1] = BigInt(ids[index]);
  return { tokens, phonemeCount: ids.length, spaceId: SYMBOL_TO_ID.get(' ') };
}

export function inflectSymbols() { return SYMBOLS.slice(); }
