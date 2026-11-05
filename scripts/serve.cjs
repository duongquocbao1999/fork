#!/usr/bin/env node
// Zero-dependency dev server: `npm start`, then open http://127.0.0.1:5173
// Serves the site and runs every Netlify function in netlify/functions by its `config.path`, the way
// Netlify routes them. With no env set, /api/* answers "not configured" and the page runs its demo.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// [{ match(pathname) -> bool, handler }]
const routes = [];
const fnDir = path.join(root, 'netlify', 'functions');
const loading = Promise.all(fs.readdirSync(fnDir).filter(f => /\.m?js$/.test(f)).map(async f => {
  try {
    const m = await import(path.join(fnDir, f));
    const paths = [].concat((m.config && m.config.path) || []);
    for (const p of paths) {
      const match = p.endsWith('*') ? u => u.startsWith(p.slice(0, -1)) : u => u === p;
      routes.push({ match, handler: m.default, name: f });
    }
  } catch (e) { console.error(`could not load ${f}:`, e.message); }
}));

http.createServer(async (req, res) => {
  await loading;
  const url = decodeURIComponent(req.url.split('?')[0]);
  // netlify.toml's redirect: /r/<code> → /?ref=<code>
  const r302 = url.match(/^\/r\/([^/]+)\/?$/);
  if (r302) { res.writeHead(302, { location: `/?ref=${encodeURIComponent(r302[1])}` }); return res.end(); }
  const route = routes.find(r => r.match(url));
  if (route) {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const r = await route.handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ip: req.socket.remoteAddress });
      const out = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
      const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(r.status, out); return res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error(route.name, e); res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"server"}');
    }
  }
  // netlify.toml's rewrite (/coin/<mint> → coin.html) and Netlify's pretty URLs (/market → market.html)
  let rel = url === '/' ? 'index.html' : /^\/coin\/[^/]+\/?$/.test(url) ? 'coin.html' : url;
  if (/^\/[a-z]+\/?$/.test(rel) && fs.existsSync(path.join(root, rel.replace(/\/$/, '') + '.html'))) rel = rel.replace(/\/$/, '') + '.html';
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) || /(^|[\\/])\.|node_modules/.test(path.relative(root, file))) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, () => loading.then(() => console.log(`forks running at http://127.0.0.1:${port} · functions: ${[...new Set(routes.map(r => r.name))].join(', ') || 'none'}`)));
