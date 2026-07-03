# Mar'uf — your personal bot

Mar'uf is a small bot that lives entirely in this folder. It picks up jobs you add on a simple
web page, does them itself, checks its own work, and reports back — in plain language, with a
log you can always read.

## How to use it

1. Open **http://localhost:4545** in your browser (Claude Code starts this for you).
2. **Add a job**: give it a title, a plain description of what you need, and how important it is
   (High / Medium / Low). Click "Add job".
3. Watch it move through the columns on the page:
   - **Waiting** → not picked up yet.
   - **Working on it** → Mar'uf is doing it right now.
   - **Needs your OK** → Mar'uf needs a click (or an answer) from you before it can go further —
     read the question/reason, then click **Yes** or **No**, or type a reply in the note box.
   - **Done** → finished, with a plain-language note explaining what happened.
   - **Stuck** → couldn't finish, with the real reason why (never faked).
4. **Log**, at the bottom of the page, is a running plain-English history of every round of work.

You never need to install anything, sign up for anything, or type a command — the page and the
bot are both already running in the background.

## How the bot runs

- **While Claude Code is open**: a loop checks for work every 2 minutes.
- **While you're away**: currently **off** (see below) — you chose to skip this during setup.
  When you're ready, ask to turn it on and it'll run hourly, 9am–9pm, via a local Windows Task
  Scheduler entry (not a cloud service — everything stays on this machine).

Both modes run the exact same "one round of work": look at the job list → pick the most
important open job → do it (using a matching recipe if one exists) → have a second helper check
the result → write a plain-language report → log one line → notice any correction you left and
remember it for next time.

## What it can do

- **Research** — search the web and summarize with real links, never invented facts.
- **Files** — read, write, and tidy up files in this project.
- **Code** — write and test code; only ever used once it passes a 🟢 green or 🟡 amber
  traffic-light check (🔴 red gets undone automatically, never applied).
- **Email drafts** — can prepare a Gmail draft (e.g. the daily pending-jobs digest), but never
  sends anything — that's always your click, in Gmail itself.
- **Calendar** — read-only for now (can look things up, can't add/change/delete events yet).

## Safety, in plain terms

- Mar'uf never asks you for a password or API key.
- Mar'uf never deletes something it didn't create, or runs a risky command, without asking first.
- Mar'uf never sends, publishes, or posts anything outside this computer without your click.
- Mar'uf can't rewrite its own rules (`CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/`) —
  that's enforced automatically, not just a promise.
- If something breaks, Mar'uf undoes it, says so honestly, and marks the job "stuck" — it never
  pretends something worked when it didn't.

## Project layout (for reference — you don't need to touch these)

```
CLAUDE.md          Mar'uf's rulebook — read fresh every round
tasks.json         the job list (the page and the bot both read/write this)
log.md             the plain-English activity log
memory.json        corrections you've given, so mistakes don't repeat
app/               the web page + tiny backend that serves it
.claude/agents/    task-doer (does one job) and verifier (checks the work)
.claude/skills/    recipes for research / files / code / the pending-jobs reminder
.claude/hooks/     automatic safety checks (can't be turned off from inside a job)
```

## Current known issue

Your Gmail connector's access token has expired, so the pending-jobs-reminder job is currently
stuck (its content is saved on the job card, nothing is lost). Re-authorize Gmail in your
claude.ai connector settings, then add a note to that job and it'll go out as a real draft.
