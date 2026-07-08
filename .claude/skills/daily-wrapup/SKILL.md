---
name: daily-wrapup
description: Recipe for a short, dated end-of-day summary (Done / Doing / Next) built from today's activity, saved to log/YYYY-MM-DD.md. Use for a "daily wrap-up," "end of day summary," or "recap of today" job.
---

# Daily wrap-up

## When to use this

Whenever a job (or a note from Maroof) asks for a "daily wrap-up," "end of day summary," "recap
of today," or similar. This is not something that runs on its own every day — away mode is off,
and even if it were on, this only fires when explicitly asked for, not as a silent background
habit. If it's unclear whether "today" means the last 24 hours or the calendar day, default to
the calendar day (local date) and say so in the report.

## Steps

1. **Gather today's activity** — read `tasks.json` and pull every note (across all jobs) whose
   `at` timestamp falls on today's date, plus every `log.md` line timestamped today.
2. **Sort into three buckets:**
   - **Done** — jobs that reached `done` today, or notes fully answered/resolved today.
   - **Doing** — anything currently `working` or `needs_ok` right now (still open, in motion).
   - **Next** — jobs still `waiting`, or a clear next step named in a report/note (e.g. "ask
     Maroof to confirm X").
3. **Write a short summary** — plain language, a few lines per bucket, not a full transcript.
   Skip a bucket entirely if it's empty; don't pad it with "nothing here."
4. **Save it** to `log/YYYY-MM-DD.md` in the project root (create the `log/` folder the first
   time it's needed — one file per calendar day). If today's file already exists (a wrap-up
   already ran today), overwrite it with the fresh, complete version rather than appending
   duplicate entries.
5. **Report back** with the short summary text and the file path, so it shows on the job card
   too — this is a real deliverable, not just a confirmation that it ran.

## Example

Given a day where "Study Buddy" answered a Hamlet question and closed, "Professor Agent" is still
waiting on a reply, and "P.A" is queued but untouched:

```markdown
# Daily wrap-up — 2026-07-03

**Done**
- Study Buddy explained Shakespeare's Hamlet (plot, themes, characters) — verified accurate, job closed.

**Doing**
- Professor Agent is waiting on Maroof to confirm or redirect its proposed scope.

**Next**
- P.A is still waiting to be picked up — no note yet on what to write down.
```

Saved to `log/2026-07-03.md`.
