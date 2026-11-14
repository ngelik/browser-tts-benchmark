"""Rebuild the text-only prompt oracle using tokenizers==0.22.2 and the pinned tokenizer."""
import hashlib
import json
from pathlib import Path
from tokenizers import Tokenizer

article = Path('fixtures/en-20000.txt').read_text()
spans = json.loads(Path('fixtures/en-20000.chunks.json').read_text())['chunks']
tokenizer = Tokenizer.from_file('.cache/public/models/audio8-realistic/tokenizer/tokenizer.json')
digests = []
for span in spans:
    raw = article[span['start']:span['end']]
    clean = ' '.join(raw.strip().split())
    parts = ['<|im_start|>system\n', 'convert the provided text to speech', '<|im_end|>\n',
             '<|im_start|>user\n', clean, '<|im_end|>\n', '<|im_start|>assistant\n<|voice|>']
    ids = [token for part in parts for token in tokenizer.encode(part, add_special_tokens=False).ids]
    digests.append(hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest())
output = {'fixtureSha256': hashlib.sha256(article.encode()).hexdigest(), 'promptSha256': digests}
Path('web/audio8/prompt-oracle.json').write_text(json.dumps(output, indent=2) + '\n')
