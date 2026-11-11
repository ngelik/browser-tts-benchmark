import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
const root = await realpath('.cache/listening-site').catch(() => {throw new Error('Build the site first: npm run dashboard:build');});
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.wav':'audio/wav'};
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {res.writeHead(405).end(); return;}
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.includes('\0') || path.includes('\\')) throw new Error('Invalid path');
    const file = await realpath(resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : '')));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Invalid path');
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(0, '127.0.0.1', () => console.log(`Dashboard preview: http://127.0.0.1:${server.address().port}/`));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => {server.closeAllConnections(); server.close();});
