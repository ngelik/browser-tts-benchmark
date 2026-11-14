// Required Notice: Copyright 2026 Danyal Malik (https://github.com/mdanyalmalik/quick-inf)
// PolyForm Noncommercial 1.0.0. Adapted for this benchmark; see NOTICE.md and LICENSE-upstream.
function buildByteToChar() {
    const printable = [];
    for(let b = 0x21; b <= 0x7e; b++)printable.push(b);
    for(let b = 0xa1; b <= 0xac; b++)printable.push(b);
    for(let b = 0xae; b <= 0xff; b++)printable.push(b);
    const table = new Array(256);
    for (const b of printable)table[b] = String.fromCharCode(b);
    let shifted = 0;
    for(let b = 0; b < 256; b++){
        if (table[b] === undefined) table[b] = String.fromCharCode(256 + shifted++);
    }
    return table;
}
export const BYTE_TO_CHAR = buildByteToChar();
export const CHAR_TO_BYTE = new Map(BYTE_TO_CHAR.map((ch, b)=>[
        ch,
        b
    ]));
const utf8Encoder = new TextEncoder();
export function textToByteChars(text) {
    let out = '';
    for (const b of utf8Encoder.encode(text))out += BYTE_TO_CHAR[b];
    return out;
}
export function byteCharsToBytes(token, out) {
    for (const ch of token){
        const b = CHAR_TO_BYTE.get(ch);
        if (b === undefined) throw new Error(`Character ${JSON.stringify(ch)} is not in the byte-level alphabet`);
        out.push(b);
    }
}
