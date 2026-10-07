import http from 'node:http';
import path from 'node:path';
import { readFile,stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const prefix='/games/screw-harbor/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain; charset=utf-8'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(302,{Location:prefix});return res.end();}if(url.pathname==='/games/screw-harbor'){res.writeHead(308,{Location:prefix});return res.end();}if(!url.pathname.startsWith(prefix)){res.writeHead(404);return res.end('Not found');}const rel=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile())throw Error('missing');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(4190,'127.0.0.1',()=>console.log('Pulse path + CSP preview: http://127.0.0.1:4190'+prefix));
