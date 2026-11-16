'use strict';

// Shared by the browser suites: serves docs/ the way GitHub Pages does
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DOCS = path.resolve(__dirname, '..', '..', 'docs');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Static server for docs/, so the service worker and the manifest work as they would on GitHub Pages
function serveDocs() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
      const file = path.join(DOCS, name);
      if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { DOCS, serveDocs };
