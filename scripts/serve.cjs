#!/usr/bin/env node
// Zero-dependency static server: `npm start`, then open http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

let ask = null; // the Netlify function, run locally so `FORKS_LLM_KEY=... npm start` has the model too
import(path.join(root, 'netlify', 'functions', 'ask.mjs')).then(m => { ask = m.default; }).catch(() => {});

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/ask') {
    if (!ask) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await ask(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), { ip: req.socket.remoteAddress });
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(await r.text());
  }
  let file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, () => console.log(`forks running at http://localhost:${port}`));
