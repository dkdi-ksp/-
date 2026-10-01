/* 零依赖本地静态服务器。
   Service Worker 和通知权限都要求「安全上下文」，file:// 和局域网 IP 都不满足，
   只有 localhost 可以，所以本地预览必须走 HTTP。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const abs = path.resolve(ROOT, rel);

  // 路径穿越防护：解析后的绝对路径必须落在根目录内
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 禁止访问');
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 找不到 ' + rel);
    }
    const headers = {
      'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    };
    if (path.basename(abs) === 'sw.js') {
      headers['Cache-Control'] = 'no-cache';
      headers['Service-Worker-Allowed'] = '/';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('服务已启动：http://localhost:' + PORT);
  console.log('按 Ctrl+C 停止。');
});
