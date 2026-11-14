# TTS-BENCH audio.cpp browser bridge; source code is tracked in this repository.
add_executable(bench_browser bench_bridge.cpp src/capi/audiocpp.cpp)
target_include_directories(bench_browser PRIVATE include)
target_link_libraries(bench_browser PRIVATE engine_runtime ggml)
target_link_options(bench_browser PRIVATE
  "-sASSERTIONS=1" "--no-entry"
  "-sMODULARIZE=1" "-sEXPORT_NAME=createTTS" "-sENVIRONMENT=web,worker"
  "-sINVOKE_RUN=0" "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=268435456"
  "-sMAXIMUM_MEMORY=4294967296" "-sSTACK_SIZE=8388608"
  "-sPTHREAD_POOL_SIZE=12" "-sPTHREAD_POOL_SIZE_STRICT=2"
  "-sFORCE_FILESYSTEM=1" "-sEXPORTED_RUNTIME_METHODS=ccall,FS,HEAPF32"
  "-sJSPI_EXPORTS=bench_open,bench_generate,bench_shutdown")
