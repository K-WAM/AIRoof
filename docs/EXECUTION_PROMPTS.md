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
| C | `D:\Apps\air-wt-pii-retention` (was `air-wt-field-tokens`, was `air-wt-scheduling-integrity`) | `task/pii-retention` | T-030/T-031/T-032/T-034 (all merged) → **T-042 next, same worktree, new branch** |
| D | `D:\Apps\air-wt-unified-comms` (was `air-wt-ai-input-hardening`, was `air-wt-demo-isolation`) | `task/unified-comms` | T-033/T-035 (merged) → **T-041 next, same worktree, new branch** |

---

## PENDING — next assignments, ready to paste (as of `d9265b1`, 2026-07-22, 65% complete)

Both worktrees were retired from their fully-merged branches and reassigned + renamed this session
(`git worktree move`) — node_modules and graphify-out carried over untouched and were re-verified healthy
(`npm run type-check` clean in both) after the rename. graphify-out/ is refreshed and current through the
T-033/T-034 merge (AST-only refresh again this round — see SESSION_HANDOFF.md). Use `graphify
explain`/`query`/`path` before Glob/Grep sweeps in both. **Phase 3 is fully closed** — these are the first
Phase 4 tasks.

### Next for Codex (Worker C) — T-042, same worktree, new branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-030/T-031/T-032/T-034 work is all merged and done; Phase 3 is fully closed).

Work ONLY inside: D:\Apps\air-wt-pii-retention   (branch task/pii-retention)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci. If a gate fails with
a real MODULE_NOT_FOUND for a package you didn't touch, stop and ask before reinstalling.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "vapiAppointmentConfirmations"
  graphify query "how are call transcripts and recordings stored, and what does DELETE /api/calls do today?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-042 — PII retention, deletion, audit integrity (MASTER_PLAN.md, Phase 4).
Read AGENTS.md fully first. Read only the T-042 section of MASTER_PLAN.md and your row in TODO.md.

Owns: src/lib/audit/** (new); src/app/api/cron/retention/route.ts (new); src/app/api/calls/[callId]/route.ts
(DELETE only); audit-log lines in src/app/api/webhooks/vapi/route.ts. No file overlap with T-041
(Deepseek, running in parallel) — verified.

Key acceptance points: build a retention-policy module with configurable windows (transcripts, recordings,
tool I/O logs) — use conservative 90-day defaults behind config, flagged for owner sign-off (NH-4 is a
legal decision, not yours to override). A cron-invoked redaction/deletion job authenticated via T-020's
requireCronAuth (401 before any read/write, matching the T-032 pattern). Immutable, append-only audit event
types with correlation IDs and provider IDs; fix the mislabelled lookup/cancel audit logs at
vapi/route.ts:273,342. DELETE on /api/calls/[callId] must match documented policy: true redaction of
transcript bodies and recording URLs, but retain an audit skeleton (hashes/lengths only, no PII) — never
just mark the call ended without actually redacting. Never delete financial records (invoices) via this
retention job. Retention runs must be resumable/idempotent if interrupted mid-batch; a call still active
must not be redacted out from under it. Create docs/RETENTION.md documenting the policy as part of this
task (the spec requires it).

One commit (T-042: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, touch main, or build
external consent/disclosure wording (NH-4) or data-subject request tooling — out of scope. If blocked
>20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the stuck-summary block.
```

### Next for Deepseek (Worker D) — T-041, same worktree, new branch

```
You are Worker D for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-033/T-035 work is all merged and done; Phase 3 is fully closed).

Work ONLY inside: D:\Apps\air-wt-unified-comms   (branch task/unified-comms)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
This exact mistake has happened before on this worktree. Re-check before your commit too.
node_modules is a directory junction to the main worktree's — do NOT run npm install, npm ci, or delete
node_modules. If something genuinely looks missing, run `npm run type-check` first to confirm before
touching node_modules at all.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "notify.ts"
  graphify query "where does the app send email today and what sender addresses does it use?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-041 — Unified outbound communications (MASTER_PLAN.md, Phase 4).
Read AGENTS.md fully first. Read only the T-041 section of MASTER_PLAN.md and your row in TODO.md.

Owns: src/lib/comms/** (new); src/lib/notify.ts; the email-sending lines only in agentTools.ts, the
send-confirmation route, the assign route, and the report/invoice send routes. No file overlap with T-042
(Codex, running in parallel) — verified. IMPORTANT: this is the ONLY task touching notify.ts in this
round — T-043/T-044 (owner-requested tasks queued behind this one) will migrate onto whatever you build
here, so build src/lib/comms/send.ts as a real, reusable service, not a one-off.

Key acceptance points: one comms service wrapping Resend with a single RESEND_FROM sender (D-4:
no-reply@luxordev.com), validated via T-020's config/capability check — if Resend/RESEND_FROM report
`not_configured`, the service must say so explicitly, never silently skip or claim success. Per-message
delivery records using T-021's ledger (attempts + provider message ID) so a duplicate send via
double-click doesn't send twice (idempotent per opId — you already have T-021/T-032's pattern to follow).
Typed results surfaced to callers: "delivery failed" must be distinguishable from "no email on file" —
don't collapse both into one generic error. Resend 4xx errors are terminal (don't retry), 5xx are
retryable. Migrate the existing call sites (notify.ts's two functions, agentTools.ts's branded emails,
send-confirmation, assign, report/invoice send) onto the new service — keep the existing BizBranding HTML
templates and email copy exactly as-is, only the sending mechanism/sender-identity logic changes. NH-3
(SPF/DKIM domain verification) is not yet done — until it is, the service should report `unconfigured` in
production rather than sending from an unverified domain; that's expected, not a bug to work around.

One commit (T-041: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, touch main, redesign the
email templates/copy, or add SMS. If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me
the stuck-summary block.
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
