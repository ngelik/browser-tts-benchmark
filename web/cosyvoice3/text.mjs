// Required Notice: Copyright 2026 Danyal Malik (https://github.com/mdanyalmalik/quick-inf)
// PolyForm Noncommercial 1.0.0. Adapted for this benchmark; see NOTICE.md and LICENSE-upstream.
const ONES = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen'
];
const TENS = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety'
];
const SCALES = [
    '',
    'thousand',
    'million',
    'billion',
    'trillion'
];
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
function tens(n) {
    if (n < 20) return ONES[n];
    return n % 10 ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[Math.floor(n / 10)];
}
function hundreds(n, and) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (!h) return rest ? and ? `and ${tens(rest)}` : tens(rest) : '';
    return rest ? `${ONES[h]} hundred and ${tens(rest)}` : `${ONES[h]} hundred`;
}
export function cardinal(digits) {
    if (/^0\d/.test(digits)) return `oh ${cardinal(digits.slice(1))}`;
    const n = digits.replace(/^0+(?=\d)/, '');
    if (/^0+$/.test(n)) return 'zero';
    if (n.length > 15) return [
        ...n
    ].map((d)=>ONES[Number(d)]).join(' ');
    const groups = [];
    for(let end = n.length; end > 0; end -= 3)groups.unshift(Number(n.slice(Math.max(0, end - 3), end)));
    const parts = [];
    groups.forEach((g, i)=>{
        if (!g) return;
        const scale = SCALES[groups.length - 1 - i];
        const words = hundreds(g, i === groups.length - 1 && groups.length > 1 && g < 100);
        parts.push(scale ? `${words} ${scale}` : words);
    });
    return parts.join(' ');
}
function year(digits) {
    const [a, b] = [
        Number(digits.slice(0, 2)),
        Number(digits.slice(2))
    ];
    if (b === 0) return a % 10 === 0 ? cardinal(digits) : `${tens(a)} hundred`;
    if (a === 20 && b < 10) return `two thousand ${ONES[b]}`;
    return `${tens(a)} ${b < 10 ? `oh ${ONES[b]}` : tens(b)}`;
}
const ORDINAL = {
    one: 'first',
    two: 'second',
    three: 'third',
    five: 'fifth',
    eight: 'eighth',
    nine: 'ninth',
    twelve: 'twelfth'
};
function ordinal(digits) {
    return cardinal(digits).replace(/(\w+)$/, (w)=>ORDINAL[w] ?? (w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`));
}
function number(digits) {
    return /^(1[1-9]|20)\d\d$/.test(digits) && !digits.endsWith('000') ? year(digits) : cardinal(digits);
}
const TITLES = {
    'Dr.': 'doctor',
    'Mr.': 'mister',
    'Mrs.': 'missus',
    'Ms.': 'miss'
};
export function normalizeEnglish(input) {
    let t = input.trim();
    t = t.replace(/\.{2,}/g, '.');
    t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m)=>m.replace(/\./g, ' dot ').replace('@', ' at '));
    t = t.replace(/\b(Dr|Mr|Mrs|Ms)\./g, (m)=>TITLES[m]);
    t = t.replace(/(?<=[A-Z]\w* )St\.(?=\s|$)/g, 'Street.');
    t = t.replace(new RegExp(`\\b(${MONTHS.join('|')}) (\\d{1,2})(?:st|nd|rd|th)?(?:, (\\d{4}))?,?`, 'g'), (_, month, day, y)=>`the ${ordinal(day)} of ${month.toLowerCase()}${y ? `, ${year(y)}` : ''}`);
    t = t.replace(/\b(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?\b)?/gi, (_, h, m, ap)=>`${cardinal(h)} ${m === '00' ? "o'clock" : Number(m) < 10 ? `oh ${ONES[Number(m)]}` : tens(Number(m))}${ap ? ` ${ap.toUpperCase()}M` : ''}`);
    t = t.replace(/\b(\d+)\s*([ap])\.?m\b\.?/gi, (_, h, ap)=>`${cardinal(h)} ${ap.toUpperCase()}M`);
    // Keep grouped amounts and scaled prices intact before expanding currency.
    t = t.replace(/\b\d{1,3}(?:,\d{3})+\b/g, amount => amount.replaceAll(',', ''));
    t = t.replace(/\$(\d+(?:\.\d+)?)\s+(thousand|million|billion|trillion)\b/gi, '$1 $2 dollars');
    t = t.replace(/\$(\d+)(?:\.(\d{2}))?\b/g, (_, d, c)=>`${cardinal(d)} dollar${d === '1' ? '' : 's'}${c && Number(c) ? ` and ${cardinal(c)} cent${c === '01' ? '' : 's'}` : ''}`);
    t = t.replace(/(\d+(?:\.\d+)?)%/g, '$1 percent');
    t = t.replace(/°\s*([FC])\b/g, (_, u)=>` degrees ${u === 'F' ? 'Fahrenheit' : 'Celsius'}`);
    t = t.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, d)=>ordinal(d));
    t = t.replace(/\b(\d+)\.(\d+)\b/g, (_, a, b)=>`${cardinal(a)} point ${[
            ...b
        ].map((d)=>ONES[Number(d)]).join(' ')}`);
    t = t.replace(/\d+/g, (d)=>number(d));
    return t.replace(/ {2,}/g, ' ');
}
const SPLIT = new Set([
    '.',
    '?',
    '!',
    ';',
    ':'
]);
export function splitParagraph(text, count, max = 80, min = 60, merge = 20) {
    if (!SPLIT.has(text[text.length - 1])) text += '.';
    const utts = [];
    let start = 0;
    for(let i = 0; i < text.length; i++){
        if (!SPLIT.has(text[i])) continue;
        if (i > start) utts.push(text.slice(start, i + 1));
        if (i + 1 < text.length && (text[i + 1] === '"' || text[i + 1] === '”')) {
            utts.push(`${utts.pop() ?? ''}${text[i + 1]}`);
            start = i + 2;
        } else start = i + 1;
    }
    const chunks = [];
    let current = '';
    for (const u of utts){
        if (count(current + u) > max && count(current) > min) {
            chunks.push(current);
            current = '';
        }
        current += u;
    }
    if (current) {
        if (count(current) < merge && chunks.length) chunks[chunks.length - 1] += current;
        else chunks.push(current);
    }
    return chunks.filter((c)=>/[\p{L}\p{N}]/u.test(c));
}
