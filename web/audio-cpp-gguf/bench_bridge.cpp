// Minimal C ABI bridge for the pinned audio.cpp GGUF browser build.
// Copyright (c) 2026 ShugoAI LLC. Licensed under Apache-2.0.
#include "audiocpp.h"
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <string>
#include <emscripten/emscripten.h>

namespace {
audiocpp_registry *registry = nullptr;
audiocpp_model *model = nullptr;
audiocpp_session *session = nullptr;
audiocpp_result *result = nullptr;
const float *pcm = nullptr;
size_t frames = 0;
int rate = 0;
int channels = 0;
char bridge_error[2048] = {};

int fail(audiocpp_status status) {
    const char *message = audiocpp_last_error();
    if (message != nullptr && message[0] != '\0') {
        std::snprintf(bridge_error, sizeof(bridge_error), "%s", message);
    } else {
        const std::string fallback = "audio.cpp returned status " + std::to_string(static_cast<int>(status));
        std::snprintf(bridge_error, sizeof(bridge_error), "%s", fallback.c_str());
    }
    return static_cast<int>(status == AUDIOCPP_OK ? AUDIOCPP_ERR_RUNTIME : status);
}

void clear_result() {
    if (result != nullptr) audiocpp_result_free(result);
    result = nullptr;
    pcm = nullptr;
    frames = 0;
    rate = 0;
    channels = 0;
}

void close_all() {
    clear_result();
    if (session != nullptr) audiocpp_session_free(session);
    session = nullptr;
    if (model != nullptr) audiocpp_model_free(model);
    model = nullptr;
    if (registry != nullptr) audiocpp_registry_free(registry);
    registry = nullptr;
}
} // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int bench_open(const char *family, const char *backend, int threads) {
    close_all();
    bridge_error[0] = '\0';
    if (family == nullptr || backend == nullptr || threads < 1 || threads > 16) {
        std::snprintf(bridge_error, sizeof(bridge_error), "Invalid family, backend or thread count.");
        return static_cast<int>(AUDIOCPP_ERR_INVALID_ARGUMENT);
    }
    if (std::strcmp(family, "ming3_tts") != 0 && std::strcmp(family, "audio8_tts") != 0) {
        std::snprintf(bridge_error, sizeof(bridge_error), "Unsupported GGUF family.");
        return static_cast<int>(AUDIOCPP_ERR_NOT_AVAILABLE);
    }
    if (std::strcmp(backend, "cpu") != 0 && std::strcmp(backend, "webgpu") != 0) {
        std::snprintf(bridge_error, sizeof(bridge_error), "Backend must be explicitly cpu or webgpu.");
        return static_cast<int>(AUDIOCPP_ERR_INVALID_ARGUMENT);
    }

    audiocpp_model_config config{};
    config.family_hint = family;
    auto status = audiocpp_registry_create(nullptr, &registry);
    if (status != AUDIOCPP_OK) return fail(status);
    status = audiocpp_model_load(registry, "/inputs/model.gguf", &config, nullptr, &model);
    if (status != AUDIOCPP_OK) {
        const int code = fail(status);
        close_all();
        return code;
    }

    audiocpp_options *session_options = audiocpp_options_create();
    if (session_options == nullptr) {
        std::snprintf(bridge_error, sizeof(bridge_error), "Could not allocate audio.cpp session options.");
        close_all();
        return static_cast<int>(AUDIOCPP_ERR_RUNTIME);
    }
    if (std::strcmp(family, "audio8_tts") == 0) {
        // Reduce metadata/graph arenas only; model weights and inference math are unchanged.
        status = audiocpp_options_set(session_options, "audio8_tts.ar_weight_context_mb", "16");
        if (status == AUDIOCPP_OK) status = audiocpp_options_set(session_options, "audio8_tts.codec_weight_context_mb", "16");
        if (status == AUDIOCPP_OK) status = audiocpp_options_set(session_options, "audio8_tts.ar_graph_arena_mb", "64");
        if (status == AUDIOCPP_OK) status = audiocpp_options_set(session_options, "audio8_tts.codec_graph_arena_mb", "64");
    }
    if (status == AUDIOCPP_OK) {
        audiocpp_backend_config provider{backend, 0, threads};
        status = audiocpp_session_create(model, "tts", "offline", &provider, session_options, &session);
    }
    audiocpp_options_free(session_options);
    if (status != AUDIOCPP_OK) {
        const int code = fail(status);
        close_all();
        return code;
    }
    return static_cast<int>(AUDIOCPP_OK);
}

EMSCRIPTEN_KEEPALIVE int bench_generate(const char *text, const char *language, uint32_t seed) {
    clear_result();
    bridge_error[0] = '\0';
    if (session == nullptr || text == nullptr || language == nullptr || text[0] == '\0' || language[0] == '\0') {
        std::snprintf(bridge_error, sizeof(bridge_error), "Synthesis requires an open session and nonempty text/language.");
        return static_cast<int>(AUDIOCPP_ERR_INVALID_ARGUMENT);
    }
    audiocpp_request *request = audiocpp_request_create();
    if (request == nullptr) {
        std::snprintf(bridge_error, sizeof(bridge_error), "Could not allocate audio.cpp request.");
        return static_cast<int>(AUDIOCPP_ERR_RUNTIME);
    }
    auto status = audiocpp_request_set_text(request, text, language);
    const std::string seed_text = std::to_string(seed);
    if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(request, "seed", seed_text.c_str());
    if (status == AUDIOCPP_OK && std::strcmp(audiocpp_model_family(model), "ming3_tts") == 0) {
        status = audiocpp_request_set_option(request, "template_name", "ip");
        if (status == AUDIOCPP_OK) status = audiocpp_request_set_option(request, "voice_id", "US_James");
    }
    if (status == AUDIOCPP_OK) status = audiocpp_session_run(session, request, &result);
    if (status == AUDIOCPP_OK) status = audiocpp_result_audio(result, &pcm, &frames, &rate, &channels);
    audiocpp_request_free(request);
    if (status != AUDIOCPP_OK) {
        const int code = fail(status);
        clear_result();
        return code;
    }
    if (pcm == nullptr || frames == 0 || rate <= 0 || channels != 1 ||
        frames > static_cast<size_t>(std::numeric_limits<int>::max())) {
        std::snprintf(bridge_error, sizeof(bridge_error), "audio.cpp returned invalid mono PCM metadata.");
        clear_result();
        return static_cast<int>(AUDIOCPP_ERR_INVALID_ARGUMENT);
    }
    return static_cast<int>(AUDIOCPP_OK);
}

EMSCRIPTEN_KEEPALIVE const char *bench_error() {
    if (bridge_error[0] != '\0') return bridge_error;
    return audiocpp_last_error();
}
EMSCRIPTEN_KEEPALIVE const float *bench_pcm() { return pcm; }
EMSCRIPTEN_KEEPALIVE int bench_frames() { return static_cast<int>(frames); }
EMSCRIPTEN_KEEPALIVE int bench_rate() { return rate; }
EMSCRIPTEN_KEEPALIVE int bench_channels() { return channels; }
EMSCRIPTEN_KEEPALIVE void bench_clear_result() { clear_result(); }
EMSCRIPTEN_KEEPALIVE void bench_shutdown() { close_all(); }
}
