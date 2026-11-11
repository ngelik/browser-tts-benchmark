"""Convert the pinned public Pocket SentencePiece model to browser tokenizer JSON.
Text-only conversion; requires sentencepiece==0.2.1 and protobuf==7.36.2.
Default checks the committed artifact; --write explicitly regenerates it.
"""
import argparse, hashlib, json, pathlib
import sentencepiece, google.protobuf
from sentencepiece import sentencepiece_model_pb2 as pb
assert sentencepiece.__version__=='0.2.1' and google.protobuf.__version__=='7.36.2'
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--write',action='store_true');args=parser.parse_args()
lock=json.loads((root/'assets.lock.json').read_text())['models']['pocket-tts-100m-english-int8']
a=next(a for a in lock['assets'] if a['id']=='pocket-tts-tokenizer-model');raw=(root/'.cache/public'/a['target']).read_bytes()
assert len(raw)==a['bytes'] and hashlib.sha256(raw).hexdigest()==a['sha256']
m=pb.ModelProto();m.ParseFromString(raw);t=m.trainer_spec;n=m.normalizer_spec
assert t.model_type==pb.TrainerSpec.UNIGRAM and t.byte_fallback and len(m.pieces)==4000
assert n.name=='identity' and not n.precompiled_charsmap and n.add_dummy_prefix and n.escape_whitespaces and not n.remove_extra_whitespaces
assert [t.unk_id,t.bos_id,t.eos_id,t.pad_id]==[0,1,2,3]
# Both current HF schema and the legacy Transformers.js option express the same
# Metaspace prefix behavior. The fixed-fixture audit compares native SentencePiece.
metaspace={'type':'Metaspace','replacement':'▁','prepend_scheme':'always','split':True,'add_prefix_space':True}
out={'version':'1.0','truncation':None,'padding':None,'added_tokens':[{'id':i,'content':m.pieces[i].piece,'single_word':False,'lstrip':False,'rstrip':False,'normalized':False,'special':True} for i in range(4)],'normalizer':None,'pre_tokenizer':metaspace,'post_processor':None,'decoder':{'type':'Sequence','decoders':[metaspace,{'type':'ByteFallback'},{'type':'Fuse'}]},'model':{'type':'Unigram','unk_id':0,'vocab':[[p.piece,p.score] for p in m.pieces],'byte_fallback':True}}
rendered=json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n';path=root/'web/pocket/tokenizer.json'
if args.write:path.write_text(rendered)
else:assert path.read_text()==rendered,'Derived tokenizer differs; review before regenerating'
print('Tokenizer JSON:',len(rendered.encode()),'bytes; SHA-256',hashlib.sha256(rendered.encode()).hexdigest())
