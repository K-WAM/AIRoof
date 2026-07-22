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
| C | `D:\Apps\air-wt-ui-truthfulness` (was `air-wt-pii-retention`, `air-wt-field-tokens`, `air-wt-scheduling-integrity`) | `task/ui-truthfulness` | T-030/T-031/T-032/T-034/T-042 (all merged) → **T-040 next, same worktree, new branch** |
| D | `D:\Apps\air-wt-tenant-email` (was `air-wt-unified-comms`, `air-wt-ai-input-hardening`, `air-wt-demo-isolation`) | `task/tenant-email` | T-033/T-035/T-041 (all merged) → **T-043 next, same worktree, new branch** |

---

## PENDING — next assignments, ready to paste (as of `7255b59`, 2026-07-22, ~73% complete)

Both worktrees were retired from their fully-merged branches and reassigned + renamed this session
(`git worktree move`) — node_modules and graphify-out carried over untouched and were re-verified healthy
(`npm run type-check` clean in both) after the rename. graphify-out/ is refreshed and current through the
T-042 merge. Use `graphify explain`/`query`/`path` before Glob/Grep sweeps in both. **Phase 3 is fully
closed; T-041 and T-042 (Phase 4) are both merged** — this is Phase 4's second round.

### Next for Codex (Worker C) — T-040, same worktree, new branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-030/T-031/T-032/T-034/T-042 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-ui-truthfulness   (branch task/ui-truthfulness)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci. If a gate fails with
a real MODULE_NOT_FOUND for a package you didn't touch, stop and ask before reinstalling.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "PageSkeleton"
  graphify query "which company/admin pages swallow fetch errors silently today?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-040 — UI truthfulness + form guards (MASTER_PLAN.md, Phase 4).
Read AGENTS.md fully first. Read only the T-040 section of MASTER_PLAN.md and your row in TODO.md.

Owns: src/app/company/{dashboard,calls,pipeline,jobs,calendar*,library,settings}/page.tsx (*calendar:
error-state only — the rollback logic itself already landed in T-030, don't touch it); src/app/admin/
{businesses,usage,invoices,onboarding}/page.tsx; src/app/admin/businesses/[businessId]/config/page.tsx.
No file overlap with T-043 (Deepseek, running in parallel — an API route + notify.ts, no page.tsx) —
verified.

Key acceptance points: replace every silent `.catch(console.error)`/swallowed-fetch pattern across this
page list with explicit loading/error/empty states that are visibly distinct — "failed to load" must never
render as if it were "no data yet". Use the existing `PageSkeleton` component and `.button`/design-token
system already in the codebase — no new toast library; one small shared error-banner component is allowed
if you need it, but keep it minimal and reuse it across both the company and admin pages rather than
building two. Error banners need `role="alert"`; validation errors need proper focus management; never put
PII in error text. Fix invoice save→send sequencing: saving and sending must be two distinct, explicit
actions — no send-on-stale-state, and a double-click must not fire two sends. Add required-field/format
validation (email, phone, client name) on invoice/settings/onboarding/config forms. Add a dirty-form
navigation warning on the invoice, onboarding, and config forms specifically. Test with an injected fetch
failure on at least one page of each pattern (list page, invoice flow) to prove it never renders a false
empty-success state — that's the acceptance criterion, not just visual polish.

No visual redesign, no pagination, no search (those are explicitly deferred elsewhere — don't add them).
Gates green (type-check/lint/test; build once), append evidence to docs/IMPLEMENTATION_LOG.md, set your
TODO.md row to review. This is a big page list — multiple commits are fine (one focused commit per
route-group or pattern is reasonable, doesn't need to be a single T-040 commit), just keep each commit's
scope clear. Never push, merge, or touch main. If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md,
and give me the stuck-summary block.
```

### Next for Deepseek (Worker D) — T-043, same worktree, new branch

```
You are Worker D for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-033/T-035/T-041 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-tenant-email   (branch task/tenant-email)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
This exact mistake has happened before on this worktree. Re-check before your commit too.
node_modules is a directory junction to the main worktree's — do NOT run npm install, npm ci, or delete
node_modules. If something genuinely looks missing, run `npm run type-check` first to confirm before
touching node_modules at all.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "src/app/api/admin/businesses/route.ts"
  graphify query "how does business/tenant creation work and what does it return to the caller today?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-043 — Owner-facing tenant-creation email (MASTER_PLAN.md, Phase 4). This is an owner-requested
addition (not from the original CIB audit) — see MASTER_PLAN.md's T-043 section for the full spec.
Read AGENTS.md fully first. Read only the T-043 section of MASTER_PLAN.md and your row in TODO.md.

Owns: email-dispatch addition in src/app/api/admin/businesses/route.ts (POST handler only — do not touch
the config PUT route or provision-login route); a new template in src/lib/notify.ts. No file overlap with
T-040 (Codex, running in parallel) — verified.

IMPORTANT — this spec was written before T-041 existed: use the comms service you just built
(src/lib/comms/send.ts's sendEmail/sendWithLedger) instead of direct Resend — do NOT reintroduce a raw
Resend call. Key acceptance points: when a business is created with a valid ownerEmail, send exactly one
branded no-reply@luxordev.com email containing a working password-reset link — generate it via
`admin.auth().generatePasswordResetLink()` (firebase-admin, already a dependency, not currently used
anywhere in the repo — verify that's still true) — never a plaintext password in the email body, a log
line, or an error message. Subject line clearly prefixed for inbox filtering, e.g. "[Luxor AI] Your account
is ready". If Resend/RESEND_FROM report not_configured (via the comms service), the API response must say
so explicitly — never silently skip and claim success. Missing/invalid ownerEmail: skip the send, note it
in the response, don't fail the business-creation transaction. A send failure must not roll back the
Firestore business-creation transaction either — creation succeeds even if the welcome email doesn't send.

Do NOT build a tenant-removal/DELETE endpoint — that's tracked separately as NH-12 (a new destructive
capability needing its own scoped task, not bundled into this one). Do NOT touch the existing
`tempPassword` value returned in the POST response for the superadmin UI — that's separate from the new
email and out of scope here unless the spec says otherwise.

One commit (T-043: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main. If blocked
>20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the stuck-summary block.
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
