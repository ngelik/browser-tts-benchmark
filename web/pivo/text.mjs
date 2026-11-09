// Browser port of PiVo pivo/text.py, revision 515d84fc3420da6ae138f1b81017fcbc24d622a8.
// Original implementation: Apache-2.0. CMU dictionary retains its own notice.
// Deterministic English/ASCII numeric frontend; unknown words are never silently guessed in strict mode.
const CONSONANTS='B CH D DH F G HH JH K L M N NG P R S SH T TH V W Y Z ZH'.split(' ');
const VOWELS='AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW'.split(' ');
export const SPECIAL=['<pad>','<bos>','<eos>','<space>','.',',','?','!',';',':'];
export const SYMBOLS=[...SPECIAL,...CONSONANTS,...VOWELS.flatMap(v=>['0','1','2'].map(s=>v+s))];
export const SYMBOL_TO_ID=new Map(SYMBOLS.map((symbol,index)=>[symbol,index]));
const ONES='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS='zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const ORDINALS={one:'first',two:'second',three:'third',five:'fifth',eight:'eighth',nine:'ninth',twelve:'twelfth'};
const MONTHS='January February March April May June July August September October November December'.split(' ');

export function cardinal(value) {
  const n=BigInt(value);
  if(n<0n)return `minus ${cardinal(-n)}`;
  if(n<20n)return ONES[Number(n)];
  if(n<100n)return TENS[Number(n/10n)]+(n%10n?` ${cardinal(n%10n)}`:'');
  if(n>=1000000000000000n)return [...String(n)].map(x=>ONES[Number(x)]).join(' ');
  for(const [scale,label] of [[1000000000000n,'trillion'],[1000000000n,'billion'],[1000000n,'million'],[1000n,'thousand'],[100n,'hundred']]) {
    if(n>=scale)return `${cardinal(n/scale)} ${label}${n%scale?` ${cardinal(n%scale)}`:''}`;
  }
  throw new Error('Unreachable cardinal conversion');
}

export function ordinal(value) {
  const words=cardinal(value).split(' '),last=words.at(-1);
  words[words.length-1]=ORDINALS[last]??(last.endsWith('y')?`${last.slice(0,-1)}ieth`:`${last}th`);
  return words.join(' ');
}

export function normalize(input) {
  const mapping={'’':"'",'‘':"'",'“':'"','”':'"','—':',','–':',','…':'...'};
  let text=input.normalize('NFKC').replace(/[’‘“”—–…]/gu,c=>mapping[c]);
  text=text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(_,y,m,d)=>{
    const year=Number(y),month=Number(m),day=Number(d);
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(year<1||month<1||month>12||day<1||day>days[month-1])throw new Error('Invalid ISO calendar date');
    return `${MONTHS[month-1]} ${ordinal(day)}, ${cardinal(year)}`;
  });
  if(/\d\/\d/.test(text))throw new Error('write slash dates/fractions in words, or use an ISO date');
  for(const [short,long] of Object.entries({Mr:'Mister',Mrs:'Missus',Dr:'Doctor',Prof:'Professor',St:'Saint',vs:'versus',etc:'et cetera'})) {
    text=text.replace(new RegExp(`\\b${short}\\.(?=\\s|$)`,'gi'),long);
  }
  if(/[$£€]\d[\d,]*\.\d{3,}/.test(text))throw new Error('currency amounts must have at most two decimal places');
  text=text.replace(/([$£€])(\d[\d,]*(?:\.\d{1,2})?)(?!\d)/g,(_,symbol,raw)=>{
    const [whole,fraction='']=raw.replaceAll(',','').split('.');
    const unit={'$':'dollar','£':'pound','€':'euro'}[symbol];
    let result=`${cardinal(whole)} ${unit}${BigInt(whole)!==1n?'s':''}`;
    const cents=fraction?Number(fraction.padEnd(2,'0')):0;
    if(cents)result+=` and ${cardinal(cents)}${symbol==='£'?(cents===1?' penny':' pence'):(cents===1?' cent':' cents')}`;
    return result;
  });
  text=text.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi,(_,n)=>ordinal(n));
  text=text.replace(/\b\d{1,3}(?:,\d{3})+\b/g,x=>x.replaceAll(',',''));
  text=text.replace(/-?(?:\d+\.\d+|\d+)/g,raw=>{
    const [whole,fraction]=raw.replace(/^-/,'').split('.');
    return (raw.startsWith('-')?'minus ':'')+cardinal(whole)+(fraction===undefined?'':` point ${[...fraction].map(x=>ONES[Number(x)]).join(' ')}`);
  });
  text=text.replaceAll('%',' percent ').replaceAll('&',' and ').replaceAll('+',' plus ');
  text=text.replace(/\bNASA\b/g,'nasa').replace(/\b[A-Z]{2,5}\b/g,x=>[...x].join(' '));
  text=text.replaceAll('-',' ').replace(/[()[\]{}"/]/g,' ');
  const unsupported=text.match(/[^a-zA-Z\s'.,?!;:]/gu);
  if(unsupported)throw new Error(`unsupported text characters after normalization: ${JSON.stringify([...new Set(unsupported)].sort())}`);
  return text.replace(/\s+/gu,' ').trim();
}

export function readLexicon(raw) {
  const dictionary=new Map();
  for(const line of raw.split(/\r?\n/)) {
    const parts=line.split('#',1)[0].trim().split(/\s+/);
    if(parts.length<2)continue;
    const word=parts[0].replace(/\(\d+\)$/,'').toLowerCase();
    if(!dictionary.has(word))dictionary.set(word,parts.slice(1));
  }
  return dictionary;
}

export function phonemize(text,{dictionary,strict=true,overrides={}}={}) {
  if(!(dictionary instanceof Map))throw new Error('PiVo pronunciation dictionary must be loaded');
  const normalized_text=normalize(text);
  const lowerOverrides=new Map(Object.entries(overrides).map(([word,phones])=>[word.toLowerCase(),phones]));
  const symbols=['<bos>'],unknown_words=[];
  for(const item of normalized_text.match(/[A-Za-z]+(?:'[A-Za-z]+)*|[.,?!;:]/g)??[]) {
    if(SPECIAL.includes(item)){symbols.push(item);continue;}
    const word=item.toLowerCase();
    let phones=lowerOverrides.get(word)??dictionary.get(word);
    if(!phones) {
      unknown_words.push(word);
      phones=[...word].filter(c=>/[a-z]/.test(c)).flatMap(c=>dictionary.get(c)??[]);
    }
    if(!['<bos>','<space>'].includes(symbols.at(-1)))symbols.push('<space>');
    for(const phone of phones){if(!SYMBOL_TO_ID.has(phone))throw new Error(`unknown ARPAbet phone '${phone}' in '${word}'`);symbols.push(phone);}
  }
  if(unknown_words.length&&strict)throw new Error(`out-of-vocabulary words require pronunciation overrides: ${[...new Set(unknown_words)].sort().join(', ')}`);
  symbols.push('<eos>');
  return {normalized_text,symbols,token_ids:symbols.map(x=>SYMBOL_TO_ID.get(x)),unknown_words};
}

export function applyArticleNormalization(text) {
  return text.replace(/\b(\d{4})-(\d{4})\b/g,'$1 to $2').replace(/\bA-(\d+)\b/g,'ay $1');
}
