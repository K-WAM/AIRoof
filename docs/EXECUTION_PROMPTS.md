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

## PENDING — next assignments, ready to paste (as of `26c0352`, 2026-07-24, ~85% complete)

Phase 4 is fully closed (6/6). Phase 5 (T-050/T-051/T-052) is a **strict serial chain** per MASTER_PLAN's own
Deps lines (T-051 needs "T-050 green," T-052 needs "Phase 5 others") — only T-050 is assignable this round.
Worker C's worktree was retired from its fully-merged `task/icon-sweep` branch and reassigned + renamed
(`git worktree move`) — node_modules and graphify-out carried over, `npm run type-check` verified clean after
the rename. Worker D has no parallel-safe task this round; `air-wt-feedback-form` stays idle until T-050
merges and unblocks T-051.

### Next for Codex (Worker C) — T-050, same worktree, new branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree (now on a
fresh branch — your T-030/T-031/T-032/T-034/T-042/T-040/T-045 work is all merged and done).

Work ONLY inside: D:\Apps\air-wt-release-suite   (branch task/release-suite)
BEFORE YOUR FIRST EDIT, run `git rev-parse --show-toplevel` and `git branch --show-current` and confirm
both exactly match the path and branch above — not the main repo (D:\Apps\AI Receptionist, branch main).
Workers have previously edited the main repo by mistake this way. Re-check before your commit too.
This worktree already has a working node_modules — do NOT run npm install/npm ci.

This task is narrow and file-specific enough that graphify is unlikely to pay off — use Glob/Grep directly
on the file paths below instead of invoking the skill.

Your task: T-050 — Deterministic release suite + merge gating (MASTER_PLAN.md, Phase 5, CIB-015).
Read AGENTS.md fully first. Read only the T-050 section of MASTER_PLAN.md and your row in TODO.md.

Owns: new `tests/release/**`; `.github/workflows/ci.yml` (extend, don't replace — it already runs
type-check/lint/build/`npm test` on push+PR to main via `actions/checkout` + `actions/setup-node`).

**Important existing-file note, checked this session:** `vitest.config.ts`'s `test.include` is currently
`["src/**/*.test.ts", "src/**/*.test.tsx"]` — a new `tests/release/**` directory will NOT be picked up by
the existing `npm test` step automatically. `vitest.config.ts` is NOT in your owned scope, so don't edit it
silently; instead add a distinct CI step (e.g. `npx vitest run tests/release`) to `ci.yml` alongside the
existing `npm test` step. If you conclude editing `vitest.config.ts`'s include pattern is genuinely the
better design, stop and flag it as a HELP-NEEDED question rather than silently expanding your owned-file
scope.

Build a small, deterministic (mocked providers, no live network) route-handler-level suite covering:
- **Webhook auth/replay** — `src/app/api/webhooks/vapi/route.ts` + `src/lib/vapi/verify.ts`. Existing unit
  coverage is in `src/lib/vapi/__tests__/` (route-auth, verify, escalation-branch, appointment-identity) —
  your suite should exercise these at the route-handler level (real request → real handler → asserted
  response), not duplicate the existing unit tests.
- **Cron auth** — `src/lib/auth/cronGuard.ts` guards `src/app/api/cron/{daily-call-summary,faq-suggestions,
  follow-up-calls,retention}/route.ts`. Confirm each route 401s without a valid `CRON_SECRET` bearer token.
- **Duplicate side effects** — `src/lib/ops/ledger.ts` (T-021's transactional claim/dedupe primitive) backs
  idempotent sends/bookings; prove a simulated duplicate webhook/cron invocation doesn't double-send or
  double-book.
- **Calendar failure rollback** — T-030's transactional booking/conflict-check logic in `agentTools.ts`
  (`bookAppointment`/`checkAvailability`); prove a failed write doesn't leave a partial/inconsistent state.
- **Provider-key readiness** — `src/lib/ai/registry.ts`'s `isProviderReady()` gate; prove routes correctly
  report "not configured" rather than crashing or silently mocking when a provider key is absent.

Mock Firestore/Vapi/Resend/OpenAI/DeepSeek at existing seams (see AGENTS.md's Test expectations section) —
no live providers in CI, ever. Document your flaky-test quarantine policy (this repo has a known
concurrent-load timeout pattern in a couple of files — see AGENTS.md's "Known hiccups" — decide/document how
your new suite avoids or tolerates that class of flake). Also produce the branch-protection setup doc for
the owner (NH-2 in TODO.md: "require CI green" on `main`) — a short doc section is enough, you cannot change
GitHub repo settings yourself.

Prohibited: a browser-automation e2e farm (explicitly out of scope, post-MVP — this is route-handler level
only, not Playwright).

One commit (T-050: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main. If blocked
>20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the stuck-summary block.
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
