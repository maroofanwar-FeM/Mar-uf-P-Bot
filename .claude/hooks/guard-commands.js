// PreToolUse guard for Bash/PowerShell. Hard-blocks destructive or irreversible commands so
// Mar'uf can never run them, even by accident, even when nobody's watching (away mode).
// This is a deny-list safety net, not the main control — task-doer should ask via the web
// page ("needs my OK") for anything risky long before it reaches a shell command.
const DENY_PATTERNS = [
  /\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*|--recursive\s+--force|--force\s+--recursive)\b/i,
  /\bremove-item\b[\s\S]*-recurse[\s\S]*-force\b/i,
  /\bremove-item\b[\s\S]*-force[\s\S]*-recurse\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+[\s\S]*\/s\b[\s\S]*\/q\b/i,
  /\bdel\s+[\s\S]*\/q\b[\s\S]*\/s\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bgit\s+push\b[\s\S]*(--force\b|-f\b|--force-with-lease\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-\w*f\w*/i,
  /\bgit\s+branch\s+-D\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\bstop-computer\b/i,
  /\bdrop\s+(table|database)\b/i,
  /\btruncate\s+table\b/i,
  /\bmkfs\b/i,
  /\breg\s+delete\b/i,
  /\bnet\s+user\b[\s\S]*\/delete\b/i,
  /(curl|wget|invoke-webrequest|iwr)\b[\s\S]*\|\s*(sh|bash|powershell|iex)\b/i,
  /\biex\b[\s\S]*downloadstring/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // fork bomb
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

(async () => {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { process.exit(0); }

  const command = (input.tool_input && input.tool_input.command) || '';
  if (!command) process.exit(0);

  const hit = DENY_PATTERNS.find((re) => re.test(command));
  if (hit) {
    process.stderr.write(
      "Mar'uf's safety hook blocked this command — it looks destructive or irreversible " +
      "(matched: " + hit.toString() + ").\n" +
      "If this is genuinely needed, mark the job 'needs my OK' on the page and describe exactly " +
      "what should run and why, instead of running it directly.\n"
    );
    process.exit(2);
  }
  process.exit(0);
})();
