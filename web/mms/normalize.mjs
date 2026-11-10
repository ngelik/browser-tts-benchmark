// MMS English's official vocabulary lacks 7/8/9. Spell numbers before its
// standard normalizer; preserve every source word and disclose this configuration.
const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
export function numberWords(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Unsupported numeric value');
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  for (const [size, label] of [[1e12,'trillion'],[1e9,'billion'],[1e6,'million'],[1000,'thousand'],[100,'hundred']]) {
    if (n >= size) return numberWords(Math.floor(n / size)) + ' ' + label + (n % size ? ' ' + numberWords(n % size) : '');
  }
}
export function normalizeMms(text) {
  const numeric = value => {
    const [whole, decimal] = value.replaceAll(',', '').split('.');
    return numberWords(Number(whole)) + (decimal === undefined ? '' : ' point ' + [...decimal].map(d => ones[Number(d)]).join(' '));
  };
  return text.replace(/\s+/gu, ' ')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => numberWords(Number(h)) + (m === '00' ? ' o clock' : Number(m) < 10 ? ' oh ' + numberWords(Number(m)) : ' ' + numberWords(Number(m))))
    .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (_, n) => numeric(n) + ' dollars')
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, numeric)
    .replace(/%/g, ' percent ').replace(/&/g, ' and ').replace(/\s+/gu, ' ').trim();
}
