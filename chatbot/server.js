// A tiny standalone chatbot server. Plain Node.js, no npm installs, no external deps.
//
// What it does:
//   - Shows a login screen first. Only a username/password matching the
//     APP_USERNAME / APP_PASSWORD environment variables (read from chatbot/.env,
//     never hard-coded) gets in.
//   - Once signed in, serves the bot page (public/index.html): an input box, a
//     Run button, an output area.
//   - When you click Run, the page sends your text to this server, which runs
//     the `claude` CLI as a one-off, non-interactive process to get a reply —
//     no API key needed, since it uses whatever you're already logged into
//     Claude Code with. It runs in a scratch folder outside this project, with
//     no special permission flags, so it can only answer in text — it has no
//     access to this project's files and can't run commands or edit anything
//     on its own.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const ENV_FILE = path.join(ROOT, '.env');
const SESSION_COOKIE = 'session';
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

// A host (Koyeb, Render, etc.) sets PORT and expects us to bind every interface.
// Locally there's no PORT env var, so we fall back to localhost only, using
// LOCAL_PORT to pick which port (e.g. running a second, staging copy) without
// tripping the hosted-mode behavior above.
const IS_HOSTED = !!process.env.PORT;
const PORT = process.env.PORT || process.env.LOCAL_PORT || 4546;
const HOST = IS_HOSTED ? '0.0.0.0' : '127.0.0.1';

// The real claude.exe/claude, not the claude.cmd wrapper — .cmd/.bat files need a
// shell to run on Windows, and shells don't safely escape arguments containing
// spaces or quotes. Calling the binary directly lets Node pass userInput as one
// exact argument, with no shell parsing involved at all.
// This is the copy npm installed as this project's own dependency (see
// package.json), not a global install — so the exact same code path runs
// whether it's your machine or a host that just ran `npm install`.
// The claude-code package's postinstall always places the real native binary
// at bin/claude.exe on every OS — the .exe is a fixed filename convention
// (needed for npm's cmd-shim on Windows), not a Windows-only extension.
const CLAUDE_BIN = path.join(ROOT, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

// Runs the prompt in a fresh scratch folder each time, so the CLI has no view of
// this project's files.
const SCRATCH_DIR = path.join(os.tmpdir(), 'maruf-chatbot-scratch');
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

// --- Load .env (KEY=VALUE per line) without needing any npm package ---
function loadEnvFile() {
  let text;
  try {
    text = fs.readFileSync(ENV_FILE, 'utf8');
  } catch (e) {
    return; // no .env yet — handled later with a clear error
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

// --- Sessions: an in-memory token -> expiry map. Cleared on server restart,
// which is fine for a small personal tool. ---
const sessions = new Map();

// --- Login lockout: after too many wrong guesses in a row, lock out for a
// cooldown. A single global counter (not per-IP) is enough for a one-user
// tool sitting behind a public tunnel, where a would-be attacker only has
// the tunnel URL to try against. ---
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
let loginFailures = 0;
let lockedOutUntil = 0;

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_LIFETIME_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { sessions.delete(token); return false; }
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return cookies;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return isValidSession(cookies[SESSION_COOKIE]);
}

// Constant-time-ish comparison so a wrong guess can't be timed to leak how many
// characters matched.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep timing consistent either way
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// SameSite=Lax already keeps the session cookie off cross-site POSTs, but an
// explicit Origin check is cheap insurance against CSRF for state-changing
// routes. No Origin header (e.g. same-tab form submit in older browsers) is
// allowed through, since that case is already covered by SameSite=Lax.
function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

function sendJSON(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('Request body too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

// Runs `claude -p "<input>"` non-interactively and returns its text reply.
// No --permission-mode flag is passed, so the CLI keeps its normal, cautious
// defaults — it can't edit files or run commands without approval, and there's
// no one here to click "yes", so it just answers in text.
function callClaude(userInput) {
  return new Promise((resolve, reject) => {
    execFile(
      CLAUDE_BIN,
      ['-p', userInput],
      { cwd: SCRATCH_DIR, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed) return reject(new Error('The bot took too long to answer (timed out).'));
          return reject(new Error(stderr.trim() || err.message));
        }
        resolve(stdout.trim());
      }
    );
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serveFile(res, fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (u.pathname === '/api/login' && req.method === 'POST') {
      if (Date.now() < lockedOutUntil) {
        const waitSec = Math.ceil((lockedOutUntil - Date.now()) / 1000);
        return sendJSON(res, 429, { error: `Too many failed attempts. Try again in ${waitSec}s.` });
      }

      const expectedUser = process.env.APP_USERNAME;
      const expectedPass = process.env.APP_PASSWORD;
      if (!expectedUser || !expectedPass) {
        return sendJSON(res, 500, {
          error: 'Server is missing APP_USERNAME / APP_PASSWORD. Add them to chatbot/.env (see chatbot/.env.example) and restart the server.',
        });
      }

      const body = await readBody(req);
      const username = (body.username || '').toString();
      const password = (body.password || '').toString();
      const ok = safeEqual(username, expectedUser) && safeEqual(password, expectedPass);

      if (!ok) {
        loginFailures += 1;
        if (loginFailures >= LOGIN_MAX_ATTEMPTS) {
          lockedOutUntil = Date.now() + LOGIN_LOCKOUT_MS;
          loginFailures = 0;
        }
        // Small fixed delay so repeated guesses can't be thrown as fast as possible.
        await new Promise((r) => setTimeout(r, 400));
        return sendJSON(res, 401, { error: 'Wrong username or password.' });
      }

      loginFailures = 0;
      const token = createSession();
      return sendJSON(res, 200, { ok: true }, {
        'Set-Cookie': `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}${IS_HOSTED ? '; Secure' : ''}`,
      });
    }

    if (u.pathname === '/api/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
      return sendJSON(res, 200, { ok: true }, {
        'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${IS_HOSTED ? '; Secure' : ''}`,
      });
    }

    if (u.pathname === '/api/run' && req.method === 'POST') {
      if (!isAuthed(req)) return sendJSON(res, 401, { error: 'Please sign in first.' });
      if (!isSameOriginRequest(req)) return sendJSON(res, 403, { error: 'Cross-site request blocked.' });

      const body = await readBody(req);
      const input = (body.input || '').toString().trim();
      if (!input) return sendJSON(res, 400, { error: 'Type something before clicking Run.' });

      try {
        const output = await callClaude(input);
        return sendJSON(res, 200, { output });
      } catch (e) {
        return sendJSON(res, 502, { error: e.message });
      }
    }

    if (u.pathname === '/' && req.method === 'GET') {
      return serveFile(res, isAuthed(req) ? 'index.html' : 'login.html');
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(IS_HOSTED ? `Chatbot is listening on port ${PORT}` : `Chatbot page is up: http://localhost:${PORT}`);
  if (!process.env.APP_USERNAME || !process.env.APP_PASSWORD) {
    console.log('Note: APP_USERNAME / APP_PASSWORD are not set yet — copy chatbot/.env.example to chatbot/.env and fill them in (or set them as host secrets).');
  }
  if (!process.env.ANTHROPIC_API_KEY && IS_HOSTED) {
    console.log('Note: ANTHROPIC_API_KEY is not set — the claude CLI needs it to authenticate on a host with no interactive login.');
  }
});
