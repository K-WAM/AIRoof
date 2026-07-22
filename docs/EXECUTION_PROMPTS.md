# EXECUTION_PROMPTS.md — Repository-specific prompts

Copy-paste prompts for workers and reviewers. Keep them short — all real instructions live in `AGENTS.md`
(rules) and `MASTER_PLAN.md` (task specs). Replace `<...>` placeholders.

---

## W-FIRST — Worker, first use (new session, full context)

```
You are a WORKER agent for the AI Receptionist release plan.

Work ONLY inside your worktree: <WORKTREE_PATH>   (branch <BRANCH>)
Your tasks: <TASK_IDS>

Setup, in order:
1. cd into the worktree and run `npm install`.
2. STOP AND VERIFY before any edit: run `git rev-parse --show-toplevel` and `git branch --show-current`.
   Both must exactly match <WORKTREE_PATH> and <BRANCH> above. If either doesn't match — especially if
   `--show-toplevel` points at the main repo instead of your worktree — fix your working directory before
   touching any file. Re-run this check after any long gap or tool error, and again right before your commit.
   Workers have previously edited the main repo by mistake this way; it silently defeats worktree isolation.
3. Read AGENTS.md fully — you are bound by it (roles, protected context, definition of done,
   stuck protocol, known hiccups, and the working-directory-discipline section this maps to).
4. Read your task specs in MASTER_PLAN.md (only your task IDs) and your row in TODO.md.
5. Implement each task: code + tests, owned files only, one commit per task
   (`T-0XX: <summary>`), gates green (type-check, lint, test; build once per batch). Re-run the step-2
   verification right before this commit.
6. Append evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to `review`.

Hard rules: never push, merge, touch main, other branches, or files outside your owned scope.
Never weaken auth, add bypasses, placeholder secrets, or mock fallbacks reachable in production.
If you need a missing API key or console action, record it under NEEDS-HUMAN in TODO.md and say so.
If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, and end your reply with:
"Paste this to Fable: Worker on <BRANCH> is stuck on T-0XX: <question>."
```

Current batch values:

| Batch | WORKTREE_PATH | BRANCH | TASK_IDS |
|---|---|---|---|
| A | *(merged, worktree removed)* | `task/p0-authority` | T-010, T-011 |
| B | *(merged, worktree removed)* | `task/ci-foundation` | T-000, T-001, T-002 |
| A2 | *(merged, worktree removed)* | `task/shared-primitives` | T-021, T-022 |
| B2 | *(merged, worktree removed)* | `task/config-guard` | T-020 |
| C | `D:\Apps\air-wt-field-tokens` (was `air-wt-scheduling-integrity`) | `task/field-tokens` | T-030/T-031/T-032 (all merged) → **T-034 next, same worktree, new branch** |
| D | `D:\Apps\air-wt-ai-input-hardening` (was `air-wt-demo-isolation`) | `task/ai-input-hardening` | T-035 (merged) → **T-033 next, same worktree, new branch** |

---

## PENDING — next assignments, ready to paste (as of `07f0cf1`, 2026-07-21, 55% complete)

Both worktrees were retired from their fully-merged branches and reassigned + renamed this session
(`git worktree move`) — node_modules and graphify-out carried over untouched and were re-verified healthy
(`npm run type-check` clean in both) after the rename. graphify-out/ is refreshed and current through the
T-032/T-035 merge (AST-only refresh again this round — see SESSION_HANDOFF.md). Use `graphify
explain`/`query`/`path` before Glob/Grep sweeps in both.

### Next for Codex (Worker C) — T-034, same worktree, new branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-030/T-031/T-032 work is merged and done).

Work ONLY inside: D:\Apps\air-wt-field-tokens   (branch task/field-tokens)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci. If a gate fails with
a real MODULE_NOT_FOUND for a package you didn't touch, stop and ask before reinstalling.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "verifyFieldAccess"
  graphify query "how does the public field QR link authenticate?"
  graphify path "fieldKey" "verifyFieldAccess"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-034 — Scoped field access tokens (MASTER_PLAN.md, Phase 3).
Read AGENTS.md fully first (this repo now has a mandatory working-directory-discipline section — read
it, it exists because of the mistake above). Read only the T-034 section of MASTER_PLAN.md and your row
in TODO.md.

Owns: src/lib/auth/verifyRole.ts (verifyFieldAccess + new token exchange); src/app/field/page.tsx (token
bootstrap); src/app/api/field/exchange/route.ts (new); QR-link construction in src/app/admin/demo/page.tsx
and demo-customize's fieldUrl output. This is the ONLY task touching verifyRole.ts in this plan — no
serialization conflict with any other in-flight work.

Key acceptance points: keep fieldKey as the mint secret, but exchange it server-side for a signed,
short-lived token (HMAC via T-020's server secret, TTL ≤ 12h) scoping to the business + optional job;
QR links carry a one-time/short-TTL exchange URL, not the reusable business-wide key; after bootstrap,
strip the credential from the URL (history.replaceState + server redirect) so nothing reusable survives
in browser history/referrers; expired/revoked tokens fail closed; a job-scoped token cannot touch a
different job. Printed-QR workflow must still work end-to-end (QR → exchange → session) and
unauthenticated crew phones must still work. Existing demo-roofing printed QRs may break once — log it
and note the demo playbook needs a pointer, don't silently break the demo without recording it.
Feature-flag a fallback to the legacy `?key=` for one deploy cycle (removed later in T-051) — do not
delete the old path outright yet.

One commit (T-034: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, touch main, or change
session-role auth paths or add a new auth provider. If blocked >20 min: commit WIP, log HELP-NEEDED in
TODO.md, and give me the stuck-summary block.
```

### Next for Deepseek (Worker D) — T-033, same worktree, new branch

```
You are Worker D for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-035 work is merged and done).

Work ONLY inside: D:\Apps\air-wt-ai-input-hardening   (branch task/ai-input-hardening)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
This exact mistake has happened before on this worktree. Re-check before your commit too.
node_modules is a directory junction to the main worktree's — do NOT run npm install, npm ci, or delete
node_modules. If something genuinely looks missing, run `npm run type-check` first to confirm before
touching node_modules at all.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "parseFieldUpdate"
  graphify query "where do transcription and AI parsing happen and what validates their output?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-033 — AI input hardening + provider/model routing (MASTER_PLAN.md, Phase 3).
Read AGENTS.md fully first. Read only the T-033 section of MASTER_PLAN.md and your row in TODO.md.

Owns: src/lib/ai/deepseekClient.ts; src/lib/ai/registry.ts (new); src/app/api/jobs/[jobId]/field-audio/
route.ts; src/app/api/transcribe/route.ts; src/app/api/agent/respond/route.ts. Zero file overlap with
Codex's T-034 work — fully parallel-safe.

Key acceptance points: adopt T-022's zod schemas at these trust boundaries — invalid or low-confidence
extractions get flagged for user confirmation, never silently persisted; centralize provider/model
selection in the new registry, honoring DEEPSEEK_MODEL and the persisted backOfficeModel setting instead
of hardcoded model names; remove any mock/fallback response that could run in production — missing prod
API keys must fail readiness explicitly (via T-020's config/capability checks), never fabricate a
plausible-looking summary. Dev/demo may keep a mock ONLY when NODE_ENV !== 'production' and it is clearly
labeled as a mock in the output. Test against the adversarial edge cases: malformed nested JSON, prompt
injection inside a transcript, oversized/empty audio, multilingual/noisy input (must hit the low-confidence
confirm path, not silently guess), provider timeout. Do NOT touch job.parsed's projection ownership
(src/lib/jobs/projection.ts) — that's out of scope and already correct. Do NOT change the field-correction
UX, add new providers, or redesign prompts.

One commit (T-033: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main, or files
outside your owned scope. If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the
stuck-summary block.
```

---

## W-SAME — Worker, same session (short)

```
Continue as Worker <A|B> per docs/EXECUTION_PROMPTS.md W-FIRST. Next: <TASK_ID or "resume">.
```

## W-NEW — Worker, new session (short)

```
You are Worker <A|B> for this repo's release plan. Run docs/EXECUTION_PROMPTS.md → W-FIRST with the
batch-<A|B> values from its table. Check TODO.md for current status before coding.
```

---

## R-FIRST — Reviewer, first use (full)

```
You are a REVIEWER agent for the AI Receptionist release plan.

Review branch <BRANCH> (worktree <WORKTREE_PATH>) against main.
1. Read AGENTS.md (Reviewer role) and the task specs in MASTER_PLAN.md for <TASK_IDS>.
2. `git diff main...<BRANCH>` — verify: acceptance criteria met with tests, owned-scope respected,
   no weakened guards/bypasses/secrets, protected context intact, gates green
   (`npm run type-check && npm run lint && npm test` in the worktree).
3. Fix ONLY trivial unambiguous defects (commit `T-0XX review: <fix>`). Anything substantial:
   write findings into TODO.md under the batch row and set status `rework`.
4. Verdict per task: APPROVE / REWORK, with evidence. Do not merge, push, or edit main.
```

## RV-SAME — Reviewer, same session (short)

```
Review batch <A|B> per docs/EXECUTION_PROMPTS.md R-FIRST. Verdict per task with evidence.
```

## RV-NEW — Reviewer, new session (short)

```
You are the Reviewer for this repo. Run docs/EXECUTION_PROMPTS.md → R-FIRST for batch <A|B>
(paths in the W-FIRST table). Check TODO.md status first.
```

---

## I-NEW — Integrator, new session

```
You are the INTEGRATOR (orchestrator) for this repo. Read docs/SESSION_HANDOFF.md, then TODO.md.
You alone merge reviewed branches into local main, run combined gates
(type-check, lint, build, test), update TODO.md/SESSION_HANDOFF.md, and assign next batches per
MASTER_PLAN.md §Integration order. Nothing is pushed until the owner says "approve push".
```
