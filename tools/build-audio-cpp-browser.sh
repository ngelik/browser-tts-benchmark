#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/nov14"
SOURCE="$CACHE/audio-cpp"
BUILD="$CACHE/audio-build"
PINNED_COMMIT="d38518a0d6a7aaab9d3f3dd91e9780c69857b0ac"
UPSTREAM="https://github.com/0xShug0/audio.cpp.git"

if [[ ! -d "$SOURCE/.git" ]]; then
  mkdir -p "$CACHE"
  git clone --no-checkout "$UPSTREAM" "$SOURCE"
fi
if [[ "$(git -C "$SOURCE" rev-parse HEAD)" != "$PINNED_COMMIT" ]]; then
  changed="$(git -C "$SOURCE" diff --name-only)"
  if [[ -n "$changed" && "$changed" != "CMakeLists.txt" ]]; then
    echo "Refusing to switch the audio.cpp checkout with unrelated tracked changes: $changed" >&2
    exit 1
  fi
  if [[ -n "$changed" ]]; then git -C "$SOURCE" restore -- CMakeLists.txt; fi
  git -C "$SOURCE" fetch --depth=1 origin "$PINNED_COMMIT"
  git -C "$SOURCE" checkout --detach "$PINNED_COMMIT"
fi
actual_commit="$(git -C "$SOURCE" rev-parse HEAD)"
if [[ "$actual_commit" != "$PINNED_COMMIT" ]]; then
  echo "audio.cpp source pin mismatch: expected $PINNED_COMMIT, found $actual_commit" >&2
  exit 1
fi

SDK="$CACHE/emsdk"
if [[ ! -f "$SDK/emsdk_env.sh" ]]; then
  echo "Pinned Emscripten SDK is missing at $SDK; install 6.0.13 before building." >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$SDK/emsdk_env.sh"
sdk_version="$(emcc --version | awk 'NR == 1 { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
if [[ "$sdk_version" != "6.0.13" ]]; then
  echo "Emscripten SDK mismatch: expected 6.0.13, found $sdk_version" >&2
  exit 1
fi

python3 - "$SOURCE/CMakeLists.txt" "$ROOT/web/audio-cpp-gguf/bench_browser.cmake" <<'PY'
from pathlib import Path
import re
import sys

cmake = Path(sys.argv[1])
fragment = Path(sys.argv[2]).read_text()
text = cmake.read_text()
start = text.rfind('\nadd_executable(bench_browser bench_bridge.cpp src/capi/audiocpp.cpp)')
if start >= 0:
    text = text[:start].rstrip() + '\n'
marker = '# TTS-BENCH audio.cpp browser bridge'
if marker in text:
    text = text[:text.index(marker)].rstrip() + '\n'
cmake.write_text(text.rstrip() + '\n\n' + fragment)
PY
cp "$ROOT/web/audio-cpp-gguf/bench_bridge.cpp" "$SOURCE/bench_bridge.cpp"

cd "$CACHE"
emcmake cmake -G Ninja -S "$SOURCE" -B "$BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DAUDIOCPP_MODEL_SET=custom \
  -DAUDIOCPP_MODELS=audio8_tts,ming3_tts \
  -DAUDIOCPP_DEPLOYMENT_BUILD=ON \
  -DENGINE_ENABLE_WEBGPU=ON \
  -DGGML_WEBGPU_JSPI=ON \
  -DENGINE_ENABLE_CUDA=OFF \
  -DENGINE_ENABLE_HIP=OFF \
  -DENGINE_ENABLE_VULKAN=OFF \
  -DENGINE_ENABLE_METAL=OFF \
  -DENGINE_ENABLE_OPENMP=OFF \
  -DGGML_OPENMP=OFF \
  -DENGINE_ENABLE_NATIVE_CPU=OFF \
  -DENGINE_ENABLE_LLAMAFILE=OFF \
  -DAUDIOCPP_BUILD_NATIVE_MODEL_MANAGER=OFF \
  -DAUDIOCPP_BUILD_SERVER_FRONTENDS=OFF \
  -DAUDIOCPP_BUILD_C_API=OFF \
  -DENGINE_BUILD_TESTS=OFF \
  '-DCMAKE_CXX_FLAGS=-O3 -fwasm-exceptions -msimd128 -pthread' \
  '-DCMAKE_C_FLAGS=-O3 -msimd128 -pthread' \
  '-DCMAKE_EXE_LINKER_FLAGS=-pthread -sPTHREAD_POOL_SIZE=12 -sPTHREAD_POOL_SIZE_STRICT=2'

cmake --build "$BUILD" --target bench_browser -j 4
echo "Built pinned browser runtime at $BUILD/bin/bench_browser.js and $BUILD/bin/bench_browser.wasm"
python3 - "$ROOT" "$BUILD/bin/bench_browser.js" "$BUILD/bin/bench_browser.wasm" <<'PYSCAN'
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve().as_posix().encode()
for filename in sys.argv[2:]:
    if root in Path(filename).read_bytes():
        raise SystemExit("Generated runtime contains this checkout's absolute path; do not publish it.")
PYSCAN
