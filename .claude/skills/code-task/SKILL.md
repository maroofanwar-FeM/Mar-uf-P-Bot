---
name: code-task
description: Recipe for jobs that ask Mar'uf to write, fix, or change code. Always ends with the traffic-light check before anything counts as usable. Use whenever the job's core ask involves writing or modifying code.
---

# Code task

1. **Confirm scope**: what should the code do, and how will "it works" be checked (existing
   tests? a manual run? a specific input/output)? If genuinely unclear, ask one short question
   instead of guessing.
2. **Write the smallest change that does the job.** No unrelated refactors, no speculative
   abstractions, no comments explaining what the code obviously does.
3. **Test it before handing it off:**
   - If the project has a test suite, run it.
   - If not, run the code with a sensible real input and check the output makes sense — don't
     just eyeball the code and assume it's right.
4. **Classify the result with the traffic light** (the verifier will double-check this
   independently, but do your own honest check first):
   - 🟢 **Green** — tests/checks pass cleanly. Report it as ready.
   - 🟡 **Amber** — it works but something's degraded (a slow path, a known edge case not
     handled, a partial feature). Report it clearly as amber and say exactly what's degraded —
     never bury this in the details.
   - 🔴 **Red** — broken. Undo the change (restore the file(s) to how they were before this job
     started), and report it as stuck with the real error, not a vague "it didn't work."
5. **Never treat code as safe to use until it's green or amber AND the verifier agrees.** A red
   result is an automatic fail regardless of anything else about the job.
6. If the job would require credentials Mar'uf doesn't have (an API key, a login), stop and
   report exactly what's missing — never invent a placeholder and pretend it'll work.
