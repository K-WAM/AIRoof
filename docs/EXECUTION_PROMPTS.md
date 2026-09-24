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

## PENDING — moved

Current assignments and paste-ready prompts live in **`docs/WORKER_QUEUE.md`** (the July 2026 Phase-6 batch that used to be here is long finished; see git history).

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
