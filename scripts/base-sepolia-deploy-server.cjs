#!/usr/bin/env node
// Local-only server for the reviewed Base Sepolia deployment page.
// It never receives a private key or signs a transaction.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.AICHAIN_DEPLOY_UI_PORT || 8765);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

http.createServer((request, response) => {
  const requestPath = decodeURIComponent(request.url.split('?')[0]);
  const relativePath = requestPath === '/' ? '/scripts/base-sepolia-deploy.html' : requestPath === '/synthetic-anchor' ? '/scripts/base-sepolia-synthetic-anchor.html' : requestPath === '/closed-cycle' ? '/scripts/base-sepolia-closed-cycle.html' : requestPath;
  const file = path.resolve(root, `.${relativePath}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Base Sepolia deployment UI: http://127.0.0.1:${port}/`);
});
