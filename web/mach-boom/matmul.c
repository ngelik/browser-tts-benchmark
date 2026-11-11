#include <wasm_simd128.h>
// Row-major FP32 GEMM. Each output accumulates k in source order, no fast-math.
void mach_sgemm(const float* a,const float* b,float* c,int m,int n,int k){
 int i=0;
 for(;i+4<=m;i+=4){
  int j=0;
  for(;j+4<=n;j+=4){
   v128_t s0=wasm_f32x4_splat(0.f),s1=s0,s2=s0,s3=s0;
   for(int p=0;p<k;p++){
    v128_t v=wasm_v128_load(b+p*n+j);
    s0=wasm_f32x4_add(s0,wasm_f32x4_mul(wasm_f32x4_splat(a[i*k+p]),v));
    s1=wasm_f32x4_add(s1,wasm_f32x4_mul(wasm_f32x4_splat(a[(i+1)*k+p]),v));
    s2=wasm_f32x4_add(s2,wasm_f32x4_mul(wasm_f32x4_splat(a[(i+2)*k+p]),v));
    s3=wasm_f32x4_add(s3,wasm_f32x4_mul(wasm_f32x4_splat(a[(i+3)*k+p]),v));
   }
   wasm_v128_store(c+i*n+j,s0);wasm_v128_store(c+(i+1)*n+j,s1);
   wasm_v128_store(c+(i+2)*n+j,s2);wasm_v128_store(c+(i+3)*n+j,s3);
  }
  for(int r=i;r<i+4;r++)for(int q=j;q<n;q++){float sum=0.f;for(int p=0;p<k;p++)sum+=a[r*k+p]*b[p*n+q];c[r*n+q]=sum;}
 }
 for(;i<m;i++){
  int j=0;
  for(;j+4<=n;j+=4){
   v128_t sum=wasm_f32x4_splat(0.f);
   for(int p=0;p<k;p++)sum=wasm_f32x4_add(sum,wasm_f32x4_mul(wasm_f32x4_splat(a[i*k+p]),wasm_v128_load(b+p*n+j)));
   wasm_v128_store(c+i*n+j,sum);
  }
  for(;j<n;j++){float sum=0.f;for(int p=0;p<k;p++)sum+=a[i*k+p]*b[p*n+j];c[i*n+j]=sum;}
 }
}
