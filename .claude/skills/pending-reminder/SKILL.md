---
name: pending-reminder
description: Recipe for the recurring "remind me what's pending" job. Builds a plain-language digest of open jobs and puts it in a Gmail draft to Maroof's personal email — never sent automatically. Use for jobs about reminders/digests of pending work.
---

# Pending-jobs reminder

Goal: keep Maroof aware of what's piling up, without ever sending anything on his behalf.

1. **Read `tasks.json`** and pull every job that's `waiting`, `working`, or `needs_ok` — skip
   `done` and `stuck` (those already have their own visible status).
2. **Group and sort**: `needs_ok` first (these are blocking on Maroof specifically), then
   `working`, then `waiting` (High > Medium > Low, oldest first within a tier).
3. **Write a short, plain-language digest** — a few lines per job: title, status, and (for
   `needs_ok`) the one-line reason it's waiting on him. Keep the whole thing skimmable in under a
   minute. A little Mar'uf personality is fine here (see CLAUDE.md's voice notes) — this is a
   chat-style note, not a formal report.
4. **Create a Gmail draft** addressed to YOUR_EMAIL@example.com (replace with your real personal
   email from setup — redacted here since this file is committed to a public repo) with that
   digest as the body and a clear subject like "Mar'uf: N jobs need a look".
   Use the Gmail draft tool — never a send tool (there isn't one, and that's intentional).
5. **Mark this job `needs_ok`** with a report saying the draft was created and a short preview of
   what's in it, so Maroof knows to go check Gmail and send it himself if he wants to.
6. If there's nothing pending worth mentioning (queue is empty or everything's already `done`),
   don't create a draft — report that plainly and mark the job `done` instead.
