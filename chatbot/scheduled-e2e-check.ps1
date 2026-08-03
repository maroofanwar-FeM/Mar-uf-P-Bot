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
$prompt = 'Use the Chrome DevTools MCP to test https://mar-uf-p-bot.onrender.com end to end: unauthenticated visit, wrong-password login, correct login, sending a chat message, sign out, and confirming the session is actually cleared afterward. Also check the browser console and network tab for errors on each page. Report ONLY failures. If you find any real failure, use the PushNotification tool with status proactive and a short one-line summary of what broke. If everything passes, do NOT call PushNotification, just output the exact text: NO_FAILURES'

# The real .exe, not claude.cmd (a batch-file wrapper) -- Task Scheduler's
# process/console creation was killing the .cmd wrapper immediately with
# 0xC000013A (STATUS_CONTROL_C_EXIT) before it produced any output at all.
$claudeExe = 'C:\Users\maroo\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe'
$errFile = Join-Path $logDir "$stamp.err.log"

# --allowedTools scopes the no-prompt bypass to only the browser-testing and
# notification tools -- NOT full --dangerously-skip-permissions, so this
# unattended job still can't touch files or run shell commands on its own.
# Start-Process (rather than the `&` call operator + pipeline capture) is
# used here because Task Scheduler's job-object environment was killing the
# piped invocation immediately (exit 0xC000013A) before it produced any
# output -- Start-Process -RedirectStandardOutput avoids that pipeline.
# In Windows PowerShell 5.1, -ArgumentList just joins array elements with a
# space into one Arguments string, so $prompt (which has spaces) must be
# wrapped in its own quotes here or it silently splits into many arguments.
$quotedPrompt = '"' + $prompt + '"'
$argList = @('-p', $quotedPrompt, '--permission-mode', 'auto', '--allowedTools', 'mcp__chrome-devtools', 'PushNotification')
# The chrome-devtools MCP server was registered as a project-scoped config
# tied to this project folder -- claude.exe resolves that based on its
# working directory, which Task Scheduler otherwise defaults to somewhere
# else entirely (not this folder), so the MCP server wouldn't be found.
$proc = Start-Process -FilePath $claudeExe -ArgumentList $argList -NoNewWindow -Wait -PassThru `
  -WorkingDirectory 'C:\Users\maroo\Downloads\P Bot-staging' `
  -RedirectStandardOutput $logFile -RedirectStandardError $errFile
"exit code: $($proc.ExitCode)" | Out-File -FilePath $logFile -Append -Encoding utf8
