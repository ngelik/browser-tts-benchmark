// Adapted from KevinAHM/pocket-tts-web at SPACE_REVISION; see NOTICE.md.
import { assertPocketUtteranceEnded } from './contract.mjs';
import { ONNX_ROOT, TOKENIZER_JSON_URL, TRANSFORMERS_ROOT } from './settings.mjs';

let ort = null;
let executionProviders = ['wasm'];
let activeGenerationTensors = null;
const persistentTensors = new Set();
const disposedTensors = new WeakSet();

const DEFAULT_LANGUAGE = "english_2026-04";
const LANGUAGE_BUNDLES = ["english_2026-04", "german", "italian", "portuguese", "spanish"];
const MODEL_STEMS = {
    mimi_encoder: "mimi_encoder_int8.onnx",
    text_conditioner: "text_conditioner_int8.onnx",
    flow_lm_main: "flow_lm_main_int8.onnx",
    flow_lm_flow: "flow_lm_flow_int8.onnx",
    mimi_decoder: "mimi_decoder_int8.onnx",
};
const DEBUG_LOGS = false;
const CHUNK_GAP_SEC = 0.25;
const MAX_FRAMES = 500;
const LSD_STEPS = 1;
const RESET_FLOW_STATE_EACH_CHUNK = true;
const RESET_MIMI_STATE_EACH_CHUNK = true;

let currentLanguage = DEFAULT_LANGUAGE;
let bundleMetadata = null;
let tokenizerProcessor = null;
let tokenizerData = null;
let bosBeforeVoice = null;

let mimiEncoderSession = null;
let textConditionerSession = null;
let flowLmMainSession = null;
let flowLmFlowSession = null;
let mimiDecoderSession = null;

let currentSampleRate = 24000;
let currentSamplesPerFrame = 1920;
let currentLatentDim = 32;
let currentConditioningDim = 1024;
let currentMaxTokenPerChunk = 50;

let predefinedVoiceRecords = {};
let customVoiceEmbedding = null;
let currentVoiceName = null;
let voiceConditioningCache = new Map();

let stTensors = [];
let isGenerating = false;
let isReady = false;

function bundlePath(language, filename) {
    return `${ONNX_ROOT}${language}/${filename}`;
}

export function configurePocketWorker({ ort: runtime, providers }) {
    if (!runtime?.InferenceSession?.create || !runtime?.Tensor) {
        throw new Error('Pocket TTS requires a complete local ONNX Runtime Web module.');
    }
    if (!Array.isArray(providers) || providers.length === 0) {
        throw new Error('Pocket TTS requires explicit ONNX execution providers.');
    }
    ort = runtime;
    executionProviders = [...providers];
}

function debugLog(...args) {
    if (DEBUG_LOGS) {
        console.log(...args);
    }
}

function makeFilledArray(shape, dtype, fill) {
    const size = shape.reduce((a, b) => a * b, 1);
    let data;

    if (dtype === "int64") {
        data = new BigInt64Array(size);
    } else if (dtype === "bool") {
        data = new Uint8Array(size);
    } else {
        data = new Float32Array(size);
        if (fill === "nan") {
            data.fill(NaN);
        } else if (fill === "ones") {
            data.fill(1);
        }
    }

    return data;
}

function createTensor(dtype, data, dims) {
    return trackPocketTensor(new ort.Tensor(dtype, data, dims));
}

function trackOutputs(result) {
    for (const value of Object.values(result ?? {})) {
        if (typeof value?.dispose === 'function') trackPocketTensor(value);
    }
    return result;
}

async function runSession(session, feeds) {
    return trackOutputs(await session.run(feeds));
}

export function trackPocketTensor(tensor) {
    if (typeof tensor?.dispose === 'function') (activeGenerationTensors ?? persistentTensors).add(tensor);
    return tensor;
}

export function releasePocketTensor(tensor) {
    if (!tensor || typeof tensor.dispose !== 'function') return;
    if (disposedTensors.has(tensor)) return;
    disposedTensors.add(tensor);
    activeGenerationTensors?.delete(tensor);
    persistentTensors.delete(tensor);
    tensor.dispose();
}

const releaseTensor = releasePocketTensor;

function releaseState(state, keep = new Set()) {
    for (const tensor of new Set(Object.values(state ?? {}))) {
        if (!keep.has(tensor)) releaseTensor(tensor);
    }
}

function releaseResultExcept(result, retainedNames = new Set(), retainedTensors = new Set()) {
    for (const [name, tensor] of Object.entries(result ?? {})) {
        if (!retainedNames.has(name) && !retainedTensors.has(tensor)) releaseTensor(tensor);
    }
}

function manifestOutputNames(manifest) {
    return new Set(manifest.map(entry => entry.output_name));
}

function releaseOwnedSet(tensors, label) {
    let firstError = null;
    for (const tensor of tensors) {
        try { releaseTensor(tensor); }
        catch (error) { firstError ??= error; }
    }
    tensors.clear();
    if (firstError) throw new Error(`${label} failed: ${String(firstError?.message ?? firstError)}`);
}

export function beginPocketGenerationScope() {
    if (activeGenerationTensors) throw new Error('Nested Pocket TTS tensor scopes are not supported.');
    const owned = new Set();
    activeGenerationTensors = owned;
    let disposed = false;
    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            if (activeGenerationTensors !== owned) throw new Error('Pocket TTS tensor scope ownership changed unexpectedly.');
            activeGenerationTensors = null;
            releaseOwnedSet(owned, 'Pocket TTS temporary tensor disposal');
        },
    };
}

function initStateFromManifest(manifest) {
    const state = {};
    for (const entry of manifest) {
        state[entry.input_name] = createTensor(
            entry.dtype,
            makeFilledArray(entry.shape, entry.dtype, entry.fill),
            entry.shape
        );
    }
    return state;
}

function cloneState(state) {
    return { ...state };
}

function updateStateFromManifestOutputs(state, result, manifest) {
    for (const entry of manifest) {
        state[entry.input_name] = result[entry.output_name];
    }
}

function groupVoiceRecordByModule(record) {
    const grouped = {};
    for (const [key, value] of Object.entries(record)) {
        const slash = key.indexOf("/");
        if (slash === -1) continue;
        const moduleName = key.slice(0, slash);
        const tensorKey = key.slice(slash + 1);
        if (!grouped[moduleName]) {
            grouped[moduleName] = {};
        }
        grouped[moduleName][tensorKey] = value;
    }
    return grouped;
}

function adaptTypedArray(source, entry) {
    const targetShape = entry.shape;
    const targetSize = targetShape.reduce((a, b) => a * b, 1);
    const target = makeFilledArray(targetShape, entry.dtype, entry.fill);

    if (source.shape.length === targetShape.length) {
        const exactShape = source.shape.every((dim, idx) => dim === targetShape[idx]);
        if (exactShape) {
            if (entry.dtype === "int64") {
                return new BigInt64Array(source.data);
            }
            if (entry.dtype === "bool") {
                return new Uint8Array(source.data);
            }
            return new Float32Array(source.data);
        }
    }

    if (source.data.length === targetSize) {
        if (entry.dtype === "int64") {
            return new BigInt64Array(source.data);
        }
        if (entry.dtype === "bool") {
            return new Uint8Array(source.data);
        }
        return new Float32Array(source.data);
    }

    if (source.shape.length !== targetShape.length) {
        return target;
    }

    const strides = [];
    let stride = 1;
    for (let i = source.shape.length - 1; i >= 0; i--) {
        strides[i] = stride;
        stride *= source.shape[i];
    }

    const indices = new Array(source.shape.length).fill(0);
    const maxIndices = source.shape.map((dim, idx) => Math.min(dim, targetShape[idx]));

    function targetIndex(coords) {
        let idx = 0;
        let tStride = 1;
        for (let i = targetShape.length - 1; i >= 0; i--) {
            idx += coords[i] * tStride;
            tStride *= targetShape[i];
        }
        return idx;
    }

    let done = false;
    while (!done) {
        let sourceIdx = 0;
        for (let i = 0; i < indices.length; i++) {
            sourceIdx += indices[i] * strides[i];
        }
        target[targetIndex(indices)] = source.data[sourceIdx];

        for (let dim = indices.length - 1; dim >= 0; dim--) {
            indices[dim] += 1;
            if (indices[dim] < maxIndices[dim]) {
                break;
            }
            indices[dim] = 0;
            if (dim === 0) {
                done = true;
            }
        }
    }

    return target;
}

function deriveStep(moduleState) {
    if (moduleState.step) {
        return { data: BigInt64Array.from([BigInt(moduleState.step.data[0])]), shape: [1], dtype: "int64" };
    }
    if (moduleState.offset && !moduleState.end_offset) {
        return { data: BigInt64Array.from([BigInt(moduleState.offset.data[0])]), shape: [1], dtype: "int64" };
    }
    if (moduleState.current_end) {
        return { data: BigInt64Array.from([BigInt(moduleState.current_end.shape[0])]), shape: [1], dtype: "int64" };
    }
    return { data: BigInt64Array.from([0n]), shape: [1], dtype: "int64" };
}

function stateFromVoiceRecord(record) {
    const grouped = groupVoiceRecordByModule(record);
    const state = initStateFromManifest(bundleMetadata.flow_lm_state_manifest);

    for (const entry of bundleMetadata.flow_lm_state_manifest) {
        const moduleState = grouped[entry.module] || {};
        let source = moduleState[entry.key];
        if (!source && entry.key === "step") {
            source = deriveStep(moduleState);
        }
        if (!source) {
            continue;
        }

        const data = adaptTypedArray(source, entry);
        state[entry.input_name] = createTensor(entry.dtype, data, entry.shape);
    }

    return state;
}

function prepareVoiceEmbeddingData(voiceEmb) {
    let data = voiceEmb.data;
    let dims = voiceEmb.shape.slice();

    if (bundleMetadata.insert_bos_before_voice && bosBeforeVoice) {
        const bosData = bosBeforeVoice.data;
        const combined = new Float32Array(bosData.length + data.length);
        combined.set(bosData, 0);
        combined.set(data, bosData.length);
        data = combined;
        dims = [1, dims[1] + bosBeforeVoice.shape[1], dims[2]];
    }

    return createTensor("float32", data, dims);
}

async function buildVoiceConditionedState(voiceEmb) {
    const flowLmState = initStateFromManifest(bundleMetadata.flow_lm_state_manifest);
    const emptySeq = createTensor("float32", new Float32Array(0), [1, 0, currentLatentDim]);
    const voiceTensor = prepareVoiceEmbeddingData(voiceEmb);
    try {
        const result = await runSession(flowLmMainSession, {
            sequence: emptySeq,
            text_embeddings: voiceTensor,
            ...flowLmState,
        });
        const nextState = cloneState(flowLmState);
        updateStateFromManifestOutputs(nextState, result, bundleMetadata.flow_lm_state_manifest);
        const retained = new Set(Object.values(nextState));
        releaseState(flowLmState, retained);
        releaseResultExcept(result, manifestOutputNames(bundleMetadata.flow_lm_state_manifest), retained);
        return nextState;
    } finally {
        releaseTensor(emptySeq);
        releaseTensor(voiceTensor);
    }
}

async function ensurePredefinedVoiceCached(voiceName, options = {}) {
    const { force = false, statusText = "Preparing voice..." } = options;
    if (!predefinedVoiceRecords[voiceName]) {
        throw new Error(`Unknown built-in voice: ${voiceName}`);
    }

    if (!force && voiceConditioningCache.has(voiceName)) {
        return voiceConditioningCache.get(voiceName);
    }

    postMessage({ type: "status", status: statusText, state: "loading" });
    const conditioned = stateFromVoiceRecord(predefinedVoiceRecords[voiceName]);
    voiceConditioningCache.set(voiceName, conditioned);
    return conditioned;
}

async function ensureCustomVoiceCached(options = {}) {
    const { force = false, statusText = "Preparing custom voice..." } = options;
    if (!customVoiceEmbedding) {
        throw new Error("No custom voice loaded.");
    }

    if (!force && voiceConditioningCache.has("custom")) {
        return voiceConditioningCache.get("custom");
    }

    postMessage({ type: "status", status: statusText, state: "loading" });
    const conditioned = await buildVoiceConditionedState(customVoiceEmbedding);
    voiceConditioningCache.set("custom", conditioned);
    return conditioned;
}

function parseNpyFloat32(buffer) {
    const view = new DataView(buffer);
    const magic = new Uint8Array(buffer, 0, 6);
    const expected = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
    for (let i = 0; i < expected.length; i++) {
        if (magic[i] !== expected[i]) {
            throw new Error("Invalid NPY file");
        }
    }

    const major = view.getUint8(6);
    const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
    const headerOffset = major === 1 ? 10 : 12;
    const headerText = new TextDecoder().decode(new Uint8Array(buffer, headerOffset, headerLen));
    const shapeMatch = headerText.match(/\(\s*([0-9,\s]+)\)/);
    if (!shapeMatch) {
        throw new Error("Could not parse NPY shape");
    }
    const shape = shapeMatch[1]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10));
    const dataOffset = headerOffset + headerLen;
    const data = new Float32Array(buffer, dataOffset);
    return { data: new Float32Array(data), shape };
}

function parseVoiceStatesBin(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const magic = new TextDecoder().decode(new Uint8Array(buffer, offset, 5));
    offset += 5;
    if (magic !== "PTVB1") {
        throw new Error("Invalid voices.bin header");
    }

    const voices = {};
    const voiceCount = view.getUint32(offset, true);
    offset += 4;

    for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex++) {
        const nameLen = view.getUint16(offset, true);
        offset += 2;
        const name = new TextDecoder().decode(new Uint8Array(buffer, offset, nameLen));
        offset += nameLen;

        const tensorCount = view.getUint16(offset, true);
        offset += 2;
        const tensors = {};

        for (let tensorIndex = 0; tensorIndex < tensorCount; tensorIndex++) {
            const keyLen = view.getUint16(offset, true);
            offset += 2;
            const key = new TextDecoder().decode(new Uint8Array(buffer, offset, keyLen));
            offset += keyLen;

            const dtypeCode = view.getUint8(offset);
            offset += 1;
            const rank = view.getUint8(offset);
            offset += 1;

            const shape = [];
            for (let dimIndex = 0; dimIndex < rank; dimIndex++) {
                shape.push(view.getUint32(offset, true));
                offset += 4;
            }

            const byteLength = view.getUint32(offset, true);
            offset += 4;

            let data;
            if (dtypeCode === 0) {
                data = new Float32Array(buffer.slice(offset, offset + byteLength));
            } else if (dtypeCode === 1) {
                data = new BigInt64Array(buffer.slice(offset, offset + byteLength));
            } else if (dtypeCode === 2) {
                data = new Uint8Array(buffer.slice(offset, offset + byteLength));
            } else {
                throw new Error(`Unsupported voices.bin dtype code: ${dtypeCode}`);
            }
            offset += byteLength;

            tensors[key] = {
                data,
                shape,
                dtype: dtypeCode === 0 ? "float32" : dtypeCode === 1 ? "int64" : "bool",
            };
        }

        voices[name] = tensors;
    }

    return voices;
}

async function encodeVoiceAudio(audioData) {
    const input = createTensor("float32", audioData, [1, 1, audioData.length]);
    let outputs = null;
    try {
        outputs = await runSession(mimiEncoderSession, { audio: input });
        const embeddings = outputs[mimiEncoderSession.outputNames[0]];

        let dims = embeddings.dims.slice();
        let data = new Float32Array(embeddings.data);
        while (dims.length > 3) {
            if (dims[0] !== 1) break;
            dims = dims.slice(1);
        }
        if (dims.length < 3) {
            dims = [1, dims[0], dims[1]];
        }

        return { data, shape: dims };
    } finally {
        releaseTensor(input);
        releaseResultExcept(outputs);
    }
}

function prepareTextPrompt(text) {
    let prompt = text.trim();
    if (!prompt) {
        return { text: "", framesAfterEos: 1 };
    }

    prompt = prompt.replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ");
    if (bundleMetadata.remove_semicolons) {
        prompt = prompt.replace(/;/g, ",");
    }

    const wordCount = prompt.split(/\s+/).filter(Boolean).length;
    let framesAfterEos = wordCount <= 4 ? 3 : 1;
    if (bundleMetadata.model_recommended_frames_after_eos != null) {
        framesAfterEos = Number(bundleMetadata.model_recommended_frames_after_eos);
    }

    if (prompt && !/[A-ZÀ-Þ]/.test(prompt[0])) {
        prompt = prompt[0].toUpperCase() + prompt.slice(1);
    }
    if (prompt && /[0-9A-Za-zÀ-ÿ]/.test(prompt[prompt.length - 1])) {
        prompt += ".";
    }
    if (bundleMetadata.pad_with_spaces_for_short_inputs && wordCount < 5) {
        prompt = "        " + prompt;
    }

    return { text: prompt, framesAfterEos };
}

const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+|[^.!?]+$/g;

function splitTextIntoSentences(text) {
    const matches = text.match(SENTENCE_SPLIT_RE);
    if (!matches) return [];
    return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function splitTokenIdsIntoChunks(tokenIds, maxTokens) {
    const chunks = [];
    for (let i = 0; i < tokenIds.length; i += maxTokens) {
        const chunkText = tokenizerProcessor.decodeIds(tokenIds.slice(i, i + maxTokens)).trim();
        if (chunkText) {
            chunks.push(chunkText);
        }
    }
    return chunks;
}

function splitIntoBestSentences(text) {
    const prepared = prepareTextPrompt(text);
    if (!prepared.text) {
        return { chunks: [], framesAfterEos: prepared.framesAfterEos };
    }

    const sentences = splitTextIntoSentences(prepared.text);
    if (!sentences.length) {
        return { chunks: [prepared.text], framesAfterEos: prepared.framesAfterEos };
    }

    const chunks = [];
    let currentChunk = "";

    for (const sentenceText of sentences) {
        const sentenceTokenIds = tokenizerProcessor.encodeIds(sentenceText);
        const sentenceTokens = sentenceTokenIds.length;

        if (sentenceTokens > currentMaxTokenPerChunk) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            const splitChunks = splitTokenIdsIntoChunks(sentenceTokenIds, currentMaxTokenPerChunk);
            for (const splitChunk of splitChunks) {
                if (splitChunk) {
                    chunks.push(splitChunk.trim());
                }
            }
            continue;
        }

        if (!currentChunk) {
            currentChunk = sentenceText;
            continue;
        }

        const combined = `${currentChunk} ${sentenceText}`;
        const combinedTokens = tokenizerProcessor.encodeIds(combined).length;
        if (combinedTokens > currentMaxTokenPerChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sentenceText;
        } else {
            currentChunk = combined;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return { chunks, framesAfterEos: prepared.framesAfterEos };
}

function precomputeFlowBuffers() {
    stTensors = [];
    const dt = 1.0 / LSD_STEPS;
    for (let step = 0; step < LSD_STEPS; step++) {
        const s = step / LSD_STEPS;
        const t = s + dt;
        stTensors.push({
            s: createTensor("float32", new Float32Array([s]), [1, 1]),
            t: createTensor("float32", new Float32Array([t]), [1, 1]),
        });
    }
}

async function loadOrt() {
    if (!ort) throw new Error('Pocket TTS ONNX Runtime was not initialized locally.');
    precomputeFlowBuffers();
}

async function releaseSession(session) {
    if (!session) {
        return;
    }
    if (typeof session.release === "function") {
        await session.release();
    }
}

export async function releasePocketResources() {
    let firstError = null;
    const sessions = new Set([
        mimiEncoderSession,
        textConditionerSession,
        flowLmMainSession,
        flowLmFlowSession,
        mimiDecoderSession,
    ]);
    for (const session of sessions) {
        try { await releaseSession(session); }
        catch (error) { firstError ??= error; }
    }
    if (activeGenerationTensors) {
        try { releaseOwnedSet(activeGenerationTensors, 'Pocket TTS active tensor disposal'); }
        catch (error) { firstError ??= error; }
        activeGenerationTensors = null;
    }
    try { releaseOwnedSet(persistentTensors, 'Pocket TTS persistent tensor disposal'); }
    catch (error) { firstError ??= error; }
    if (firstError) throw new Error(`Pocket TTS cleanup failed: ${String(firstError?.message ?? firstError)}`);
}

async function loadBundle(language, { initialLoad = false } = {}) {
    if (!LANGUAGE_BUNDLES.includes(language)) {
        throw new Error(`Unsupported language bundle: ${language}`);
    }

    await loadOrt();

    postMessage({ type: "status", status: `Loading ${language} bundle...`, state: "loading" });
    currentLanguage = language;

    const metadataResponse = await fetch(bundlePath(language, "bundle.json"));
    if (!metadataResponse.ok) {
        throw new Error(`Failed to load bundle metadata for ${language}`);
    }
    bundleMetadata = await metadataResponse.json();

    currentSampleRate = Number(bundleMetadata.sample_rate);
    currentSamplesPerFrame = Number(bundleMetadata.samples_per_frame);
    currentLatentDim = Number(bundleMetadata.latent_dim);
    currentConditioningDim = Number(bundleMetadata.conditioning_dim);
    currentMaxTokenPerChunk = Number(bundleMetadata.max_token_per_chunk || 50);
    isReady = false;

    await Promise.all([
        releaseSession(mimiEncoderSession),
        releaseSession(textConditionerSession),
        releaseSession(flowLmMainSession),
        releaseSession(flowLmFlowSession),
        releaseSession(mimiDecoderSession),
    ]);

    const sessionOptions = {
        executionProviders: [...executionProviders],
        graphOptimizationLevel: "all",
    };

    // ORT WebGPU 1.31.1 rejects overlapping InferenceSession.create calls;
    // create these in order and retain each handle so partial failures dispose cleanly.
    mimiEncoderSession = await ort.InferenceSession.create(bundlePath(language, MODEL_STEMS.mimi_encoder), sessionOptions);
    textConditionerSession = await ort.InferenceSession.create(bundlePath(language, MODEL_STEMS.text_conditioner), sessionOptions);
    flowLmMainSession = await ort.InferenceSession.create(bundlePath(language, MODEL_STEMS.flow_lm_main), sessionOptions);
    flowLmFlowSession = await ort.InferenceSession.create(bundlePath(language, MODEL_STEMS.flow_lm_flow), sessionOptions);
    mimiDecoderSession = await ort.InferenceSession.create(bundlePath(language, MODEL_STEMS.mimi_decoder), sessionOptions);

    const tokenizerUrl = new URL(TOKENIZER_JSON_URL, self.location.href);
    const transformersUrl = new URL(`${TRANSFORMERS_ROOT}transformers.min.js`, self.location.href);
    if (tokenizerUrl.origin !== self.location.origin || transformersUrl.origin !== self.location.origin) {
        throw new Error('Pocket TTS tokenizer assets must be loaded from the local origin.');
    }
    const tokenizerResponse = await fetch(tokenizerUrl.href);
    if (!tokenizerResponse.ok) throw new Error(`Failed to load hash-locked tokenizer JSON for ${language}: HTTP ${tokenizerResponse.status}`);
    tokenizerData = await tokenizerResponse.json();
    const transformerModule = await import(transformersUrl.href);
    transformerModule.env.allowRemoteModels = false;
    transformerModule.env.allowLocalModels = false;
    const tokenizer = new transformerModule.PreTrainedTokenizer(tokenizerData, {
        tokenizer_class: 'PreTrainedTokenizer',
        unk_token: tokenizerData.model?.unk_token ?? '<unk>',
    });
    const unknownId = Number(tokenizerData.model?.unk_id);
    tokenizerProcessor = {
        encodeIds(text) {
            const ids = tokenizer.encode(text, { add_special_tokens: false });
            if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isSafeInteger)) {
                throw new Error('Pocket TTS tokenizer returned empty or invalid token IDs.');
            }
            if (Number.isSafeInteger(unknownId) && ids.includes(unknownId)) {
                throw new Error('Pocket TTS tokenizer returned an unknown token ID.');
            }
            return ids;
        },
        decodeIds(ids) {
            return tokenizer.decode(Array.from(ids), { skip_special_tokens: true, clean_up_tokenization_spaces: false });
        },
    };

    bosBeforeVoice = null;
    if (bundleMetadata.bos_before_voice_file) {
        const bosResponse = await fetch(bundlePath(language, bundleMetadata.bos_before_voice_file));
        if (bosResponse.ok) {
            bosBeforeVoice = parseNpyFloat32(await bosResponse.arrayBuffer());
        }
    }

    predefinedVoiceRecords = {};
    const voicesResponse = await fetch(bundlePath(language, "voices.bin"));
    if (voicesResponse.ok) {
        predefinedVoiceRecords = parseVoiceStatesBin(await voicesResponse.arrayBuffer());
    }

    voiceConditioningCache = new Map();
    let defaultVoice = bundleMetadata.predefined_voices?.includes("alba") ? "alba" : null;
    if (!defaultVoice) {
        defaultVoice = Object.keys(predefinedVoiceRecords)[0] || null;
    }
    currentVoiceName = defaultVoice;

    if (defaultVoice) {
        await ensurePredefinedVoiceCached(defaultVoice, {
            force: true,
            statusText: `Preparing voice (${defaultVoice})...`,
        });
    }

    if (customVoiceEmbedding) {
        voiceConditioningCache.delete("custom");
    }

    isReady = true;

    postMessage({
        type: "voices_loaded",
        voices: bundleMetadata.predefined_voices || Object.keys(predefinedVoiceRecords),
        defaultVoice,
        language,
    });
    postMessage({
        type: "bundle_loaded",
        language,
        sampleRate: currentSampleRate,
        initialLoad,
    });
    postMessage({ type: "status", status: "Ready", state: "idle" });
    postMessage({ type: "model_status", status: "ready", text: `Ready (${language})` });
    if (initialLoad) {
        postMessage({ type: "loaded" });
    }
}

export async function handlePocketMessage(e) {
    const { type, data } = e.data;

    try {
        if (type === "load") {
            await loadBundle(DEFAULT_LANGUAGE, { initialLoad: true });
            return;
        }

        if (type === "set_language") {
            if (isGenerating) {
                postMessage({ type: "error", error: "Cannot switch language while generation is running." });
                return;
            }
            await loadBundle(data.language, { initialLoad: false });
            return;
        }

        if (type === "stop") {
            isGenerating = false;
            postMessage({ type: "status", status: "Stopped", state: "idle" });
            return;
        }

        if (!isReady) {
            postMessage({ type: "error", error: "Models are not loaded yet." });
            return;
        }

        if (type === "encode_voice") {
            if (isGenerating) {
                postMessage({ type: "error", error: "Cannot encode a voice while generation is running." });
                return;
            }
            customVoiceEmbedding = await encodeVoiceAudio(data.audio);
            currentVoiceName = "custom";
            await ensureCustomVoiceCached({ force: true, statusText: "Preparing custom voice..." });
            postMessage({ type: "voice_encoded", voiceName: "custom" });
            postMessage({ type: "status", status: "Ready", state: "idle" });
            return;
        }

        if (type === "set_voice") {
            if (isGenerating) {
                postMessage({ type: "error", error: "Cannot switch voice while generation is running." });
                return;
            }
            if (data.voiceName === "custom") {
                await ensureCustomVoiceCached({ statusText: "Preparing custom voice..." });
                currentVoiceName = "custom";
            } else {
                await ensurePredefinedVoiceCached(data.voiceName, {
                    statusText: `Preparing voice (${data.voiceName})...`,
                });
                currentVoiceName = data.voiceName;
            }
            postMessage({ type: "voice_set", voiceName: currentVoiceName });
            postMessage({ type: "status", status: "Ready", state: "idle" });
            return;
        }

        if (type === "generate") {
            if (isGenerating) {
                return;
            }
            await startGeneration(data.text, data.voice || currentVoiceName);
        }
    } catch (err) {
        console.error("Worker error:", err);
        postMessage({ type: "error", error: err.toString() });
    }
}

export function auditPocketFrontend(text) {
    if (!tokenizerProcessor) throw new Error('Pocket TTS tokenizer is not initialized.');
    if (typeof text !== 'string') throw new Error('Pocket TTS frontend audit requires string text.');
    const prepared = prepareTextPrompt(text);
    const { chunks, framesAfterEos } = splitIntoBestSentences(text);
    const utterances = chunks.map(utterance => {
        const ids = tokenizerProcessor.encodeIds(utterance);
        return { text: utterance, ids, decoded: tokenizerProcessor.decodeIds(ids) };
    });
    return { prepared, chunks, framesAfterEos, utterances };
}

async function startGeneration(text, voiceName) {
    isGenerating = true;
    postMessage({ type: "status", status: "Generating...", state: "running" });
    postMessage({ type: "generation_started", data: { time: performance.now() } });

    try {
        const { chunks, framesAfterEos } = splitIntoBestSentences(text);
        if (!chunks.length) {
            throw new Error("No text to generate");
        }

        if (voiceName === "custom") {
            await ensureCustomVoiceCached({ statusText: "Preparing custom voice..." });
        } else {
            await ensurePredefinedVoiceCached(voiceName, {
                statusText: `Preparing voice (${voiceName})...`,
            });
        }
        currentVoiceName = voiceName;

        await runGenerationPipeline(voiceName, chunks, framesAfterEos);
    } catch (err) {
        console.error("Generation error:", err);
        postMessage({ type: "error", error: err.toString() });
    } finally {
        if (isGenerating) {
            postMessage({ type: "stream_ended" });
            postMessage({ type: "status", status: "Finished", state: "idle" });
        }
        isGenerating = false;
    }
}

async function runGenerationPipeline(voiceName, chunks, framesAfterEos) {
    const baseFlowState = voiceConditioningCache.get(voiceName);
    if (!baseFlowState) {
        throw new Error(`Voice conditioning cache missing for '${voiceName}'.`);
    }
    const baseFlowTensors = new Set(Object.values(baseFlowState));
    const flowOutputNames = manifestOutputNames(bundleMetadata.flow_lm_state_manifest);
    const mimiOutputNames = manifestOutputNames(bundleMetadata.mimi_state_manifest);
    const firstChunkFrames = 3;
    const normalChunkFrames = 12;
    let totalGeneratedFrames = 0;
    let isFirstAudioChunk = true;
    let totalFlowLmTime = 0;
    let totalDecodeTime = 0;
    const generationStart = performance.now();

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        if (!isGenerating) break;

        let mimiState = initStateFromManifest(bundleMetadata.mimi_state_manifest);
        let flowLmState = cloneState(baseFlowState);
        let ownsFlowLmState = false;
        const emptySeq = createTensor("float32", new Float32Array(0), [1, 0, currentLatentDim]);
        const emptyTextEmb = createTensor("float32", new Float32Array(0), [1, 0, currentConditioningDim]);
        let textInput = null;
        let textEmb = null;
        let currentLatent = null;

        try {
            const chunkText = chunks[chunkIdx];
            let isFirstAudioChunkOfTextChunk = true;
            const tokenIds = tokenizerProcessor.encodeIds(chunkText);
            if (!tokenIds.length) throw new Error(`Pocket TTS tokenized an internal utterance to zero IDs (index ${chunkIdx}).`);
            textInput = createTensor(
                "int64",
                BigInt64Array.from(tokenIds.map((token) => BigInt(token))),
                [1, tokenIds.length]
            );

            const textResult = await runSession(textConditionerSession, { token_ids: textInput });
            textEmb = textResult[textConditionerSession.outputNames[0]];
            releaseTensor(textInput);
            textInput = null;
            if (textEmb.dims.length === 2) {
                const originalTextEmb = textEmb;
                textEmb = createTensor("float32", new Float32Array(originalTextEmb.data), [1, originalTextEmb.dims[0], originalTextEmb.dims[1]]);
                releaseTensor(originalTextEmb);
            }
            releaseResultExcept(textResult, new Set([textConditionerSession.outputNames[0]]), new Set([textEmb]));

            const condResult = await runSession(flowLmMainSession, {
                sequence: emptySeq,
                text_embeddings: textEmb,
                ...flowLmState,
            });
            const conditionedState = cloneState(flowLmState);
            updateStateFromManifestOutputs(conditionedState, condResult, bundleMetadata.flow_lm_state_manifest);
            const conditionedTensors = new Set(Object.values(conditionedState));
            releaseResultExcept(condResult, flowOutputNames, conditionedTensors);
            releaseState(flowLmState, new Set([...baseFlowTensors, ...conditionedTensors]));
            flowLmState = conditionedState;
            ownsFlowLmState = true;
            releaseTensor(textEmb);
            textEmb = null;
            releaseTensor(emptySeq);

            const chunkLatents = [];
            let chunkDecodedFrames = 0;
            currentLatent = createTensor("float32", new Float32Array(currentLatentDim).fill(NaN), [1, 1, currentLatentDim]);
            let eosStep = null;
            let chunkEnded = false;
            let chunkGenTimeMs = 0;

            for (let step = 0; step < MAX_FRAMES; step++) {
                if (!isGenerating) break;
                if (step > 0 && step % 4 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }

                const stepStart = performance.now();
                const arResult = await runSession(flowLmMainSession, {
                    sequence: currentLatent,
                    text_embeddings: emptyTextEmb,
                    ...flowLmState,
                });
                const stepElapsed = performance.now() - stepStart;
                chunkGenTimeMs += stepElapsed;
                totalFlowLmTime += stepElapsed;
                releaseTensor(currentLatent);
                currentLatent = null;

                const conditioning = arResult.conditioning;
                const eosLogit = arResult.eos_logit.data[0];
                const isEos = eosLogit > -4.0;
                if (isEos && eosStep == null) {
                    eosStep = step;
                }
                const shouldStop = eosStep != null && step >= eosStep + framesAfterEos;

                const temperature = 0.7;
                const std = Math.sqrt(temperature);
                const latentData = new Float32Array(currentLatentDim);
                for (let i = 0; i < currentLatentDim; i++) {
                    let u = 0;
                    let v = 0;
                    while (u === 0) u = Math.random();
                    while (v === 0) v = Math.random();
                    latentData[i] = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * std;
                }

                const dt = 1.0 / LSD_STEPS;
                for (let lsdIndex = 0; lsdIndex < LSD_STEPS; lsdIndex++) {
                    const flowInput = createTensor("float32", latentData, [1, currentLatentDim]);
                    let flowResult = null;
                    try {
                        flowResult = await runSession(flowLmFlowSession, {
                            c: conditioning,
                            s: stTensors[lsdIndex].s,
                            t: stTensors[lsdIndex].t,
                            x: flowInput,
                        });
                    } finally {
                        releaseTensor(flowInput);
                    }
                    const flowDir = flowResult.flow_dir.data;
                    for (let i = 0; i < currentLatentDim; i++) {
                        latentData[i] += flowDir[i] * dt;
                    }
                    releaseResultExcept(flowResult);
                }

                chunkLatents.push(new Float32Array(latentData));
                totalGeneratedFrames++;
                const pending = chunkLatents.length - chunkDecodedFrames;
                let decodeSize = 0;
                if (shouldStop) {
                    decodeSize = pending;
                } else if (isFirstAudioChunk && pending >= firstChunkFrames) {
                    decodeSize = firstChunkFrames;
                } else if (pending >= normalChunkFrames) {
                    decodeSize = normalChunkFrames;
                }

                const nextFlowState = cloneState(flowLmState);
                updateStateFromManifestOutputs(nextFlowState, arResult, bundleMetadata.flow_lm_state_manifest);
                const nextFlowTensors = new Set(Object.values(nextFlowState));
                releaseResultExcept(arResult, flowOutputNames, nextFlowTensors);
                if (ownsFlowLmState) {
                    releaseState(flowLmState, new Set([...baseFlowTensors, ...nextFlowTensors]));
                }
                flowLmState = nextFlowState;
                ownsFlowLmState = true;
                currentLatent = createTensor("float32", latentData, [1, 1, currentLatentDim]);

                if (decodeSize > 0) {
                    const decodeLatents = new Float32Array(decodeSize * currentLatentDim);
                    for (let frame = 0; frame < decodeSize; frame++) {
                        decodeLatents.set(chunkLatents[chunkDecodedFrames + frame], frame * currentLatentDim);
                    }

                    const decoderStart = performance.now();
                    const decoderInput = createTensor("float32", decodeLatents, [1, decodeSize, currentLatentDim]);
                    let decodeResult = null;
                    try {
                        decodeResult = await runSession(mimiDecoderSession, {
                            latent: decoderInput,
                            ...mimiState,
                        });
                    } finally {
                        releaseTensor(decoderInput);
                    }
                    const decoderElapsed = performance.now() - decoderStart;
                    chunkGenTimeMs += decoderElapsed;
                    totalDecodeTime += decoderElapsed;

                    const nextMimiState = cloneState(mimiState);
                    updateStateFromManifestOutputs(nextMimiState, decodeResult, bundleMetadata.mimi_state_manifest);
                    const nextMimiTensors = new Set(Object.values(nextMimiState));
                    const audioTensor = decodeResult[mimiDecoderSession.outputNames[0]];
                    const audioFloat32 = new Float32Array(audioTensor.data);
                    releaseResultExcept(decodeResult, mimiOutputNames, nextMimiTensors);
                    releaseState(mimiState, nextMimiTensors);
                    if (!nextMimiTensors.has(audioTensor)) releaseTensor(audioTensor);
                    mimiState = nextMimiState;

                    chunkDecodedFrames += decodeSize;
                    const isLastChunk = shouldStop && chunkIdx === chunks.length - 1;
                    postMessage({
                        type: "audio_chunk",
                        data: audioFloat32,
                        metrics: {
                            bbTime: 0,
                            decTime: 0,
                            chunkDuration: audioFloat32.length / currentSampleRate,
                            genTimeSec: chunkGenTimeMs / 1000,
                            isFirst: isFirstAudioChunk,
                            isLast: isLastChunk,
                            chunkStart: isFirstAudioChunkOfTextChunk,
                        },
                    }, [audioFloat32.buffer]);

                    isFirstAudioChunk = false;
                    isFirstAudioChunkOfTextChunk = false;
                    chunkGenTimeMs = 0;
                }

                if (shouldStop) {
                    chunkEnded = true;
                    break;
                }
            }

            assertPocketUtteranceEnded({
                chunkEnded,
                stillGenerating: isGenerating,
                frameLimit: MAX_FRAMES,
            });

            if (chunkEnded && isGenerating && chunkIdx < chunks.length - 1) {
                const gapSamples = Math.max(1, Math.floor(CHUNK_GAP_SEC * currentSampleRate));
                const silence = new Float32Array(gapSamples);
                postMessage({
                    type: "audio_chunk",
                    data: silence,
                    metrics: {
                        bbTime: 0,
                        decTime: 0,
                        chunkDuration: gapSamples / currentSampleRate,
                        isFirst: false,
                        isLast: false,
                        isSilence: true,
                    },
                }, [silence.buffer]);
            }
        } finally {
            releaseTensor(textInput);
            releaseTensor(textEmb);
            releaseTensor(currentLatent);
            releaseTensor(emptySeq);
            releaseTensor(emptyTextEmb);
            releaseState(mimiState);
            if (ownsFlowLmState) releaseState(flowLmState, baseFlowTensors);
        }
    }

    const totalTime = (performance.now() - generationStart) / 1000;
    const audioSeconds = totalGeneratedFrames * currentSamplesPerFrame / currentSampleRate;
    const genTime = (totalFlowLmTime + totalDecodeTime) / 1000;
    const rtfx = genTime > 0 ? audioSeconds / genTime : 0;

    debugLog(`Generation complete for ${voiceName} in ${totalTime.toFixed(2)}s (RTFx ${rtfx.toFixed(2)}x)`);
    postMessage({
        type: "status",
        status: `Finished (RTFx: ${rtfx.toFixed(2)}x)`,
        state: "idle",
        metrics: { rtfx, genTime, totalTime, audioDuration: audioSeconds },
    });
}

export function clearPocketWorkerState() {
    ort = null;
    executionProviders = ['wasm'];
    currentLanguage = DEFAULT_LANGUAGE;
    bundleMetadata = null;
    tokenizerProcessor = null;
    tokenizerData = null;
    bosBeforeVoice = null;
    mimiEncoderSession = null;
    textConditionerSession = null;
    flowLmMainSession = null;
    flowLmFlowSession = null;
    mimiDecoderSession = null;
    currentSampleRate = 24000;
    currentSamplesPerFrame = 1920;
    currentLatentDim = 32;
    currentConditioningDim = 1024;
    currentMaxTokenPerChunk = 50;
    predefinedVoiceRecords = {};
    customVoiceEmbedding = null;
    currentVoiceName = null;
    voiceConditioningCache.clear();
    stTensors = [];
    isGenerating = false;
    isReady = false;
}
