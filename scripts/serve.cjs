const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
http
  .createServer((req, res) => {
    let filename;
    try {
      filename = path.resolve(
        root,
        '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (filename === root || req.url.split('?')[0].endsWith('/'))
      filename = path.join(filename, 'index.html');
    fs.readFile(filename, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(Number(process.env.PORT) || 8765, '127.0.0.1', () =>
    console.log('Road Cost: http://127.0.0.1:' + (process.env.PORT || 8765))
  );
