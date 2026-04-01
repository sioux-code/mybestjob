'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

// Charge .env.local
try {
  fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
    .split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
} catch {}

const handler = require('./api/offres');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const PORT = 3000;

http.createServer(async (req, res) => {
  // API — on ajoute les méthodes Express-like manquantes
  if (req.url.startsWith('/api/offres')) {
    res.setHeader('Content-Type', 'application/json');
    res.status = (code) => { res.statusCode = code; return res; };
    res.json   = (data) => { res.end(JSON.stringify(data)); };
    return handler(req, res);
  }

  // Fichiers statiques
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  // Enlever les query strings
  filePath = filePath.split('?')[0];

  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'text/plain');
    res.writeHead(200);
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`\n  ✓ Serveur local : http://localhost:${PORT}\n`);
});
