// PreToolUse guard for Edit/Write/NotebookEdit.
// 1) Blocks edits to CLAUDE.md / .claude/settings*.json / .claude/hooks/** — Mar'uf must never
//    rewrite his own rulebook or turn off his own safety checks.
// 2) Blocks Edit/Write/NotebookEdit on tasks.json / log.md / memory.json — these are only ever
//    updated by the orchestrator via a plain script (Bash), never by a sub-agent's text-editing
//    tools. This exists because task-doer sub-agents have repeatedly ignored the prose
//    instruction not to touch these files directly, bypassing verification. Enforced here so it
//    can't happen regardless of what a sub-agent decides to do.
// 3) Blocks writing anything that looks like a secret/credential into any file — secrets never
//    belong in code, tasks.json, or the log.
const path = require('path');

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9a-zA-Z-]+/,
  /ghp_[0-9a-zA-Z]{36}/,
  /AIza[0-9A-Za-z\-_]{35}/,
  /password\s*[:=]\s*['"][^'"]{6,}['"]/i,
  /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /secret[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i,
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

function block(reason) {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

(async () => {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { process.exit(0); }

  const ti = input.tool_input || {};
  const filePath = ti.file_path || ti.notebook_path || '';
  if (filePath) {
    // Windows paths are case-insensitive (and drive letters can come through as either case
    // depending on how a tool built the path) — normalize before comparing.
    const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
    const root = path.resolve(__dirname, '..', '..');
    const protectedExact = [
      path.join(root, 'CLAUDE.md'),
      path.join(root, '.claude', 'settings.json'),
      path.join(root, '.claude', 'settings.local.json'),
    ].map(norm);
    const hooksDir = norm(path.join(root, '.claude', 'hooks')) + path.sep;
    const dataFiles = [
      path.join(root, 'tasks.json'),
      path.join(root, 'log.md'),
      path.join(root, 'memory.json'),
    ].map(norm);
    const target = norm(filePath);
    if (protectedExact.includes(target) || target.startsWith(hooksDir)) {
      return block(
        "Mar'uf's safety hook blocked this — CLAUDE.md, settings, and the hooks folder are " +
        "off-limits to self-edit. If a rule genuinely needs to change, ask Maroof to make (or " +
        "approve) the edit directly."
      );
    }
    if (dataFiles.includes(target)) {
      return block(
        "Mar'uf's safety hook blocked this — tasks.json, log.md, and memory.json are only ever " +
        "updated by the orchestrator after verification, never by a sub-agent's Edit/Write tool. " +
        "If you're the task-doer or verifier: report your proposed content back in your response " +
        "instead of writing it here yourself. If you're the orchestrator: use a plain script " +
        "(e.g. Bash + node -e) to update this file instead."
      );
    }
  }

  const content = [ti.content, ti.new_string, ti.new_source]
    .filter((v) => typeof v === 'string')
    .join('\n');
  if (content) {
    const hit = SECRET_PATTERNS.find((re) => re.test(content));
    if (hit) {
      return block(
        "Mar'uf's safety hook blocked this write — it looks like it contains a secret or " +
        "credential. Secrets never get stored in files. If a job needs one Mar'uf doesn't have, " +
        "mark it 'stuck' and say plainly what's missing instead."
      );
    }
  }

  process.exit(0);
})();
