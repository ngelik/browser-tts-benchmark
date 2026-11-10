# Kitten Nano ONNX browser port

Token ordering, spacing, voice style selection, speed prior and tail trimming
follow KittenML/KittenTTS `b9517e3050adced306219f8bea5f117d87ecfaa7`,
`kittenml/kittentts_legacy/onnx_model.py`, Apache-2.0. LICENSE retained.

This is a benchmark browser port, not an official Kitten browser release. It
uses official `clean_text=false` behavior: browser eSpeak reads original text
with punctuation/stress preserved, then official token spacing. Unlike upstream
it rejects unknown phonemes rather than silently skipping them. Bella uses the
0.8 speed prior and text-length style row; the official 5,000-sample tail trim
is retained. CPU and GPU use identical settings and the FP32 ONNX checkpoint.

https://github.com/KittenML/KittenTTS/blob/b9517e3050adced306219f8bea5f117d87ecfaa7/kittenml/kittentts_legacy/onnx_model.py
