// Mar'uf's tiny backend. Plain Node.js, no npm installs, no external deps.
// Serves the web page and a small JSON API that reads/writes tasks.json and log.md.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TASKS_FILE = path.join(ROOT, 'tasks.json');
const LOG_FILE = path.join(ROOT, 'log.md');
const MEMORY_FILE = path.join(ROOT, 'memory.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 4545;

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch (e) {
    return { jobs: [] };
  }
}

function writeTasks(data) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2) + '\n');
}

function readLog() {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8');
  } catch (e) {
    return "# Mar'uf's Log\n";
  }
}

function readMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (e) {
    return { corrections: [] };
  }
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const VALID_IMPORTANCE = new Set(['High', 'Medium', 'Low']);
const VALID_DECISIONS = new Set(['yes', 'no']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const parts = u.pathname.split('/').filter(Boolean); // e.g. ['api','tasks',':id','note']

  try {
    if (u.pathname === '/api/tasks' && req.method === 'GET') {
      return sendJSON(res, 200, readTasks());
    }

    if (u.pathname === '/api/tasks' && req.method === 'POST') {
      const body = await readBody(req);
      const title = (body.title || '').toString().trim();
      const description = (body.description || '').toString().trim();
      const importance = VALID_IMPORTANCE.has(body.importance) ? body.importance : 'Medium';
      if (!title) return sendJSON(res, 400, { error: 'A title is needed.' });

      const data = readTasks();
      const now = new Date().toISOString();
      const job = {
        id: crypto.randomUUID(),
        title,
        description,
        importance,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        report: '',
        needsOkReason: '',
        notes: [],
      };
      data.jobs.push(job);
      writeTasks(data);
      return sendJSON(res, 201, job);
    }

    if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2] && parts[3] === 'note' && req.method === 'POST') {
      const id = parts[2];
      const body = await readBody(req);
      const text = (body.text || '').toString().trim();
      if (!text) return sendJSON(res, 400, { error: 'Note text is empty.' });
      const data = readTasks();
      const job = data.jobs.find((j) => j.id === id);
      if (!job) return sendJSON(res, 404, { error: 'Job not found.' });
      job.notes.push({ from: 'maroof', text, at: new Date().toISOString(), handled: false });
      job.updatedAt = new Date().toISOString();
      writeTasks(data);
      return sendJSON(res, 200, job);
    }

    if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2] && parts[3] === 'decision' && req.method === 'POST') {
      const id = parts[2];
      const body = await readBody(req);
      const decision = body.decision;
      if (!VALID_DECISIONS.has(decision)) return sendJSON(res, 400, { error: 'Decision must be yes or no.' });
      const data = readTasks();
      const job = data.jobs.find((j) => j.id === id);
      if (!job) return sendJSON(res, 404, { error: 'Job not found.' });
      if (job.status !== 'needs_ok') return sendJSON(res, 400, { error: 'This job is not waiting on a decision.' });
      if (job.askType !== 'approval') return sendJSON(res, 400, { error: 'This job is asking a question, not waiting on an approval — reply with a note instead.' });
      if (decision === 'yes') {
        job.status = 'working';
        job.approved = true;
        job.report = (job.report ? job.report + '\n' : '') + 'Maroof clicked yes — proceeding.';
      } else {
        job.status = 'stuck';
        job.approved = false;
        job.report = (job.report ? job.report + '\n' : '') + 'Maroof clicked no — stopped, nothing risky was done.';
      }
      job.updatedAt = new Date().toISOString();
      writeTasks(data);
      return sendJSON(res, 200, job);
    }

    if (u.pathname === '/api/log' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(readLog());
    }

    if (u.pathname === '/api/memory' && req.method === 'GET') {
      return sendJSON(res, 200, readMemory());
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, u.pathname);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

function getLanAddress() {
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mar'uf's page is up: http://localhost:${PORT}`);
  const lan = getLanAddress();
  if (lan) console.log(`Also reachable from other devices on this WiFi network at: http://${lan}:${PORT}`);
});
