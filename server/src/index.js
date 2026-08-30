#!/usr/bin/env node
/* =========================================================================
   index.js — the server
   One process: it serves the application's files and answers its API, so
   there is nothing to run alongside it and no proxy to configure. Node's own
   http module and its own SQLite driver, and no dependencies whatsoever —
   nothing to install, nothing to keep patched.

   node server/src/index.js            serves on 3000
   PORT=8080 node server/src/index.js  serves on 8080
   Originate Command · OM SRS 001
   ========================================================================= */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./db');
const auth = require('./auth');
const { routes, HttpError } = require('./api');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.OC_DB || path.join(ROOT, 'server', 'data', 'originate.db');

const database = db.open(DB_FILE);

/* ---- static files -------------------------------------------------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

function staticPath(pathname) {
  /* resolve inside the project directory and refuse anything that escapes it,
     so a crafted path cannot read files outside the app */
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const target = path.resolve(ROOT, '.' + (clean === '/' ? '/index.html' : clean));
  if (!target.startsWith(ROOT)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, 'index.html');
  }
  return target;
}

/* ---- live updates --------------------------------------------------------
   Server sent events: one long lived response per open screen. When anything
   changes, every screen is told to re-read, which is what makes one person's
   change appear on another person's board without a refresh. */
const listeners = new Set();

function broadcast(reason) {
  const message = 'data: ' + JSON.stringify({ reason, at: new Date().toISOString() }) + '\n\n';
  listeners.forEach((res) => { try { res.write(message); } catch (e) { listeners.delete(res); } });
}

/* ---- request handling ---------------------------------------------------- */
function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) { reject(new HttpError(413, 'That is too large.')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new HttpError(400, 'Malformed JSON.')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/* match "PATCH /api/todos/:id" against "PATCH /api/todos/t-7" */
function matchRoute(method, pathname) {
  const key = method + ' ' + pathname;
  if (routes[key]) return { handler: routes[key], params: {} };
  const parts = pathname.split('/');
  for (const pattern of Object.keys(routes)) {
    const [pMethod, pPath] = pattern.split(' ');
    if (pMethod !== method) continue;
    const pParts = pPath.split('/');
    if (pParts.length !== parts.length) continue;
    const params = {};
    const ok = pParts.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      return seg === parts[i];
    });
    if (ok) return { handler: routes[pattern], params };
  }
  return null;
}

const PUBLIC = ['POST /api/session'];

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/api/')) {
    const file = staticPath(pathname);
    if (!file) { res.writeHead(403); res.end('Forbidden'); return; }
    return serveFile(res, file);
  }

  const cookies = parseCookies(req.headers.cookie);
  const user = auth.currentUser(database, cookies);

  /* the live channel holds the response open until the screen goes away */
  if (pathname === '/api/events') {
    if (!user) { send(res, 401, { error: 'Sign in first.' }); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'
    });
    res.write('retry: 3000\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }

  const route = matchRoute(req.method, pathname);
  if (!route) { send(res, 404, { error: 'No such endpoint.' }); return; }

  const key = req.method + ' ' + pathname;
  if (!user && PUBLIC.indexOf(key) === -1) {
    send(res, 401, { error: 'Sign in first.' });
    return;
  }

  try {
    const body = ['POST', 'PATCH', 'PUT'].indexOf(req.method) > -1 ? await readBody(req) : {};
    const result = route.handler(database, user, body, route.params);

    if (key === 'POST /api/session') {
      const maxAge = Math.round((new Date(result.expires_at) - Date.now()) / 1000);
      res.setHeader('Set-Cookie',
        'oc_session=' + result.session + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge);
      delete result.session;                     /* the cookie carries it, not the body */
    }
    if (key === 'DELETE /api/session') {
      res.setHeader('Set-Cookie', 'oc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    }
    if (req.method !== 'GET') broadcast(key);

    send(res, 200, result);
  } catch (error) {
    if (error instanceof HttpError) { send(res, error.status, { error: error.message }); return; }
    process.stderr.write('unhandled: ' + (error && error.stack) + '\n');
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    process.stdout.write('Originate Command\n');
    process.stdout.write('  http://localhost:' + PORT + '\n');
    process.stdout.write('  database ' + DB_FILE + '\n');
    const count = database.prepare('SELECT count(*) AS c FROM users').get().c;
    if (!count) process.stdout.write('  no accounts yet — run: npm run seed\n');
  });
}

module.exports = { server, database, broadcast };
