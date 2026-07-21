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
2. Read AGENTS.md fully — you are bound by it (roles, protected context, definition of done,
   stuck protocol, known hiccups).
3. Read your task specs in MASTER_PLAN.md (only your task IDs) and your row in TODO.md.
4. Implement each task: code + tests, owned files only, one commit per task
   (`T-0XX: <summary>`), gates green (type-check, lint, test; build once per batch).
5. Append evidence to docs/IMPLEMENTATION_LOG.md, set your TODO.md row to `review`.

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
| C | `D:\Apps\air-wt-scheduling-integrity` | `task/scheduling-integrity` | T-030 (merged), T-031 (merged) → **T-032 next, same worktree** |
| D | `D:\Apps\air-wt-demo-isolation` | `task/demo-isolation` | T-035 — not started, worktree ready (node_modules junctioned, graphify-out current) |

---

## PENDING — next assignments, ready to paste (as of 789d92f, 2026-07-20, 45% complete)

Both worktrees are pre-provisioned: node_modules is ready (Codex's own install / Deepseek's junction
to main's node_modules — do NOT run npm install in either), and graphify-out/ is refreshed and current
through T-031 (AST-only refresh, 0 LLM tokens; see SESSION_HANDOFF.md for what that means for a future
`--update`). Use `graphify explain`/`query`/`path` before Glob/Grep sweeps in both.

### Next for Codex (Worker C) — T-032, same worktree/branch

```
You are Worker C for the AI Receptionist release plan, continuing in your existing worktree.

Work ONLY inside: D:\Apps\air-wt-scheduling-integrity   (branch task/scheduling-integrity)
This worktree already has a working node_modules from your T-030/T-031 work — do NOT run npm
install/npm ci. If a gate fails with a real MODULE_NOT_FOUND for a package you didn't touch, stop
and ask before reinstalling; this repo's installs are slow enough on Windows to blow past a shell
timeout, and re-running them has already cost a full session this cycle.

Before grepping around the codebase, use the graphify graph already in your worktree
(graphify-out/, refreshed and current through your own T-031 merge) — free, already built, saves
tokens vs. broad Glob/Grep sweeps:
  graphify explain "createLead"
  graphify query "how do the cron routes authenticate?"
  graphify path "requireCronAuth" "createLead"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-032 — Cron correctness + callback state machine (MASTER_PLAN.md, Phase 3).
Read AGENTS.md fully first if you haven't already this session. Read only the T-032 section of
MASTER_PLAN.md and your row in TODO.md.

Owns: src/app/api/cron/** (follow-up-calls, daily-call-summary, faq-suggestions); vercel.json;
createLead callback-state initialization in src/lib/tools/agentTools.ts. Next in the agentTools.ts
serialization chain (T-011 → T-030 → T-031 → T-032) — safe to proceed, T-031 is merged.

Key acceptance points: all three cron routes use requireCronAuth (401 before any model/provider
call or write); leads get explicit callbackState: "pending"|"none", callbackDueAt, and a consent
field at creation; follow-up selection queries only due, consented leads and claims each atomically
via the T-021 ledger (exactly one attempt per invocation, no duplicates on overlapping cron runs);
a business without callbackDelayMinutes is skipped, not defaulted; existing leads default to
consent:false (NH-9 is an owner decision, not yours to override). vercel.json schedule
names/config get corrected, but scheduling daily-call-summary/faq-suggestions is NH-6 (owner
decision) — just make them secure/correct when invoked.

One commit (T-032: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main.
If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and give me the stuck-summary block.
```

### Next for Deepseek (Worker D) — T-035, ready worktree

```
You are Worker D for the AI Receptionist release plan.

Work ONLY inside: D:\Apps\air-wt-demo-isolation   (branch task/demo-isolation)
node_modules is already set up as a directory junction to the main worktree's node_modules
(package.json is unchanged, so this is safe and instant) — verified working via type-check/lint/test
already. Do NOT run npm install, npm ci, or delete node_modules — doing so destroys the junction and
puts you back into a real install, the exact problem that ate a full session here already. If
something genuinely looks missing, run `npm run type-check` first to confirm before touching
node_modules at all.

Before grepping around the codebase, use the graphify graph already in your worktree
(graphify-out/, refreshed and current) — free, already built, saves tokens vs. broad Glob/Grep:
  graphify explain "demo-customize"   (or the exact route/function name once you find it)
  graphify query "how does the demo reset endpoint work?"
Do NOT run `/graphify` or any rebuild/--update — the graph is already fresh.

Your task: T-035 — Demo/production isolation guards (MASTER_PLAN.md, Phase 3).
Read AGENTS.md fully first. Read only the T-035 section of MASTER_PLAN.md and your row in TODO.md.

Owns: src/app/api/admin/demo-customize/route.ts; src/lib/verticals/demoSeed.ts (isDemo marker);
src/app/admin/demo/page.tsx (confirm field); the seed script's marker line. Zero file overlap with
Codex's T-030/T-031/T-032 work — fully parallel-safe.

Implement D-2: the destructive reset must (a) hard-refuse any businessId !== 'demo-roofing' via an
explicit allowlist constant (code, not config), (b) refuse when the target doc lacks an isDemo:true
marker added by the seed script, (c) take a JSON backup export of deleted collections before delete,
(d) serialize concurrent resets via a transactional lock doc, (e) require an explicit confirm:"RESET"
body field sent by the UI. Superadmin gate stays in place.

One commit (T-035: <summary>), gates green (type-check/lint/test; build once), append evidence to
docs/IMPLEMENTATION_LOG.md, set your TODO.md row to review. Never push, merge, or touch main, or
files outside your owned scope. If blocked >20 min: commit WIP, log HELP-NEEDED in TODO.md, and
give me the stuck-summary block.
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
