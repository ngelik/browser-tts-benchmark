// Required Notice: Copyright 2026 Danyal Malik (https://github.com/mdanyalmalik/quick-inf)
// PolyForm Noncommercial 1.0.0. Adapted for this benchmark; see NOTICE.md and LICENSE-upstream.
import { normalizeEnglish, splitParagraph } from './text.mjs';
export function prepareText(text, tokenizer) {
    const normalized = normalizeEnglish(text);
    const chunks = splitParagraph(normalized, (s)=>tokenizer.encode(s).length);
    if (!chunks.length) throw new Error('CosyVoice3 normalized the source span to empty text.');
    return chunks;
}
export async function synthesize({ ort, sessions, tokenizer, voice, flowNoise }, text, emit) {
    const chunks = prepareText(text, tokenizer);
    const { embed, llm, flowEncoder, flowStep, hift } = sessions;
    const pastNames = kvNames(24, 'past_key_values');
    const presentNames = kvNames(24, 'present');
    const embedIds = async (ids)=>(await embed.run({
            ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [
                1,
                ids.length
            ])
        })).embeds;
    const promptFrames = voice.prompt_feat_shape[0];
    for (const [c, chunk] of chunks.entries()){
        const textIds = tokenizer.encode(chunk);
        const ids = [
            COSY_TEXT_VOCAB + COSY_SOS,
            ...voice.prompt_text_ids,
            ...textIds,
            COSY_TEXT_VOCAB + COSY_TASK,
            ...voice.prompt_speech_tokens.map((s)=>COSY_TEXT_VOCAB + s)
        ];
        let embeds = await embedIds(ids);
        let past = Object.fromEntries(pastNames.map((n)=>[
                n,
                new ort.Tensor('float32', new Float32Array(0), [
                    1,
                    2,
                    0,
                    64
                ])
            ]));
        const decoded = [];
        const kept = [];
        let silent = 0;
        let stopped = false;
        let total = 0;
        try {
            for(let i = 0; i < textIds.length * 20; i++){
                total += embeds.dims[1];
                const out = await llm.run({
                    inputs_embeds: embeds,
                    attention_mask: new ort.Tensor('int64', new BigInt64Array(total).fill(1n), [
                        1,
                        total
                    ]),
                    ...past
                });
                embeds.dispose();
                embeds = null;
                for (const t of Object.values(past))t.dispose();
                past = Object.fromEntries(presentNames.map((n, k)=>[
                        pastNames[k],
                        out[n]
                    ]));
                const logits = out.logits.data;
                const logp = logSoftmax(logits.subarray(logits.length - COSY_LOGITS));
                out.logits.dispose();
                if (i < textIds.length * 2) logp[COSY_SOS] = -Infinity;
                const token = rasSample(logp, decoded);
                if (token >= COSY_SOS) {
                    stopped = true;
                    break;
                }
                decoded.push(token);
                silent = COSY_SILENT.has(token) ? silent + 1 : 0;
                if (silent <= 5) kept.push(token);
                embeds = await embedIds([
                    COSY_TEXT_VOCAB + token
                ]);
            }
        } finally{
            embeds?.dispose();
            for (const t of Object.values(past))t.dispose();
        }
        if (!stopped || kept.length === 0) throw new Error('CosyVoice3 did not complete the speech-token sequence.');
        const tokens = [
            ...voice.prompt_speech_tokens,
            ...kept
        ];
        const enc = await flowEncoder.run({
            tokens: new ort.Tensor('int64', BigInt64Array.from(tokens, BigInt), [
                1,
                tokens.length
            ]),
            embedding: new ort.Tensor('float32', Float32Array.from(voice.embedding), [
                1,
                voice.embedding.length
            ]),
            prompt_feat: new ort.Tensor('float32', Float32Array.from(voice.prompt_feat), [
                1,
                promptFrames,
                80
            ])
        });
        const frames = enc.mu.dims[2];
        const start = new Float32Array(80 * frames);
        const random = frames > COSY_NOISE_FRAMES ? gaussian(start.length, Math.random() * 2 ** 31 | 0) : null;
        for(let ch = 0; ch < 80; ch++)for(let f = 0; f < frames; f++)start[ch * frames + f] = random ? random[ch * frames + f] : flowNoise[ch * COSY_NOISE_FRAMES + f];
        let x = new ort.Tensor('float32', start, [
            1,
            80,
            frames
        ]);
        const span = Array.from({
            length: COSY_FLOW_STEPS + 1
        }, (_, i)=>Math.fround(1 - Math.cos(Math.fround(Math.fround(i / COSY_FLOW_STEPS) * Math.fround(0.5 * Math.PI)))));
        let t = span[0];
        let dt = Math.fround(span[1] - t);
        for(let step = 1; step <= COSY_FLOW_STEPS; step++){
            const next = (await flowStep.run({
                x,
                mu: enc.mu,
                spks: enc.spks,
                cond: enc.cond,
                t: new ort.Tensor('float32', new Float32Array([
                    t
                ]), [
                    1
                ]),
                dt: new ort.Tensor('float32', new Float32Array([
                    dt
                ]), [
                    1
                ])
            })).x_next;
            x.dispose();
            x = next;
            t = Math.fround(t + dt);
            if (step < COSY_FLOW_STEPS) dt = Math.fround(span[step + 1] - t);
        }
        for (const v of Object.values(enc))v.dispose();
        const full = await x.getData();
        x.dispose();
        const melFrames = frames - promptFrames;
        const mel = new Float32Array(80 * melFrames);
        for(let ch = 0; ch < 80; ch++)mel.set(full.subarray(ch * frames + promptFrames, (ch + 1) * frames), ch * melFrames);
        const noise = Float32Array.from({
            length: 480 * melFrames * 9
        }, Math.random);
        const audio = (await hift.run({
            mel: new ort.Tensor('float32', mel, [
                1,
                80,
                melFrames
            ]),
            noise: new ort.Tensor('float32', noise, [
                1,
                480 * melFrames,
                9
            ])
        })).audio;
        emit(new Float32Array(audio.data), c + 1, chunks.length);
        audio.dispose();
    }
}
const COSY_TEXT_VOCAB = 151936;
const COSY_SOS = 6561;
const COSY_TASK = 6563;
const COSY_LOGITS = 6761;
const COSY_SILENT = new Set([
    1,
    2,
    28,
    29,
    55,
    248,
    494,
    2241,
    2242,
    2322,
    2323
]);
const COSY_FLOW_STEPS = 10;
const COSY_NOISE_FRAMES = 3000;
function logSoftmax(logits) {
    let max = -Infinity;
    for (const v of logits)max = Math.max(max, v);
    let sum = 0;
    for (const v of logits)sum += Math.exp(v - max);
    const log = Math.log(sum);
    return Float64Array.from(logits, (v)=>v - max - log);
}
function drawFrom(logp, indices) {
    const max = Math.max(...indices.map((i)=>logp[i]));
    const weights = indices.map((i)=>Math.exp(logp[i] - max));
    let u = Math.random() * weights.reduce((a, b)=>a + b, 0);
    for(let k = 0; k < indices.length; k++)if ((u -= weights[k]) < 0) return indices[k];
    return indices[indices.length - 1];
}
function rasSample(logp, decoded) {
    const order = Array.from(logp.keys()).sort((a, b)=>logp[b] - logp[a] || a - b);
    const max = logp[order[0]];
    let total = 0;
    for (const v of logp)total += Math.exp(v - max);
    const picked = [];
    let cum = 0;
    for (const i of order){
        if (cum >= 0.8 || picked.length >= 25) break;
        cum += Math.exp(logp[i] - max) / total;
        picked.push(i);
    }
    const top = drawFrom(logp, picked);
    if (decoded.slice(-10).filter((t)=>t === top).length >= 1) {
        logp[top] = -Infinity;
        return drawFrom(logp, Array.from(logp.keys()).filter((i)=>logp[i] > -Infinity));
    }
    return top;
}
export function gaussian(n, seed) {
    let s = seed >>> 0 || 1;
    const uniform = ()=>{
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return ((s >>> 0) + 1) / 4294967297;
    };
    const out = new Float32Array(n);
    for(let i = 0; i < n; i += 2){
        const r = Math.sqrt(-2 * Math.log(uniform()));
        const theta = 2 * Math.PI * uniform();
        out[i] = r * Math.cos(theta);
        if (i + 1 < n) out[i + 1] = r * Math.sin(theta);
    }
    return out;
}
function kvNames(layers, prefix) {
    return Array.from({
        length: layers
    }, (_, i)=>[
            `${prefix}.${i}.key`,
            `${prefix}.${i}.value`
        ]).flat();
}
export function fromHalf(values) {
    if (!(values instanceof Uint16Array)) return Float32Array.from(values);
    const out = new Float32Array(values.length);
    for(let i = 0; i < values.length; i++){
        const h = values[i];
        const sign = h & 0x8000 ? -1 : 1;
        const exp = h >>> 10 & 0x1f;
        const mant = h & 0x3ff;
        out[i] = exp === 0 ? sign * mant * 2 ** -24 : exp === 0x1f ? mant ? NaN : sign * Infinity : sign * (1 + mant / 1024) * 2 ** (exp - 15);
    }
    return out;
}
