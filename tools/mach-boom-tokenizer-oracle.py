"""Regenerate/check Mach Boom's full-fixture Rust-tokenizer reference.

Use a local virtual environment with tokenizers==0.22.2. Stage model assets first.
This executes only text normalization/tokenization; never host-side TTS.
"""
import argparse, hashlib, json, pathlib, sys
import tokenizers
ROOT=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--write',action='store_true');args=parser.parse_args()
if tokenizers.__version__!='0.22.2':raise SystemExit('Use tokenizers==0.22.2')
model=json.loads((ROOT/'assets.lock.json').read_text())['models']['mach-boom']
assets={a['id']:a for a in model['assets']}
def source(id):
 a=assets[id];p=ROOT/'.cache/public'/a['target'];b=p.read_bytes()
 if len(b)!=a['bytes'] or hashlib.sha256(b).hexdigest()!=a['sha256']:raise SystemExit('Asset mismatch: '+id)
 return p
frontend=source('mach-boom-frontend_en-py');tokenizer=source('mach-boom-tokenizer-json')
sys.path.insert(0,str(frontend.parent));from frontend_en import normalize
unk=json.loads(tokenizer.read_text())['model']['unk_id'];tok=tokenizers.Tokenizer.from_file(str(tokenizer))
text=(ROOT/'fixtures/en-20000.txt').read_text();chunks=json.loads((ROOT/'fixtures/en-20000.chunks.json').read_text())['chunks'];entries=[]
for chunk in chunks:
 normalized=normalize(text[chunk['start']:chunk['end']]);ids=tok.encode(normalized.strip(),add_special_tokens=False).ids
 if not ids or unk in ids:raise SystemExit('Empty or unknown tokens in '+str(chunk['id']))
 decoded=tok.decode(ids,skip_special_tokens=True)
 entries.append(dict(id=chunk['id'],normalized=normalized,ids=ids,decoded=decoded,numWords=len(decoded.split())))
result=dict(fixtureSha256=hashlib.sha256(text.encode()).hexdigest(),tokenizerSha256=hashlib.sha256(tokenizer.read_bytes()).hexdigest(),frontendSha256=hashlib.sha256(frontend.read_bytes()).hexdigest(),referenceImplementation='Hugging Face Rust tokenizers '+tokenizers.__version__,entries=entries)
output=ROOT/'web/mach-boom/tokenizer-oracle.json';rendered=json.dumps(result,indent=2)+'\n'
if args.write:output.write_text(rendered)
elif output.read_text()!=rendered:raise SystemExit('Tokenizer oracle differs; review before updating')
print('Verified',len(entries),'canonical normalized texts and token sequences')
