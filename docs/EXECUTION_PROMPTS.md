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
| C | `D:\Apps\air-wt-ux-resilience` (was `air-wt-cleanup-sweep`, `air-wt-release-suite`, `air-wt-icon-sweep`, `air-wt-ui-truthfulness`, `air-wt-pii-retention`, `air-wt-field-tokens`, `air-wt-scheduling-integrity`) | `task/ux-resilience` | T-030/T-031/T-032/T-034/T-042/T-040/T-045/T-050/T-051 (all merged) → **T-047 + T-048 next, new worktree/branch** |
| D | `D:\Apps\air-wt-demo-polish` (was `air-wt-feedback-form`, `air-wt-tenant-email`, `air-wt-unified-comms`, `air-wt-ai-input-hardening`, `air-wt-demo-isolation`) | `task/demo-polish` | T-033/T-035/T-041/T-043/T-044/T-052 (all merged) → **T-046 + T-049 next, new worktree/branch** |

---

## PENDING — next assignments, ready to paste (as of `897bcc5`, 2026-07-25, Phase 6 kickoff)

Phases 0-5 are all fully merged (100% of the CIB-audit-derived scope) and pushed to `origin/main`
(`86aaf96..897bcc5`). Phase 6 (T-046-049, owner-added UX/demo polish, not CIB-weighted) is now assignable
per the 2026-07-23 owner decision ("finish Phase 5 first" — satisfied). All four Phase 6 tasks have zero
file overlap with each other (verified against MASTER_PLAN.md's owns-lists), so both idle worktrees were
each given two tasks this round instead of one, to use the full parallel-safe window MASTER_PLAN allows.

Both worktrees were renamed off their fully-merged Phase 5 branches and recut fresh off `main`'s current
tip (`git worktree move` + `git checkout -b`, no stale-branch resume): `air-wt-cleanup-sweep` →
`air-wt-ux-resilience` (branch `task/ux-resilience`), `air-wt-feedback-form` → `air-wt-demo-polish` (branch
`task/demo-polish`). `graphify-out/` refreshed in both from the freshly-updated main-repo graph (1596 nodes,
2466 edges, 171 communities); `npm run type-check` reverified clean in both (node_modules junctions intact,
no `npm install` needed).

**Routing rationale:** T-047 (nav/workflow friction audit + onboarding-wizard→stepper conversion) continues
Codex's broad-page-sweep track from T-040/T-045; T-048's fixture-driven accuracy-comparison requirement
(model right-sizing must ship with before/after evidence or explicitly not ship) matches the same
evidentiary discipline Codex proved out on T-051's removal-with-proof sweep — both routed to Codex in
`air-wt-ux-resilience`. T-046 (demo seed richness) continues Deepseek's `demoSeed.ts` continuity from T-035;
T-049 (email subject-line convention) extends the comms/branding track Deepseek already owns from
T-041/T-043/T-044 — both routed to Deepseek in `air-wt-demo-polish`. No file overlap between any of the four
(confirmed against MASTER_PLAN's owns-lists) — all four are safe to run fully in parallel.

### Next for Codex (Worker C) — T-047 + T-048, new worktree/branch

```
You are Worker C for the AI Receptionist release plan, continuing in a freshly reassigned worktree (your
T-030/031/032/034/040/042/045/050/051 work is all merged and done — Phase 6 is new scope, not CIB-weighted).

Work ONLY inside: D:\Apps\air-wt-ux-resilience   (branch task/ux-resilience, cut fresh off main's current tip)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules (junctioned) and a fresh graphify-out/ — do NOT run
npm install/npm ci, and don't rebuild graphify from scratch (query/explain it directly).

Your tasks: T-047, T-048 (MASTER_PLAN.md, Phase 6). Read AGENTS.md fully first. Read only the T-047/T-048
sections of MASTER_PLAN.md and your row in TODO.md. Do them in either order — zero file overlap between them.

**T-047 — Navigation/workflow friction pass + surfaced tutorial**
Owns: `src/app/company/layout.tsx` (nav), `src/app/company/company-nav.tsx`, `src/app/admin/onboarding/page.tsx`
(stepper conversion), a new small first-login nudge component linking to `/company/guide`.
- Audit click-path friction for the 5 flows: create job, schedule, send invoice, add crew, view call
  (owner/staff/superadmin/field-worker roles) — document click-count before/after.
- Surface `/company/guide` to brand-new users via a one-time nudge (session/localStorage-dismissed — a
  returning user must not see it again).
- Convert the admin onboarding wizard into a real stepper (progress indicator, back/next, no orphaned
  steps) — this is polishing the existing admin-driven flow, NOT public self-serve signup (explicitly
  out of scope, owner decision 2026-07-23). Keep the wizard's existing submit payload/contract — no backend
  change.
- Constraints: no visual redesign beyond nav/stepper ergonomics (one-teal system, `.button` variants); do
  not touch `MODULE_ROUTES` gating logic itself, only ergonomics around it; audit mobile hamburger nav too,
  not just desktop; must not regress T-040's truthful loading/error states.
- Tests: Playwright click-path recording for 2-3 representative flows before/after; existing gates
  (type-check/lint/build).

**T-048 — Voice-note field resilience + AI model right-sizing**
Owns: `src/hooks/useFieldAudio.ts` (retry logic only), `src/lib/ai/registry.ts` (the single
`parse-field-update` model line), new fixture-driven accuracy-comparison tests.
- `useFieldAudio.ts:158-164` drops the recorded blob on any fetch failure with no retry. Add ONE bounded
  automatic retry (same blob, one re-POST) before surfacing an honest error. This is NOT a persistent
  offline queue (that stays deferred per TODO.md) — in-memory/same-session only, no retry across a page
  reload.
- `registry.ts`'s `parse-field-update` capability is still on full `gpt-4o` — the one unreviewed holdout from
  T-033's model-routing pass. Right-size it to a cheaper model ONLY if a fixture-driven accuracy comparison
  (against `src/lib/schemas/__tests__/fixtures/adversarial.ts` plus real anonymized field-note transcripts)
  shows no regression. If it regresses, leave it on `gpt-4o` and log that as a documented finding, not a
  blocker — do not force the swap.
- Do NOT touch the correction-confirm-card UX or the Whisper vocabulary-bias prompt — both protected/working.
- Tests: unit test for the retry path (mocked fetch: fail-then-succeed, fail-then-fail); fixture comparison
  script output recorded in docs/IMPLEMENTATION_LOG.md with before/after cost + accuracy numbers.

Hard rules: never push, merge, touch main, other branches, or files outside your owned scope. Never weaken
auth, add bypasses, placeholder secrets, or mock fallbacks reachable in production. If you need a missing
API key or console action, record it under NEEDS-HUMAN in TODO.md and say so.
One commit per task (`T-047: ...`, `T-048: ...`), gates green (type-check, lint, test; build once for the
batch), append evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to `review`.
If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, and end your reply with:
"Paste this to Fable: Worker on task/ux-resilience is stuck on T-0XX: <question>."
```

### Next for Deepseek (Worker D) — T-046 + T-049, new worktree/branch

```
You are Worker D for the AI Receptionist release plan, continuing in a freshly reassigned worktree (your
T-033/035/041/043/044/052 work is all merged and done — Phase 6 is new scope, not CIB-weighted).

Work ONLY inside: D:\Apps\air-wt-demo-polish   (branch task/demo-polish, cut fresh off main's current tip)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules (junctioned) and a fresh graphify-out/ — do NOT run
npm install/npm ci, and don't rebuild graphify from scratch (query/explain it directly).

Your tasks: T-046, T-049 (MASTER_PLAN.md, Phase 6). Read AGENTS.md fully first. Read only the T-046/T-049
sections of MASTER_PLAN.md and your row in TODO.md. Do them in either order — zero file overlap between them.

**T-046 — Demo Studio richness + parity audit**
Owns: `src/lib/verticals/demoSeed.ts` (`RESOURCES` + jobs/appointments builders only); a throwaway
(not committed) per-vertical verification script.
- Reseed each of the 7 verticals with ~5-6 resources and ~12-18 jobs/bookings (up from today's 3/3), mixed
  states (some confirmed solid, 2-3 provisional/grey-dashed, 2-3 left unscheduled/unassigned to drag live),
  varied job-stepper status (inspection/quoted/in_progress/invoiced) so Jobs + Dashboard don't read as one
  flat list.
- Real per-industry names, not filler (see HANDOFF.md's 2026-07-15 backlog entry for the exact per-vertical
  roster: Roofing crews Carlos/Tyler/Storm Response; HVAC named techs + on-call; Dental 2-3 dentists +
  hygienists; Cleaning Team A/B/C; GC trade crews; Property Mgmt vendors + on-call manager).
- Keep `jobCounter` advancing past seeded IDs (re-verify the 2026-07-15 collision fix still holds at higher
  volume) and keep at least one after-hours `pendingConfirmation` booking with an email (Dashboard approval
  demo depends on it).
- Parity audit: confirm `/admin/demo`'s launch leads into the exact same `/company/*`/`/admin/*` pages a real
  tenant uses — no demo-only mock component anywhere. Playwright walk-through of 3 representative verticals
  (Dashboard/Calls/Pipeline/Jobs/Calendar/Library/Guide).
- Constraints: don't touch `calendarMode`/`vocab`/`disabledModules` semantics (protected, `templates.ts`
  untouched); stay within one Firestore batch write per launch (Spark-plan budget).
- Tests: throwaway per-vertical seed script (rows > 0, draggable > 0, states varied); Playwright smoke pass
  across 3 verticals recorded in docs/IMPLEMENTATION_LOG.md.

**T-049 — Outbound email consistency + branding pass**
Owns: subject-line strings only in `src/lib/notify.ts`,
`src/app/api/appointments/send-confirmation/route.ts`,
`src/app/api/admin/invoices/[invoiceId]/send/route.ts`,
`src/app/api/jobs/[jobId]/{invoice,report}/send/route.ts`.
- Standardize every outbound email subject onto one documented convention (`[Category] Specific detail`,
  consistent capitalization/dash style) extending the `[Category]` pattern T-043/T-044 already established.
- Tenant-facing templates already correctly use the tenant's own `logoUrl` (`agentTools.ts:853-859`) — do NOT
  touch that, it's protected. Only Luxor-authored system emails (welcome, feedback) carry the Luxor mark —
  that's also already correct, don't change it.
- Subject-line strings only — no email body/template redesign, no send-logic changes (T-041's delivery-status
  contract untouched).
- Document the convention in a new `docs/EMAIL-CONVENTIONS.md`.
- Tests: extend T-041's existing mocked-Resend unit tests with subject-format assertions per call site — do
  not rewrite them.

Hard rules: never push, merge, touch main, other branches, or files outside your owned scope. Never weaken
auth, add bypasses, placeholder secrets, or mock fallbacks reachable in production. If you need a missing
API key or console action, record it under NEEDS-HUMAN in TODO.md and say so.
One commit per task (`T-046: ...`, `T-049: ...`), gates green (type-check, lint, test; build once for the
batch), append evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to `review`.
If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, and end your reply with:
"Paste this to Fable: Worker on task/demo-polish is stuck on T-0XX: <question>."
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
You are the INTEGRATOR (orchestrator) for this repo. Read, in order: AGENTS.md (rules — protected context,
cleanup rules, known hiccups), docs/SESSION_HANDOFF.md (exact current state), TODO.md (live queue, active
worktree assignments, NEEDS-HUMAN). Do NOT re-read MASTER_PLAN.md end-to-end, consolidated_implementation_
brief.md, or HANDOFF.md — those are stable background the plan docs already distilled; only pull the specific
MASTER_PLAN.md task section(s) you're actively reviewing, when you need it.

I will paste you completion reports from worker agents (Claude/Codex/Deepseek) as they finish their assigned
task in their own worktree. For each: verify independently in that worktree (git diff vs main, re-run
type-check/lint/test/build yourself — don't trust the self-report), check the diff against MASTER_PLAN.md's
acceptance criteria for that task ID and against owned-scope, fix only trivial unambiguous defects yourself,
then merge into local main (git merge --no-ff, resolve TODO.md/IMPLEMENTATION_LOG.md conflicts by keeping
both sides). After merging, run the combined gate on main once. Update TODO.md's phase table/checklist and
docs/SESSION_HANDOFF.md to match, then provision the next task for that worker (rename worktree + new branch
off main via `git worktree move` + `git checkout -b`, copy graphify-out/, verify type-check clean) and give
me a ready-to-paste prompt for it in the same style as docs/EXECUTION_PROMPTS.md's existing PENDING entries.

Nothing is pushed until I say "approve push". Don't ask me clarifying questions about process — the pattern
above is already established this session; just execute it and report back concisely (gate results + verdict
+ next prompt), not a full narration of every command.
```
