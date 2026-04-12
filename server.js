const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const ADMIN_PASSWORD = 'barbara13320';
const CONTENT_FILE = path.join(__dirname, 'content.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === ADMIN_PASSWORD;
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  // CORS headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── API ROUTES ──

  // Login
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    if (body.password === ADMIN_PASSWORD) {
      jsonResponse(res, 200, { success: true, token: ADMIN_PASSWORD });
    } else {
      jsonResponse(res, 401, { success: false, message: 'Mot de passe incorrect' });
    }
    return;
  }

  // Get content
  if (url.pathname === '/api/content' && req.method === 'GET') {
    const content = fs.readFileSync(CONTENT_FILE, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(content);
    return;
  }

  // Update content (protected)
  if (url.pathname === '/api/content' && req.method === 'PUT') {
    if (!checkAuth(req)) { jsonResponse(res, 401, { message: 'Non autorisé' }); return; }
    const body = await readBody(req);
    fs.writeFileSync(CONTENT_FILE, body.toString('utf8'));
    jsonResponse(res, 200, { success: true });
    return;
  }

  // Upload image (protected)
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    if (!checkAuth(req)) { jsonResponse(res, 401, { message: 'Non autorisé' }); return; }
    const body = await readBody(req);
    const boundary = req.headers['content-type'].split('boundary=')[1];

    // Simple multipart parser
    const bodyStr = body.toString('latin1');
    const parts = bodyStr.split('--' + boundary).filter(p => p.includes('filename='));

    if (parts.length === 0) { jsonResponse(res, 400, { message: 'Aucun fichier' }); return; }

    const part = parts[0];
    const filenameMatch = part.match(/filename="([^"]+)"/);
    if (!filenameMatch) { jsonResponse(res, 400, { message: 'Nom de fichier manquant' }); return; }

    const originalName = filenameMatch[1];
    const ext = path.extname(originalName);
    const safeName = Date.now() + '-' + originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Extract file content
    const headerEnd = part.indexOf('\r\n\r\n') + 4;
    const fileEnd = part.lastIndexOf('\r\n');
    const fileContent = body.slice(
      body.indexOf(Buffer.from(part.substring(headerEnd, headerEnd + 20), 'latin1')),
      body.indexOf(Buffer.from(part.substring(fileEnd), 'latin1'), body.indexOf(Buffer.from(part.substring(headerEnd, headerEnd + 20), 'latin1')))
    );

    // Better binary extraction
    const fullBoundary = '--' + boundary;
    const parts2 = [];
    let pos = 0;
    while (true) {
      const start = body.indexOf(fullBoundary, pos);
      if (start === -1) break;
      const end = body.indexOf(fullBoundary, start + fullBoundary.length);
      if (end === -1) break;
      parts2.push(body.slice(start + fullBoundary.length, end));
      pos = end;
    }

    for (const p of parts2) {
      const headerEndIdx = p.indexOf('\r\n\r\n');
      if (headerEndIdx === -1) continue;
      const headers = p.slice(0, headerEndIdx).toString('utf8');
      if (!headers.includes('filename=')) continue;

      const fileData = p.slice(headerEndIdx + 4, p.length - 2); // -2 for trailing \r\n
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, fileData);

      jsonResponse(res, 200, { success: true, filename: 'uploads/' + safeName });
      return;
    }

    jsonResponse(res, 400, { message: 'Erreur lors du upload' });
    return;
  }

  // Delete image (protected)
  if (url.pathname.startsWith('/api/delete-image') && req.method === 'POST') {
    if (!checkAuth(req)) { jsonResponse(res, 401, { message: 'Non autorisé' }); return; }
    const body = JSON.parse(await readBody(req));
    const filePath = path.join(__dirname, body.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    jsonResponse(res, 200, { success: true });
    return;
  }

  // ── STATIC FILES ──
  let filePath = path.join(__dirname, url.pathname === '/' ? 'serenique-lash.html' : decodeURIComponent(url.pathname));
  const ext = path.extname(filePath);
  const type = mime[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });

}).listen(port, () => console.log(`✦ Barbara Beauty server on http://localhost:${port}`));
