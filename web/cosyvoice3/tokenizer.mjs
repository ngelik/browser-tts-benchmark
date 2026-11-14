// Required Notice: Copyright 2026 Danyal Malik (https://github.com/mdanyalmalik/quick-inf)
// PolyForm Noncommercial 1.0.0. Adapted for this benchmark; see NOTICE.md and LICENSE-upstream.
import { byteCharsToBytes, textToByteChars } from './byte-level.mjs';
const BYTE_LEVEL_PATTERN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
const DIGIT = /\p{N}/u;
const CACHE_LIMIT = 20_000;
export class BpeTokenizer {
    vocab;
    idToToken;
    mergeRanks;
    addedById;
    addedByContent;
    normalizeNfc;
    steps;
    sentencePiece;
    ignoreMerges;
    cache = new Map();
    utf8Decoder = new TextDecoder('utf-8', {
        fatal: false
    });
    constructor(json, normalizeNfc, steps, sentencePiece){
        this.vocab = new Map(Object.entries(json.model.vocab));
        this.idToToken = [];
        for (const [token, id] of this.vocab)this.idToToken[id] = token;
        this.mergeRanks = new Map();
        json.model.merges.forEach((merge, rank)=>{
            const [a, b] = typeof merge === 'string' ? splitMerge(merge) : merge;
            this.mergeRanks.set(pairKey(a, b), rank);
        });
        this.addedById = new Map();
        this.addedByContent = new Map();
        for (const t of json.added_tokens){
            this.addedById.set(t.id, {
                content: t.content,
                special: t.special,
                lstrip: t.lstrip === true,
                rstrip: t.rstrip === true
            });
            this.addedByContent.set(t.content, t.id);
        }
        this.normalizeNfc = normalizeNfc;
        this.steps = steps;
        this.sentencePiece = sentencePiece;
        this.ignoreMerges = json.model.ignore_merges === true;
    }
    static fromJSON(json) {
        const t = json;
        const m = t.model;
        const unsupported = [];
        if (m?.type !== 'BPE') unsupported.push(`model type ${m?.type}`);
        if (m?.dropout) unsupported.push('BPE dropout');
        if (m?.continuing_subword_prefix || m?.end_of_word_suffix) unsupported.push('subword affixes');
        if (!acceptedPostProcessor(t.post_processor)) unsupported.push(`post-processor ${t.post_processor.type}`);
        const style = sentencePieceStyle(t);
        if (style) {
            if (unsupported.length > 0) throw new Error(`Unsupported tokenizer configuration: ${unsupported.join(', ')}`);
            return new BpeTokenizer(t, false, [], style);
        }
        if (m?.unk_token) unsupported.push('unk token');
        if (m?.byte_fallback) unsupported.push('byte fallback');
        const normalizer = t.normalizer;
        const noNormalizer = normalizer == null || normalizer.type === 'Sequence' && normalizer.normalizers?.length === 0;
        if (!noNormalizer && normalizer.type !== 'NFC') unsupported.push(`normalizer ${normalizer.type}`);
        const decoders = t.decoder?.type === 'Sequence' ? t.decoder.decoders ?? [] : [
            t.decoder
        ];
        if (decoders.length !== 1 || decoders[0]?.type !== 'ByteLevel') unsupported.push(`decoder ${t.decoder?.type}`);
        const pre = t.pre_tokenizer;
        const configured = pre?.type === 'Sequence' ? pre.pretokenizers ?? [] : pre ? [
            pre
        ] : [];
        const last = configured[configured.length - 1];
        const prefixSpaceIgnored = last?.add_prefix_space === true && configured.length > 1 && configured.slice(0, -1).every((p)=>p.type === 'Split');
        if (!last || last.type !== 'ByteLevel' || last.add_prefix_space !== false && !prefixSpaceIgnored) {
            unsupported.push('pre-tokenizer must end with ByteLevel (no prefix space)');
        }
        const steps = [];
        for (const step of configured){
            const source = step.pattern?.Regex;
            if (step.type === 'Digits' && step.individual_digits === true) {
                steps.push(splitIndividualDigits);
            } else if (step.type === 'Split' && typeof source === 'string' && step.behavior === 'Isolated' && step.invert === false) {
                steps.push(isolatedSplit(toJsRegex(source)));
            } else if (step.type === 'Split' && typeof source === 'string' && step.behavior === 'Removed' && step.invert === true) {
                steps.push(matchesOnly(toJsRegex(source)));
            } else if (step.type === 'ByteLevel' && step === last) {
                if (step.use_regex === true) steps.push(isolatedSplit(BYTE_LEVEL_PATTERN));
            } else {
                unsupported.push(`pre-tokenizer step ${step.type}`);
            }
        }
        if (unsupported.length > 0) throw new Error(`Unsupported tokenizer configuration: ${unsupported.join(', ')}`);
        return new BpeTokenizer(t, normalizer?.type === 'NFC', steps, null);
    }
    get vocabSize() {
        return this.idToToken.length;
    }
    addedTokenId(content) {
        return this.addedByContent.get(content);
    }
    addedTokenStrips(id) {
        const t = this.addedById.get(id);
        return {
            lstrip: t?.lstrip ?? false,
            rstrip: t?.rstrip ?? false
        };
    }
    specialTokenId(content) {
        const id = this.addedByContent.get(content);
        if (id === undefined) throw new Error(`Unknown special token ${content}`);
        return id;
    }
    encode(text, { continuation = false, afterControl = false } = {}) {
        if (this.sentencePiece) return this.encodeSentencePiece(text, continuation || afterControl && this.sentencePiece.firstOnly);
        const ids = [];
        for (const piece of this.preTokenize(text)){
            for (const id of this.encodePiece(piece))ids.push(id);
        }
        return ids;
    }
    decode(ids, { skipSpecialTokens = false, continuation = false } = {}) {
        if (this.sentencePiece) return this.decodeSentencePiece(ids, skipSpecialTokens, continuation);
        let out = '';
        let bytes = [];
        const flush = ()=>{
            if (bytes.length === 0) return;
            out += this.utf8Decoder.decode(new Uint8Array(bytes));
            bytes = [];
        };
        for (const id of ids){
            const added = this.addedById.get(id);
            if (added) {
                if (added.special && skipSpecialTokens) continue;
                flush();
                out += added.content;
                continue;
            }
            const token = this.idToToken[id];
            if (token === undefined) throw new Error(`Token id ${id} is out of range`);
            byteCharsToBytes(token, bytes);
        }
        flush();
        return out;
    }
    *preTokenize(text) {
        let segments = [
            this.normalizeNfc ? text.normalize('NFC') : text
        ];
        for (const step of this.steps)segments = segments.flatMap((segment)=>[
                ...step(segment)
            ]);
        for (const segment of segments)yield textToByteChars(segment);
    }
    encodePiece(piece) {
        const cached = this.cache.get(piece);
        if (cached) return cached;
        const whole = this.ignoreMerges ? this.vocab.get(piece) : undefined;
        const ids = whole !== undefined ? [
            whole
        ] : this.merge(Array.from(piece));
        if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
        this.cache.set(piece, ids);
        return ids;
    }
    encodeSentencePiece(text, continuation) {
        if (text === '') return [];
        const style = this.sentencePiece;
        const ids = [];
        const spaced = text.replaceAll(' ', '▁');
        const prepend = style.prepend && !continuation && !(style.firstOnly && spaced.startsWith('▁'));
        for (const word of (prepend ? `▁${spaced}` : spaced).split(style.wordBoundary)){
            const cached = this.cache.get(word);
            if (cached) {
                ids.push(...cached);
                continue;
            }
            const symbols = Array.from(word).flatMap((ch)=>this.vocab.has(ch) ? [
                    ch
                ] : Array.from(utf8.encode(ch), (b)=>`<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`));
            const wordIds = this.merge(symbols);
            if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
            this.cache.set(word, wordIds);
            ids.push(...wordIds);
        }
        return ids;
    }
    decodeSentencePiece(ids, skipSpecialTokens, continuation) {
        let out = '';
        let bytes = [];
        const flush = ()=>{
            if (bytes.length === 0) return;
            out += this.utf8Decoder.decode(new Uint8Array(bytes));
            bytes = [];
        };
        for (const id of ids){
            const added = this.addedById.get(id);
            if (added) {
                if (added.special && skipSpecialTokens) continue;
                flush();
                out += added.special ? added.content : added.content.replaceAll('▁', ' ');
                continue;
            }
            const token = this.idToToken[id];
            if (token === undefined) throw new Error(`Token id ${id} is out of range`);
            const byte = /^<0x([0-9A-F]{2})>$/.exec(token);
            if (byte) bytes.push(parseInt(byte[1], 16));
            else for (const b of utf8.encode(token.replaceAll('▁', ' ')))bytes.push(b);
        }
        flush();
        return this.sentencePiece.prepend && !continuation && out.startsWith(' ') ? out.slice(1) : out;
    }
    merge(initial) {
        let symbols = initial;
        while(symbols.length > 1){
            let bestRank = Infinity;
            let bestIndex = -1;
            for(let i = 0; i < symbols.length - 1; i++){
                const rank = this.mergeRanks.get(pairKey(symbols[i], symbols[i + 1]));
                if (rank !== undefined && rank < bestRank) {
                    bestRank = rank;
                    bestIndex = i;
                }
            }
            if (bestIndex < 0) break;
            const a = symbols[bestIndex];
            const b = symbols[bestIndex + 1];
            const merged = [];
            for(let i = 0; i < symbols.length; i++){
                if (i < symbols.length - 1 && symbols[i] === a && symbols[i + 1] === b) {
                    merged.push(a + b);
                    i++;
                } else {
                    merged.push(symbols[i]);
                }
            }
            symbols = merged;
        }
        return symbols.map((s)=>{
            const id = this.vocab.get(s);
            if (id === undefined) throw new Error(`Symbol ${JSON.stringify(s)} missing from vocabulary`);
            return id;
        });
    }
}
const utf8 = new TextEncoder();
function acceptedPostProcessor(post) {
    if (post == null) return true;
    const p = post;
    if (p.type === 'ByteLevel' || p.type === 'TemplateProcessing') return true;
    return p.type === 'Sequence' && (p.processors ?? []).every(acceptedPostProcessor);
}
const REPLACE_SPACE = {
    type: 'Replace',
    pattern: {
        String: ' '
    },
    content: '▁'
};
const SP_DECODERS = [
    {
        type: 'Replace',
        pattern: {
            String: '▁'
        },
        content: ' '
    },
    {
        type: 'ByteFallback'
    },
    {
        type: 'Fuse'
    }
];
function sentencePieceStyle(t) {
    const json = (value)=>JSON.stringify(value);
    const n = t.normalizer;
    const d = t.decoder;
    const noOpSplit = json(t.pre_tokenizer) === json({
        type: 'Split',
        pattern: {
            String: ' '
        },
        behavior: 'MergedWithPrevious',
        invert: false
    });
    const metaspace = n == null && json(t.pre_tokenizer) === json({
        type: 'Metaspace',
        replacement: '▁',
        prepend_scheme: 'first',
        split: false
    });
    if (t.model?.byte_fallback !== true || t.pre_tokenizer != null && !noOpSplit && !metaspace || d?.type !== 'Sequence') return null;
    const llamaDecoders = json(d.decoders) === json([
        ...SP_DECODERS,
        {
            type: 'Strip',
            content: ' ',
            start: 1,
            stop: 0
        }
    ]);
    const llama = llamaDecoders && (metaspace || n?.type === 'Sequence' && json(n.normalizers) === json([
        {
            type: 'Prepend',
            prepend: '▁'
        },
        REPLACE_SPACE
    ]));
    const gemma = !metaspace && json(n) === json(REPLACE_SPACE) && json(d.decoders) === json(SP_DECODERS);
    if (!llama && !gemma) return null;
    const joined = new Set();
    for (const token of Object.keys(t.model.vocab)){
        for (const m of token.matchAll(/([^▁])▁/gu))joined.add(m[1]);
    }
    const except = [
        ...joined
    ].map((c)=>c.replace(/[\\\]^-]/g, '\\$&')).join('');
    return {
        prepend: llama,
        firstOnly: metaspace,
        wordBoundary: new RegExp(`(?<=[^▁${except}])(?=▁)`, 'u')
    };
}
function matchesOnly(pattern) {
    return function*(segment) {
        for (const match of segment.matchAll(pattern))if (match[0] !== '') yield match[0];
    };
}
function pairKey(a, b) {
    return `${a}\u0000${b}`;
}
function splitMerge(merge) {
    const space = merge.indexOf(' ');
    if (space <= 0) throw new Error(`Malformed merge ${JSON.stringify(merge)}`);
    return [
        merge.slice(0, space),
        merge.slice(space + 1)
    ];
}
function isolatedSplit(pattern) {
    return function*(segment) {
        let last = 0;
        for (const match of segment.matchAll(pattern)){
            if (match[0] === '') continue;
            if (match.index > last) yield segment.slice(last, match.index);
            yield match[0];
            last = match.index + match[0].length;
        }
        if (last < segment.length) yield segment.slice(last);
    };
}
export function toJsRegex(source) {
    let out = '';
    let i = 0;
    while(i < source.length){
        if (source.startsWith('(?i:', i)) {
            let depth = 1;
            let j = i + 4;
            let body = '';
            while(j < source.length && depth > 0){
                const ch = source[j];
                if (ch === '\\') {
                    body += ch + (source[j + 1] ?? '');
                    j += 2;
                    continue;
                }
                if (ch === '(') depth++;
                if (ch === ')') depth--;
                if (depth > 0) body += ch;
                j++;
            }
            if (/[[\]\\]/.test(body)) throw new Error(`Unsupported case-insensitive group in ${source}`);
            out += '(?:' + body.replace(/[a-zA-Z]/g, (c)=>`[${c.toLowerCase()}${c.toUpperCase()}]`) + ')';
            i = j;
            continue;
        }
        out += source[i];
        i++;
    }
    return new RegExp(out, 'gu');
}
function splitIndividualDigits(text) {
    const out = [];
    let current = '';
    for (const ch of text){
        if (DIGIT.test(ch)) {
            if (current) out.push(current);
            out.push(ch);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current) out.push(current);
    return out;
}
