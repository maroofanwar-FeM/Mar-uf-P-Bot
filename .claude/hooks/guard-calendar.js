// PreToolUse guard for Google Calendar tools that would change Maroof's real calendar.
// There's no "draft" mode for calendar events like there is for Gmail, so until a proper
// approval flow exists, Mar'uf may only look at the calendar, never write to it.
const BLOCKED_TOOLS = new Set([
  'mcp__claude_ai_Google_Calendar__create_event',
  'mcp__claude_ai_Google_Calendar__update_event',
  'mcp__claude_ai_Google_Calendar__delete_event',
  'mcp__claude_ai_Google_Calendar__respond_to_event',
]);

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

  if (BLOCKED_TOOLS.has(input.tool_name)) {
    process.stderr.write(
      "Mar'uf's safety hook blocked this — it would change Maroof's real calendar, and there's " +
      "no 'draft' mode for events. Instead, describe the proposed event in the job's report and " +
      "mark the job 'needs my OK' so Maroof can add it himself.\n"
    );
    process.exit(2);
  }
  process.exit(0);
})();
