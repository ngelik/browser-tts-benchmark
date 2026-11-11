"""Rebuild the reviewed single-thread Mach Boom WASM side module.

Requires Emscripten 4.0.9. Example:
  python3 tools/build-mach-boom.py --emcc /path/to/emsdk/upstream/emscripten/emcc
Upstream sources must first be staged with the normal asset fetch command.
No native or host-side speech synthesis is performed.
"""
import argparse, hashlib, json, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--emcc', required=True)
args=parser.parse_args()
version=subprocess.check_output([args.emcc,'--version'],text=True)
if '4.0.9' not in version.splitlines()[0]:raise SystemExit('Use pinned Emscripten 4.0.9')
manifest=json.loads((ROOT/'assets.lock.json').read_text())['models']['mach-boom']
assets={a['id']:a for a in manifest['assets']}
def verified(name):
 a=assets['mach-boom-'+name.replace('.','-')];p=ROOT/'.cache/public'/a['target'];raw=p.read_bytes()
 if len(raw)!=a['bytes'] or hashlib.sha256(raw).hexdigest()!=a['sha256']:raise SystemExit('Source hash mismatch: '+name)
 return p
build=ROOT/'.cache/mach-boom-build';build.mkdir(parents=True,exist_ok=True)
source=verified('tmk.c').read_text();start=source.index('#define MAXT 16');end=source.index('void tmk_qdense',start)
source=source[:start]+'''// Browser port: fixed single-thread path; no pthread workers.
int tmk_threads(int n) { return n == 1 ? 1 : -1; }
void tmk_qgemv(const uint8_t* codes, int step, int m, int n, const float* tlut, const float* x, float* z) {
    tmk_qgemv_rows(codes, step, n, tlut, x, z, 0, m / 16);
}

'''+source[end:]
(build/'tmk_wasm.c').write_text(source)
output=build/'tmk-wasm-v1.so'
subprocess.run([args.emcc,'-O3','-msimd128','-DTMK_NO_AMX','-sSIDE_MODULE=1',str(build/'tmk_wasm.c'),*[str(verified(n)) for n in ['tmk_act.c','tmk_model.c','tmk_amx.c']],str(ROOT/'web/mach-boom/matmul.c'),'-o',str(output)],check=True)
a=assets['mach-boom-wasm-kernels'];raw=output.read_bytes();digest=hashlib.sha256(raw).hexdigest()
if len(raw)!=a['bytes'] or digest!=a['sha256']:raise SystemExit('Build differs from pinned release artifact: '+digest)
print('Reproduced WASM SHA-256:',digest)
