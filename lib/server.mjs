import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.wav':'audio/wav','.md':'text/plain; charset=utf-8'};
export async function startServer(root,{mbps=null}={}){
  root=await realpath(root);
  let nextByteAt=0, bytes=0, requests=0;
  const unique=new Map(), ranges=new Map();
  function recordRange(path,start,end){
    const merged=[];
    for(const interval of [...(ranges.get(path)??[]),[start,end]].sort((a,b)=>a[0]-b[0])){
      const last=merged.at(-1);
      if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);
    }
    ranges.set(path,merged);unique.set(path,merged.reduce((sum,[a,b])=>sum+b-a,0));
  }
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('\0')||pathname.includes('\\'))throw new Error('Invalid path');
      const mapped=pathname==='/'?'/web/index.html':pathname;
      const base=mapped.startsWith('/audio/')?resolve(root,'audio'):mapped.startsWith('/web/')?resolve(root,'web'):mapped.startsWith('/fixtures/')?resolve(root,'fixtures'):resolve(root,'.cache/public');
      const relative=mapped.startsWith('/audio/')?mapped.slice(7):mapped.startsWith('/web/')?mapped.slice(5):mapped.startsWith('/fixtures/')?mapped.slice(10):mapped.slice(1);
      const file=resolve(base,relative);
      if(!file.startsWith(base+sep))throw new Error('Invalid path');
      const actual=await realpath(file);if(!actual.startsWith(base+sep))throw new Error('Invalid path');
      const info=await stat(actual);if(!info.isFile())throw new Error('Not a file');
      // GGUF loaders read tensor ranges. Stream those files without retaining a
      // multi-gigabyte Node buffer; all neural execution still happens in Chrome.
      const ranged=extname(actual)==='.gguf';
      let start=0,end=info.size-1,status=200;
      const rangeHeaders=ranged?{'Accept-Ranges':'bytes'}:{};
      if(ranged&&req.method==='GET'&&req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
        if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);}
        else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start<0||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
        status=206;rangeHeaders['Content-Range']=`bytes ${start}-${end}/${info.size}`;
      }
      const body=ranged?null:await readFile(actual),length=ranged?Math.max(0,end-start+1):body.length;
      res.writeHead(status,{...rangeHeaders,'Content-Type':mime[extname(actual)]??'application/octet-stream','Content-Length':length,'Cache-Control':extname(actual)==='.html'?'no-store':'public, max-age=31536000, immutable','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'"});
      if(req.method==='HEAD'){res.end();return;}
      if(length===0){requests++;unique.set(mapped,0);res.end();return;}
      requests++;
      let delivered=0;
      const chunks=ranged?createReadStream(actual,{start,end,highWaterMark:16384}):(function*(){for(let offset=0;offset<body.length;offset+=16384)yield body.subarray(offset,offset+16384);})();
      const cancel=()=>{if(ranged)chunks.destroy();};res.once('close',cancel);
      try{for await(const chunk of chunks){
        if(res.destroyed)break;
        if(mbps){const now=Date.now();nextByteAt=Math.max(now,nextByteAt)+chunk.length/(mbps*125000)*1000;await delay(Math.max(0,nextByteAt-now));}
        if(res.destroyed)break;
        if(!res.write(chunk))await new Promise(ok=>{const done=()=>{res.removeListener('drain',done);res.removeListener('close',done);ok();};res.once('drain',done);res.once('close',done);});
        bytes+=chunk.length;delivered+=chunk.length;
      }}finally{res.removeListener('close',cancel);if(ranged)chunks.destroy();}
      if(delivered===length){if(ranged)recordRange(mapped,start,end+1);else unique.set(mapped,length);}
      res.end();
    }catch{if(!res.headersSent)res.writeHead(404);res.end();}
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  return {url:`http://127.0.0.1:${server.address().port}/`,setMbps(value){if(value!==null&&(!Number.isFinite(value)||value<=0))throw new Error('Invalid bandwidth');mbps=value;nextByteAt=0;},snapshot:()=>({bytes,requests,uniqueBytes:[...unique.values()].reduce((a,b)=>a+b,0)}),async close(){server.closeAllConnections();await new Promise(ok=>server.close(ok));}};
}
