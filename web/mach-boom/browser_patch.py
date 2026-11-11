import ast, types, ctypes, numpy as np
from pathlib import Path
# Browser integration for the Apache-2.0 Mach Boom runtime; see NOTICE.md.
class MatmulPort(ast.NodeTransformer):
 def visit_BinOp(self,node):
  self.generic_visit(node)
  if isinstance(node.op,ast.MatMult):return ast.copy_location(ast.Call(ast.Name('browser_matmul',ast.Load()),[node.left,node.right],[]),node)
  return node
source=Path('/mach/mach.py').read_text()
limit = 'if f == max_frames - 1:\n                break'
if source.count(limit) != 1:
 raise RuntimeError('Pinned Mach Boom frame-limit contract changed')
source = source.replace(limit, 'if f == max_frames - 1:\n                raise RuntimeError("Mach Boom reached max_frames before normal EOS")')
module=types.ModuleType('mach_browser');module.__file__='/mach/mach.py'
exec(compile(ast.fix_missing_locations(MatmulPort().visit(ast.parse(source))),'/mach/mach.py','exec'),module.__dict__)
lib=ctypes.CDLL('/mach/tmk_wasm.so');lib.mach_sgemm.argtypes=[ctypes.c_void_p]*3+[ctypes.c_int]*3

def browser_matmul(a,b):
 if a.ndim!=2 or b.ndim!=2 or a.dtype!=np.float32 or b.dtype!=np.float32:return np.matmul(a,b)
 if a.shape[1]!=b.shape[0]:raise ValueError('matmul dimension mismatch')
 a=np.ascontiguousarray(a);b=np.ascontiguousarray(b);c=np.empty((a.shape[0],b.shape[1]),np.float32)
 lib.mach_sgemm(a.ctypes.data,b.ctypes.data,c.ctypes.data,a.shape[0],b.shape[1],a.shape[1])
 return c
module.browser_matmul=browser_matmul
MachBoom=module.MachBoom

def verify_matmul():
 rng=np.random.default_rng(42)
 for m,n,k in [(3,5,7),(17,13,9),(16,32,64),(1,1,1),(5,9,128)]:
  a=rng.standard_normal((m,k)).astype(np.float32);b=rng.standard_normal((n,k)).astype(np.float32).T
  np.testing.assert_allclose(browser_matmul(a,b),a@b,rtol=1e-5,atol=1e-5)
 return True
