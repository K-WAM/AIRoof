# AGENTS.md — Permanent execution and review rules

Applies to every agent (worker, reviewer, integrator) in this repository. Task specs live **only** in
`MASTER_PLAN.md`. Live state lives **only** in `TODO.md`. Prompts live in `docs/EXECUTION_PROMPTS.md`.

## Roles

- **Integrator (orchestrator session)** — the only agent that merges to `main`, resolves cross-branch conflicts,
  runs combined regression gates, and updates `TODO.md` assignments. Nothing is pushed or deployed until the
  owner says `approve push`.
- **Worker** — implements assigned task IDs inside its own worktree/branch. May commit locally.
  **Must not** push, merge, rebase onto other workers' branches, delete worktrees, modify `main`, or edit files
  outside its owned scope (owned files are listed per task in MASTER_PLAN.md and per batch in TODO.md).
- **Reviewer** — reads a worker branch diff against the task's acceptance criteria; produces findings; may fix
  only trivial, unambiguous defects (typos, missed import). Substantial deviations go back to the worker.

## Reading order (every new session)

1. `AGENTS.md` (this file) → 2. your task IDs in `MASTER_PLAN.md` → 3. `TODO.md` (state, blockers) →
4. `docs/SESSION_HANDOFF.md` → 5. only then code. Do **not** re-audit the repository; the consolidated brief
(`consolidated_implementation_brief.md`) and MASTER_PLAN are authoritative. Check `git log` only for changes
after the commit recorded in SESSION_HANDOFF.

## Protected context (never change without a task that says so)

- `businessId` tenant scoping; default-deny `firestore.rules`; central guards in `src/lib/auth/verifyRole.ts`.
- Manual send gates (reports, invoices, FAQ approvals); field-correction confirm/cancel semantics.
- Vapi tool names/contracts (extend parameters; never rename — the live assistant depends on them).
- One-teal design system (`var(--accent)`, `.button` variants); Industry-Applicability Rule (CLAUDE.md).
- Never weaken an auth guard, add a bypass, hardcode a placeholder secret, or add a mock fallback that could
  run in production. If a guard blocks you, that is a finding, not an obstacle.

## Definition of done (per task)

1. Code + tests implementing the task's acceptance criteria, inside owned files only.
2. `npm run type-check` && `npm run lint` && `npm test` green locally; `npm run build` green **once per batch**.
3. One focused commit per task: `T-0XX: <imperative summary>` + body listing acceptance evidence.
   End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.
4. Append an entry to `docs/IMPLEMENTATION_LOG.md` (task, commit, evidence, removals if any).
5. Update your batch row in `TODO.md` (status → `review`), nothing else in that file.

## Credentials and external services

- Company: Luxor Developments LLC · contact `connect@luxordev.com` · transactional sender
  `no-reply@luxordev.com` via Resend. No verified public website/socials on record — do not invent or cite any
  (tracked in TODO NEEDS-HUMAN).
- Before asking the owner for anything, check the CLIs yourself: `gh auth status`, `vercel whoami`,
  `firebase login:list`, `stripe config --list`, `firebase projects:list`. All four were authenticated as of
  2026-07-20.
- If a task genuinely needs a missing credential/console action, **stop that task**, record the *exact* missing
  item in `TODO.md` under `NEEDS-HUMAN`, and continue other owned work. Never fabricate provider output or mark
  a task complete without its credential-dependent verification.
- Stripe: sandbox only; anything live requires explicit owner approval first.

## Stuck protocol

If blocked > ~20 minutes on ambiguity, a failing environment, or a decision above your authority:
1. Commit WIP locally (`T-0XX WIP: <state>`).
2. Add a `HELP-NEEDED` entry in `TODO.md`: task ID, what you tried, the specific question.
3. End your reply with a ready-to-paste block for the owner:
   > **Paste this to Fable:** `Worker on <branch> is stuck on T-0XX: <one-sentence question>. See HELP-NEEDED in TODO.md.`
Do not guess on security-relevant decisions.

## Cleanup rules (applies mainly to T-051, and to incidental dead code)

Remove only with evidence: repo-wide grep (including string/dynamic references), tsc, lint, build, tests all
green after removal. Log every removal + rationale in `docs/IMPLEMENTATION_LOG.md`. Keep types that describe
live Firestore collections even if unreferenced in TS. Never mix cleanup commits with functional commits.

## Test expectations

- vitest (from T-000). Unit-test auth boundaries with **negative cases first** (missing/wrong/expired/replayed).
- No network in tests; mock Firestore/Vapi/Resend/OpenAI/DeepSeek at existing seams.
- Adversarial fixtures for anything crossing the AI trust boundary.
- If the harness isn't in your branch yet (T-000 unmerged), `npm install --no-save vitest` keeps
  `package.json` untouched (that file is owned by T-000).

## Known hiccups (living section — integrator appends as discovered)

- **Windows + two shells**: Bash tool is Git Bash (`/d/Apps/AI Receptionist`); PowerShell is primary. Quote all
  paths — the repo dir contains a space. Don't use PowerShell here-strings in the Bash tool.
- **Worktrees need `node_modules` before any gate runs, but prefer a junction over a fresh `npm install`.**
  If no active task touches `package.json`/`package-lock.json` (check TODO.md's owned-scope column — as of
  2026-07-20 only T-000 owns `package.json`), the integrator should provision a new worktree with
  `New-Item -ItemType Junction -Path "<worktree>\node_modules" -Target "<main-repo>\node_modules"` instead of
  `npm install`. This is instant, avoids the shared-npm-cache contention below entirely, and stays correct as
  long as the lockfile is identical — verify with a quick `npm run type-check` after junctioning. Only fall
  back to a real `npm install`/`npm ci` when the worktree's lockfile actually differs (rare; would itself be
  a review flag since package.json is single-owner). If a worker already has a broken/partial `node_modules`
  from a timed-out install, don't retry the install — delete it and junction instead:
  `Remove-Item -Recurse -Force node_modules; New-Item -ItemType Junction -Path node_modules -Target "<main-repo>\node_modules"`.
- **A worker's shell/tool timeout (commonly 120s) is very often shorter than this repo's `npm install`/`npm ci`
  takes on Windows** (large `node_modules`, antivirus real-time scanning of newly-written files). A command
  that times out is not necessarily hung — retrying the *same* synchronous foreground install repeatedly can
  loop forever without ever finishing. If a worker must run a real install (lockfile actually changed), use a
  background/async run or an explicitly larger timeout, not a retry loop. Don't chase "stuck node process"
  theories from `Get-Process node` on this machine without checking each process's command line first —
  unrelated MCP server processes (Playwright MCP, etc.) are normal background noise here and are not npm.
- **`vercel` CLI is authenticated but the repo is NOT linked** — run
  `vercel link --project prj_Z7wLkNHfQUm8JsnDAWrfuOHPOmy2 --yes` once per machine before `vercel env ls`.
  `.vercel/` is gitignored; never commit it.
- **Seed script**: `node scripts/seed-demo-business.mjs` — never `ts-node` (moduleResolution: bundler breaks it).
- **graphify**: query-only CLI (`graphify query|path|explain ...`); there is **no** `build`/`auto-update`
  subcommand — rebuilds go through the `/graphify` skill. Its Python is the uv tool interpreter recorded in
  `graphify-out/.graphify_python`. `graphify-out/` is gitignored (per-machine).
- **`npm run lint`** works (flat config, 0 errors / 26 warnings baseline). Don't introduce new errors; warnings
  are backlog, not license.
- **Vapi webhook secret**: production Vapi sends the dashboard-configured secret header. Until NH-1/NH-2 are
  done, deploying T-010 would break live calls — the deploy gate is tracked in TODO, not a reason to soften T-010.
- **Firestore emulator** isn't set up; prefer transactional mocks, or add emulator config under `src/test-utils/`
  (owned by T-000) if genuinely needed.
- **graphify skill can lag the package** (warning: "skill is from graphify 0.9.12, package is 0.9.16") —
  fix with `graphify install`. Done 2026-07-20; if the warning reappears after a package update, rerun it.
- **`graphify-out/` is gitignored, so a fresh worktree never has one.** A worker that invokes the
  `/graphify` skill in a brand-new worktree triggers a full LLM-extraction rebuild of the entire corpus —
  real token spend, not a cache hit, and easy to trigger repeatedly by accident (once per task, once per
  lookup) since the skill has no way to know a perfectly good graph already exists one directory up.
  **Before assigning any worktree, the integrator copies the main worktree's `graphify-out/` into it**
  (`cp -r "<main-repo>/graphify-out" .`) — it's just files, no git involved, and it makes every
  `graphify query|explain|path` command work immediately with zero rebuild cost. If a worker finds itself
  in a worktree without one, it should **ask before rebuilding** — 9 times out of 10 the fix is "copy it
  from the main worktree," not "generate a new one." For a narrow 1–3 file task, skip graphify entirely —
  Glob/Grep/Read is enough and a full rebuild has no payoff at that scope. `--update` (incremental,
  cheap) is fine once a graph is present; a full rebuild from nothing almost never is, mid-task.
- **Concurrent `npm install` across sibling worktrees can corrupt a node_modules extraction** (seen
  2026-07-20: `firebase/firestore`'s `.d.ts` and dist files went missing in one worktree while a plain
  `npm install` ran there at the same time as another install in a sibling worktree — produced real-looking
  `tsc`/`next build` "module not found" errors that had nothing to do with the branch's actual changes). If
  a gate failure looks environment-shaped (missing files under `node_modules/<pkg>` rather than a type
  error in your own new code), don't assume it's a pre-existing repo issue and don't log it as one — first
  do `rm -rf node_modules && npm ci` in that worktree alone (no other install running anywhere else) and
  re-run the gate before concluding anything about the code.
