'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'storymap-data.json');
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ books: [], characters: [], relationships: [] }, null, 2));
  console.log(`Created ${DATA_FILE}`);
}

function serveStatic(res, reqPath) {
  const filePath = path.join(PUBLIC_DIR, reqPath === '/' ? 'index.html' : reqPath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(500); return res.end('Server error');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(content);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; // strip query string

  // ── GET /api/data ──
  if (url === '/api/data' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── POST /api/data ──
  if (url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50 MB guard
        req.destroy();
        res.writeHead(413);
        res.end('Payload too large');
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        // Write pretty-printed so the file is human-readable
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }

  // ── Static files ──
  serveStatic(res, url);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  StoryMap is running!`);
  console.log(`  Open → http://localhost:${PORT}`);
  console.log(`  Data → ${DATA_FILE}\n`);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Try: PORT=3001 node server.js\n`);
  } else {
    console.error('Server error:', e);
  }
  process.exit(1);
});
