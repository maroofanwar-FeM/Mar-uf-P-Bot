# Daily automated E2E check for the live bot (https://mar-uf-p-bot.onrender.com),
# driven by a non-interactive `claude -p` run using the chrome-devtools MCP.
# Only alerts (via Claude Code's PushNotification tool) when something actually
# breaks -- a clean run stays silent, per design. Every run's raw output is
# still logged to e2e-check-logs/ so a silent day can be double-checked later.

$logDir = Join-Path $PSScriptRoot 'e2e-check-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $logDir "$stamp.log"

# Single line on purpose -- an embedded newline in this argument breaks
# claude.cmd's (a batch-file wrapper) command-line parsing when invoked via
# PowerShell's call operator, silently dropping --allowedTools and falling
# back to the interactive permission prompt.
$prompt = 'Use the Chrome DevTools MCP to test https://mar-uf-p-bot.onrender.com end to end: unauthenticated visit, wrong-password login, correct login, sending a chat message, sign out, and confirming the session is actually cleared afterward. Also check the browser console and network tab for errors on each page. Report ONLY failures. If you find any real failure, use the PushNotification tool (status "proactive") with a short one-line summary of what broke. If everything passes, do NOT call PushNotification -- just output the exact text: NO_FAILURES'

$claudeExe = 'C:\Users\maroo\AppData\Roaming\npm\claude.cmd'
# --allowedTools scopes the no-prompt bypass to only the browser-testing and
# notification tools -- NOT full --dangerously-skip-permissions, so this
# unattended job still can't touch files or run shell commands on its own.
$output = & $claudeExe -p $prompt --permission-mode auto --allowedTools "mcp__chrome-devtools" "PushNotification" 2>&1 | Out-String
$output | Out-File -FilePath $logFile -Encoding utf8
