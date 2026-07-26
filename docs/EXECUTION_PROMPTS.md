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
| C | `D:\Apps\air-wt-release-suite` (was `air-wt-icon-sweep`, `air-wt-ui-truthfulness`, `air-wt-pii-retention`, `air-wt-field-tokens`, `air-wt-scheduling-integrity`) | `task/release-suite` | T-030/T-031/T-032/T-034/T-042/T-040/T-045 (all merged) → **T-050 next, same worktree, new branch** |
| D | `D:\Apps\air-wt-feedback-form` (was `air-wt-tenant-email`, `air-wt-unified-comms`, `air-wt-ai-input-hardening`, `air-wt-demo-isolation`) | `task/feedback-form` | T-033/T-035/T-041/T-043/T-044 (all merged) → **idle, no parallel-safe task until T-050 merges** |

---

## PENDING — next assignments, ready to paste (as of `5ef8270`, 2026-07-25, ~95% complete)

Phase 4 is fully closed (6/6). T-050 and T-051 both merged this session (`17e1982`, `fe22fba`) — Phase 5 is
now 2/3 done. T-052 is the only assignable task this round, and the last Phase 5 task — Phase 6 stays
owner-deferred until it merges (2026-07-23 decision). Worker D's idle `air-wt-feedback-form` worktree had gone
17 commits stale on its old `task/feedback-form` branch (still at its T-044 merge point), so a fresh
`task/doc-reconciliation` branch was cut off `main`'s current tip in the same worktree directory
(`git checkout -b`, no `git worktree move` needed); `graphify-out/` refreshed, `npm run type-check` verified
clean. Worker C's `air-wt-cleanup-sweep` stays idle — T-052 is docs-only, no code-rigor task fits it this round.

### Next for Deepseek (Worker D) — T-052, same worktree, new branch

```
You are Worker D for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-033/T-035/T-041/T-043/T-044 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-feedback-form   (branch task/doc-reconciliation)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci.

Your task: T-052 — Documentation reconciliation (MASTER_PLAN.md, Phase 5, CIB planning-engineer instruction
§3). Read AGENTS.md fully first. Read only the T-052 section of MASTER_PLAN.md and your row in TODO.md.

Owns: docs only — `CLAUDE.md`, `HANDOFF.md`, `.env.example`, `public/guides/onboarding-guide.html` (per its
own update rule at the top of that file). **`docs/SESSION_HANDOFF.md` is integrator-owned and read-only for
you** — it's rewritten every merge round in this session; if you notice it's stale, note it in your commit
message or IMPLEMENTATION_LOG entry instead of editing it, and the integrator will reconcile it at merge time.

Goal: make every doc match shipped reality. Concretely:
- `CLAUDE.md` still describes some pre-T-010 assumptions as current (e.g. anything implying
  `VAPI_AUTH_BYPASS` is a permanent/correct posture) — mark those superseded (say what changed and which
  task changed it) rather than deleting the history of why they existed.
- Cross-check `CLAUDE.md`/`HANDOFF.md` against what's actually merged on `main` right now: Phases 0-5 (T-050,
  T-051 both merged this session — see TODO.md), the T-051 removals (dead `isAfterHoursNow` wrapper, the
  deduped `NotificationDeliveryState` type, pruned Twilio/Google-Calendar `.env.example` entries), and confirm
  no doc still instructs a practice a merged task removed (T-052's actual acceptance test).
- `.env.example` should already be accurate after T-051's pass — spot-check it against `src/lib/config/env.ts`
  rather than assuming; add anything genuinely missing, don't re-add what T-051 removed with evidence.
- `public/guides/onboarding-guide.html`: check it against its own stated update triggers (demo phone number,
  portal URL, superadmin login, onboarding form steps, Vapi setup steps, phone provisioning, client login
  provisioning, key stats/ROI numbers) — update only what's actually stale, don't rewrite prose that's still
  correct.
- Refresh graphify for the doc changes (`/graphify . --update` — incremental only, this is a docs-only task
  and a full rebuild has no payoff at this scope).

Hard constraints: no code changes of any kind (this task is prohibited from touching anything under `src/`,
`tests/`, or config files other than `.env.example`); don't invent facts not evidenced in the repo (e.g. no
website/social URLs — NH-10 is still open, nothing invented); don't delete history, mark it superseded instead.

One commit (or a small number, by doc), gates N/A for pure docs but still run `npm run type-check` once at the
end to confirm nothing broke, append evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review.
Never push, merge, or touch main. If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the
stuck-summary block.
```

Worker D (Deepseek) has no assignment this round — do not provision new work for `air-wt-feedback-form`
until T-050 merges and unblocks T-051.

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
