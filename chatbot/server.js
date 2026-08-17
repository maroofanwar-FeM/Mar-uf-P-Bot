// A tiny standalone chatbot server. Plain Node.js, no framework -- the one
// real dependency is `pg`, for saving chat history to Postgres.
//
// What it does:
//   - Shows a login screen first. Only a username/password matching the
//     APP_USERNAME / APP_PASSWORD environment variables (read from chatbot/.env,
//     never hard-coded) gets in.
//   - Once signed in, serves the bot page (public/index.html): an input box, a
//     Run button, an output area.
//   - When you click Run, the page sends your text to this server, which calls
//     Groq's free-tier chat completions API (OpenAI-compatible) to get a reply.
//     Needs a GROQ_API_KEY — get one free at console.groq.com/keys.
//   - Each exchange (your message + the bot's reply) is saved to the database
//     via db.js, grouped into one conversation per login session. A save
//     failure is logged but never blocks the chat reply itself.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

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

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

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

// --- Chat history: this app has no multi-user login or topic-picker UI, so
// every conversation links to the same one default user and one default
// topic row. Maps session token -> conversation_id (cleared on restart, same
// as `sessions`), so all of one login session's messages group together. ---
const conversationBySession = new Map();
let defaultUserId = null;
let defaultTopicId = null;

async function getDefaultUserId() {
  if (defaultUserId) return defaultUserId;
  const name = process.env.APP_USERNAME || 'default user';
  const existing = await db.query('SELECT id FROM users WHERE name = $1 LIMIT 1', [name]);
  if (existing.rows[0]) return (defaultUserId = existing.rows[0].id);
  const inserted = await db.query('INSERT INTO users (name) VALUES ($1) RETURNING id', [name]);
  return (defaultUserId = inserted.rows[0].id);
}

async function getDefaultTopicId() {
  if (defaultTopicId) return defaultTopicId;
  const name = 'General';
  const existing = await db.query('SELECT id FROM topics WHERE topic_name = $1 LIMIT 1', [name]);
  if (existing.rows[0]) return (defaultTopicId = existing.rows[0].id);
  const inserted = await db.query(
    'INSERT INTO topics (topic_name, description) VALUES ($1, $2) RETURNING id',
    [name, 'Default topic -- no topic-picker UI exists yet.']
  );
  return (defaultTopicId = inserted.rows[0].id);
}

async function getOrCreateConversation(sessionToken) {
  const existing = conversationBySession.get(sessionToken);
  if (existing) return existing;
  const userId = await getDefaultUserId();
  const topicId = await getDefaultTopicId();
  const result = await db.query(
    'INSERT INTO conversations (user_id, topic_id) VALUES ($1, $2) RETURNING id',
    [userId, topicId]
  );
  const conversationId = result.rows[0].id;
  conversationBySession.set(sessionToken, conversationId);
  return conversationId;
}

function saveMessage(conversationId, sender, content) {
  return db.query(
    'INSERT INTO messages (conversation_id, sender, content) VALUES ($1, $2, $3)',
    [conversationId, sender, content]
  );
}

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

// Calls Groq's OpenAI-compatible chat completions endpoint and returns the
// reply text. Plain text only — this has no tool access, so it can't edit
// files or run commands, unlike a full Claude Code session.
async function callGroq(userInput) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Server is missing GROQ_API_KEY. Add it to chatbot/.env (see chatbot/.env.example) and restart the server.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res;
  try {
    res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: userInput }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The bot took too long to answer (timed out).');
    throw new Error(`Could not reach Groq: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('Groq API returned an empty reply.');
  return reply.trim();
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

      // A save failure here is logged but never blocks the actual reply --
      // losing chat history is a lesser problem than losing the chat itself.
      let conversationId = null;
      try {
        conversationId = await getOrCreateConversation(parseCookies(req)[SESSION_COOKIE]);
        await saveMessage(conversationId, 'user', input);
      } catch (e) {
        console.error('Could not save the user message to the database:', e.message);
      }

      try {
        const output = await callGroq(input);
        if (conversationId) {
          saveMessage(conversationId, 'bot', output).catch((e) =>
            console.error('Could not save the bot reply to the database:', e.message)
          );
        }
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
  if (!process.env.GROQ_API_KEY) {
    console.log('Note: GROQ_API_KEY is not set — get a free one at console.groq.com/keys and add it to chatbot/.env (or as a host env var).');
  }
});
