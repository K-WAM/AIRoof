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
| C | `D:\Apps\air-wt-icon-sweep` (was `air-wt-ui-truthfulness`, `air-wt-pii-retention`, `air-wt-field-tokens`, `air-wt-scheduling-integrity`) | `task/icon-sweep` | T-030/T-031/T-032/T-034/T-042/T-040 (all merged) → **T-045 next, same worktree, new branch** |
| D | `D:\Apps\air-wt-feedback-form` (was `air-wt-tenant-email`, `air-wt-unified-comms`, `air-wt-ai-input-hardening`, `air-wt-demo-isolation`) | `task/feedback-form` | T-033/T-035/T-041/T-043 (all merged) → **T-044 next, same worktree, new branch** |

---

## PENDING — next assignments, ready to paste (as of `3e51cd0`, 2026-07-23, ~78% complete)

Both worktrees were retired from their fully-merged T-040/T-043 branches and reassigned + renamed this round
(`git worktree move`) — node_modules and graphify-out carried over untouched and were re-verified healthy
(`npm run type-check` clean in both) after the rename. graphify-out/ is current through this session's merges
(the doc-only incremental refresh for TODO.md/HANDOFF.md/SESSION_HANDOFF.md/EXECUTION_PROMPTS.md changes did
not complete — a semantic-extraction subagent hit the 64K output-token cap — low priority since code hasn't
drifted from the graph, just 4 markdown files; re-run `/graphify . --update` next session if it matters).
Use `graphify explain`/`query`/`path` before Glob/Grep sweeps in both. **Phase 4 is down to T-044/T-045 —
last two tasks before Phase 5.**

### Next for Codex (Worker C) — T-045, same worktree, new branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-030/T-031/T-032/T-034/T-042/T-040 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-icon-sweep   (branch task/icon-sweep)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "company-nav.tsx"
  graphify query "which company/admin pages import lucide-react today and which don't?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh (as of this round's merge).

Your task: T-045 — Icon consistency sweep (MASTER_PLAN.md, Phase 4).
Read AGENTS.md fully first. Read only the T-045 section of MASTER_PLAN.md and your row in TODO.md.

Owns: icon imports/usages inside existing company/admin page files only (src/app/company/**,
src/app/admin/**) — no new components, no layout changes beyond adding an `<Icon />` where one is visibly
missing. `src/app/company/guide/page.tsx` and `company-nav.tsx` are the reference pattern (already
lucide-react) — you should not need to touch either of those two files since they already comply; if you do
find something missing in one of them, keep that specific diff minimal, since Worker D (T-044, parallel) is
adding one new nav link + icon to company-nav.tsx/admin-nav.tsx this same round — small shared-file risk,
no functional overlap expected.

Key acceptance points: every company/admin page's primary actions/nav rows/section headers use a
lucide-react icon; this is a coverage pass, not a restyle — don't change any icon choice that's already
lucide-react, don't introduce a new icon set. Respect `useBusinessModules()`/vocab rules for any icon tied to
an industry-specific noun (job/crew/appointment language varies per vertical — see CLAUDE.md's
Industry-Applicability Rule). Spot-check 2–3 representative pages with a before/after Playwright screenshot
to confirm no visual regression in existing icon usage.

No visual redesign, no new dependencies, no touching non-icon markup. Gates green (type-check/lint/test;
build once — icon-only changes shouldn't need new unit tests, existing gates are the acceptance bar), append
evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main. If
blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the stuck-summary block.
```

### Next for Deepseek (Worker D) — T-044, same worktree, new branch

```
You are Worker D for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-033/T-035/T-041/T-043 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-feedback-form   (branch task/feedback-form)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
This exact mistake has happened before on this worktree. Re-check before your commit too.
node_modules is a directory junction to the main worktree's — do NOT run npm install, npm ci, or delete
node_modules.

Before grepping around the codebase, use the graphify graph already in your worktree:
  graphify explain "src/lib/comms/send.ts"
  graphify query "how does the app send branded emails today and what conventions do T-043's welcome email
  and T-041's comms service already establish?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh (as of this round's merge).

Your task: T-044 — Self-serve feedback form → connect@luxordev.com (MASTER_PLAN.md, Phase 4). This is an
owner-requested addition (not from the original CIB audit) — see MASTER_PLAN.md's T-044 section for the
full spec. Read AGENTS.md fully first. Read only the T-044 section of MASTER_PLAN.md and your row in
TODO.md.

Owns: new src/app/api/feedback/route.ts; a small shared FeedbackForm component + one new nav entry point in
each of company-nav.tsx and admin-nav.tsx (use the lucide `MessageSquareText` icon, matching the pattern
those two files already use — don't restyle anything else in them); a new send function in
src/lib/notify.ts. Small shared-file risk on the two nav files with Worker C (T-045, icon sweep, parallel
this round) — keep your nav-link diff minimal and additive so it doesn't collide with their pass.

IMPORTANT — this spec was written before T-041 existed: T-041's comms service (src/lib/comms/send.ts) is
now merged — use its sendEmail (with ledger idempotency) directly, do NOT use a raw/direct Resend call and
do NOT add an interim workaround for T-041 not existing (it exists now). Follow the same subject-line
`[Category] ...` convention T-043's welcome email just established (e.g.
`[Feedback] <businessName> — <first ~40 chars of message>`).

Key acceptance points: authenticated users only (reuse the existing session/role guard pattern — no
anonymous public endpoint); the form is reachable from both company and admin nav; fields are message
(required, length-capped) + optional category, with name/email/businessId prefilled from the signed-in
session; submitting delivers exactly one branded email to connect@luxordev.com containing the submitter's
name/email/businessId so support can reply directly; rate-limit or single-submit-disable the button so a
double-click can't double-send (T-040's `runSingleFlight` pattern in
src/app/admin/invoices/invoiceFlow.ts is a good reference for this, though you don't need that exact file).
If Resend/RESEND_FROM report not_configured, the form must show a clear "feedback couldn't be sent" error —
never a false success toast. Empty message rejected both client- and server-side.

Do NOT build a public/unauthenticated feedback endpoint or a general-purpose support-ticket system — this is
scoped to one form, one recipient, one email.

One commit (T-044: <summary>), gates green (type-check/lint/test; build once), append evidence to
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
