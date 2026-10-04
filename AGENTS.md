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

## Working-directory discipline (recurring failure — read before your first edit)

A worker has more than once edited files in the **main repo** (`D:\Apps\AI Receptionist`, branch `main`)
instead of its assigned worktree, because its edit tool resolved an absolute path against the wrong root
(often the main repo, since that path appears far more often in surrounding context than the worktree path).
Editing `main` directly is not a scoping slip — it bypasses the entire worktree-isolation safety model this
plan depends on.

- **Before your very first Edit/Write of the session**, run both of these and confirm they match your
  assigned WORKTREE_PATH and BRANCH *exactly* — not "close enough," not the main repo:
  `git rev-parse --show-toplevel` and `git branch --show-current`. If either doesn't match, stop and fix your
  working directory before touching any file.
- **Re-verify after any long gap, any tool error, or before your commit** — don't assume the first check
  still holds. A cheap habit: prefix file paths in your own head with the worktree root every time, never a
  bare relative path.
- **If you ever discover you edited the wrong repo:** do not panic-delete. In the wrong location, run
  `git status --short` to see exactly what changed, `git checkout -- <files>` (or `git stash` if you want a
  safety copy first) to revert only those files, confirm `git status --short` is clean there, then re-apply
  the same edits inside the correct worktree. Never run a destructive git command in the main repo without
  first confirming with `git status`/`git branch --show-current` that you're looking at what you think you are.

## Protected context (never change without a task that says so)

- `businessId` tenant scoping; default-deny `firestore.rules`; central guards in `src/lib/auth/verifyRole.ts`.
- Manual send gates (reports, invoices, FAQ approvals); field-correction confirm/cancel semantics.
- Vapi tool names/contracts (extend parameters; never rename — the live assistant depends on them).
- One-teal design system (`var(--accent)`, `.button` variants); Industry-Applicability Rule (CLAUDE.md).
- Never weaken an auth guard, add a bypass, hardcode a placeholder secret, or add a mock fallback that could
  run in production. If a guard blocks you, that is a finding, not an obstacle.

## Definition of done (per task)

1. Code + tests implementing the task's acceptance criteria, inside owned files only.
2. **Gates in tiers (owner, 2026-09-28: "the gate checks need to not be so redundant" — T-151).** Run each check once, at
   the tier that needs it; never re-run a suite already green on the same commit — cite that run instead.
   - **Worker, per task:** `npx tsc --noEmit`, eslint on changed files, `npx vitest related <changed files>` (or the
     touched test folders), and the ONE e2e spec for the screen you changed (read its phone screenshot). The booking
     scenario suite only when the Booking-change gate's scope is touched (it takes seconds). No `next build`, no full
     Playwright, no full vitest.
   - **Integrator, once per merge batch (not per task):** full `npx vitest run` + `npx next build`; `npm run e2e:call`
     only if the batch touched calls/booking/pipeline/jobs/documents.
   - **Before a push:** full `npm run e2e:test` once, on the final tree — or, when the owner says to skip the long gates
     (as on 2026-09-28), the changed-screen specs + `e2e:call`, and say so in the handoff.
   - Unchanged: a booking change still needs a real call + transcript read after deploy (Booking-change gate below).
3. One focused commit per task: `T-0XX: <imperative summary>` + body listing acceptance evidence.
   End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.
4. Append an entry to `docs/IMPLEMENTATION_LOG.md` (task, commit, evidence, removals if any).
5. Update your batch row in `TODO.md` (status → `review`), nothing else in that file.

## Booking-change gate (added 2026-09-27 — a real caller's booking failed)

Booking is the product's first impression; a caller who can't book hangs up and calls the next company. On 2026-09-27
two separate changes (round-the-clock demo hours `d1bee4e`, a business-wide overlap rule `e9caef0`) each passed their
own unit tests and together broke every booking on the demo line. Neither was tried with a real call. From now on:

- **Scope:** any change to scheduling or booking (`src/lib/tools/agentTools.ts` scheduling functions,
  `src/lib/tools/toolDispatcher.ts` booking cases, `src/lib/scheduling/**`), business hours, the demo seed or Demo
  Studio's launch/reset (`src/lib/verticals/demoSeed*.ts`, `src/app/api/admin/demo-customize/**`), the voice tool
  schemas (`src/lib/voice/elevenlabs/toolSchemas.json`), the agent prompt's tool/booking instructions, or appointment
  cancel/decline/lock code.
- **A worker's change in scope is not `review`-ready** until the booking scenario suite
  (`src/lib/scheduling/__tests__/booking-scenarios.test.ts`, the truth table in `docs/BOOKING-RELIABILITY-PLAN.md` §4)
  is green and every §4 row the change touches has a test.
- **The integrator does not call it done** until, after deploy: the ElevenLabs agent tests pass, and one real phone call
  books through the change and its transcript (tool calls + results, via the ElevenLabs conversation API) has been read.
  A bug report about a live call starts with that transcript — never a diagnosis from code alone.
- **Words the agent reads are part of the booking logic (2026-09-27).** G1's conflict reply said "8:00 AM Monday is booked. The closest
  openings are …" (meaning taken); the live model told the caller "8 AM Monday is booked" — a booking that did not exist. Unit tests only
  checked the string was what the code produced. Any tool result the model reads must say the outcome unambiguously up front
  ("NOT BOOKED: …"), the caller-facing `sayToCaller` must never contain a word that also means success, and every such wording change gets
  an ElevenLabs agent test against the real model before it ships.
- **How to run ElevenLabs agent tests here (2026-09-27).** The test runner does NOT call our initiation webhook, so the agent's stored prompt
  (an old "Carlita Roofing" test prompt) is what a plain run uses. Pass `agent_config_override.conversation_config.agent.prompt` with the real
  per-call prompt (build it with `buildInitiationResponse(config, callerPhone, now)` from the tenant's config). Webhook tool-call test
  parameter paths are `body.<field>` (a bare `<field>` fails with "path not found" even when the agent did the right thing). Tool calls in
  tests are mocked ("Skipping tool call in test mode"): put the tool result you want to test in `chat_history`. The saved suite is listed in
  TODO.md Phase 28.
- **`setup-elevenlabs-agent.mjs --update-tools`** builds tool URLs from `NEXT_PUBLIC_APP_URL`, which is now `https://crm.luxordev.com`, while
  the live tools point at `https://ai-roof.vercel.app` (same deploy). Run it with `NEXT_PUBLIC_APP_URL=https://ai-roof.vercel.app` unless you
  mean to repoint every tool; always read the dry-run diff before `--apply`.

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

## Browser and end-to-end testing (added 2026-09-26) — READ `docs/SMOKE-HARNESS.md`

A local, keyless copy of the whole product exists: `npm run e2e:up:bg` (from YOUR worktree) starts the app on Firebase emulators with seeded
tenants and accounts; `npm run e2e:test` runs Playwright on desktop + phone; `npm run e2e:call` walks call → pipeline → job → quote → report → invoice
over the real API. **Any task that changes a screen, a button, a list or a document must be checked with it** — write or extend a spec in `e2e/`,
look at the screenshots in `test-results/screens/`, and put the result in your final message. "I could not check it in a browser" is only acceptable
if the harness itself is broken, and then say exactly what failed. Also list what the harness cannot cover (real phone audio, real inbox, `next build`).
Never point a browser test at production or at any account that is not in `scripts/e2e/config.cjs`.

Lessons from T-144 (2026-09-27) — a green run can still hide a broken screen:
- **`toBeVisible()` is not "the user can see it."** It passed for an empty state buried off-screen inside a 900 px sideways-scrolling grid on the
  phone, and for a dark-on-dark title nobody could read. Open the phone screenshots every time; where it matters assert `toBeInViewport()` or
  check the computed color.
- **"No X anywhere on this page" passes on an error page.** The viewer check ("no write button inside any empty state") passed on the branch
  while the Library page was showing its load-error screen for every viewer. Assert the page actually loaded first (the empty-states spec's
  `visit()` fails on "Failed to load this page").
- **Re-test the merged tree, not just the branch.** Run `npm run e2e:call` after a change to calls/booking/pipeline/jobs/documents (on the
  merged tree, once per batch), and the full `npm run e2e:test` on the final tree before a push. The viewer Library bug only surfaced
  there. Tiers and what NOT to repeat: "Definition of done" item 2 (T-151, 2026-09-28).
- **Budget time for polling pages.** Pages that poll every 5 s never reach network-idle, so each `settle()` waits its full 15 s; a spec that
  walks 18 screens needs ~5 min. The full suite is ~94 tests / 13–19 min. Playwright wipes `test-results/` each run.

- **Screen audit (2026-10-03).** `npx playwright test e2e/screen-audit.spec.ts` visits every roofing screen per role and
  fails on first content > 5 s, > 12 distinct API calls while loading, or phone overflow; screenshots are
  `test-results/screens/<project>/audit-<screen>.png`. Run it (after `npm run e2e:call`, so screens have data) whenever a
  change touches a company screen's layout or data loading. Add new screens to its `SCREENS` list.
- **Live refresh costs quota.** Firebase is on Spark (50k reads/day, platform-wide). A polling screen must refresh only what
  can change (merge by id) and go through `useLiveRefresh` (idle back-off). Never re-read a full list every tick.
- **Warm dev routes (2026-10-04).** `next.config.ts` sets `onDemandEntries` (dev-only) so the harness stops recompiling
  routes mid-run; with it the full suite went from 47 min with random failures to 27 min, 149/149. Editing
  `next.config.ts` restarts the dev server — never do it while a run is going.
- **Full-suite gotchas (2026-10-03).** Don't edit app code while `npm run e2e:test` runs — the dev server recompiles under
  the tests and causes timeouts. If `e2e/booking.spec.ts` fails midway it leaves bookings that fill Monday 8:00 for the
  next run: `npm run e2e:seed`, then rerun. A value that changes identity every refresh (an array from the poller) must not
  feed an autosave effect — depend on a stable value (ids joined), or the draft never stops being "unsaved".

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
- **`.github/workflows/ci.yml`'s `npm test` step must not hardcode real-looking API key env vars.** T-020's
  `env.test.ts`/`example-api-route.test.ts` assert "not configured" behavior when `OPENAI_API_KEY`/
  `DEEPSEEK_API_KEY` are absent — `vi.stubEnv`/`vi.unstubAllEnvs` only affects vitest's per-test stubs, not a
  var that's genuinely present in `process.env` for the whole process (e.g. injected by the workflow's `env:`
  block). This caused ~9 hours of red GitHub Actions CI (4 pushes) that no local run ever caught, because local
  shells simply didn't have those vars set. Found and fixed 2026-07-21 by deleting the two env lines from the
  `npm test` step. If a future task's tests genuinely need a provider key present for the *whole* suite, stub it
  per-test with `vi.stubEnv` inside that test, not via the CI workflow's global step env.
- **Concurrent `npm install` across sibling worktrees can corrupt a node_modules extraction** (seen
  2026-07-20: `firebase/firestore`'s `.d.ts` and dist files went missing in one worktree while a plain
  `npm install` ran there at the same time as another install in a sibling worktree — produced real-looking
  `tsc`/`next build` "module not found" errors that had nothing to do with the branch's actual changes). If
  a gate failure looks environment-shaped (missing files under `node_modules/<pkg>` rather than a type
  error in your own new code), don't assume it's a pre-existing repo issue and don't log it as one — first
  do `rm -rf node_modules && npm ci` in that worktree alone (no other install running anywhere else) and
  re-run the gate before concluding anything about the code.
- **Patch "context mismatch" = line endings, not a real conflict (2026-09-27).** Almost every source file is CRLF, and
  many contain non-ASCII characters (`—`, `’`, `·`). A patch tool that writes LF or ASCII context will not apply.
  Proven fix: git stores LF (`core.autocrlf=true`, index `i/lf`, working tree `w/crlf`), so convert the working files
  to LF once before editing (PowerShell, worktree root):
  `git ls-files src e2e scripts/e2e | ForEach-Object { $p = (Resolve-Path $_).Path; $t = [IO.File]::ReadAllText($p); if ($t.Contains("`r`n")) { [IO.File]::WriteAllText($p, $t.Replace("`r`n", "`n")) } }; git add -u`
  `git status` stays clean afterwards and no commit carries line-ending churn. You do not need to ask permission for this.
- **A worker's "done" table is not the spec (2026-09-27).** H0's report listed commits per screen group but silently left out the whole Job-tab
  inventory, and its code counted a Firestore collection that doesn't exist (`businesses/{id}/team` — members live in top-level
  `businessUsers`), linked a checklist item to a Library section the page didn't accept, and relabeled the work catalog as "prices". The
  integrator reviews the diff against the spec's own inventory/table, row by row — never the worker's summary.
- **Sibling GET routes must agree on roles (2026-09-27).** A page that loads several endpoints in one `Promise.all` fails completely when any one
  of them 403s. The Library page loads library + crews + customers + logos + work-catalog; work-catalog alone refused viewers, so every viewer
  saw the load-error screen. When adding a read route a page loads alongside others, give it the same read roles as its siblings.
- **Merging `docs/IMPLEMENTATION_LOG.md` (2026-09-27).** Both sides only ever append, so resolve a conflict byte-wise: `git show :1:` / `:2:` /
  `:3:` to files, confirm both start with the base bytes, write ours + theirs[base.Length..]. Never open it in a patch tool (odd bytes).
- **Removing a worktree (2026-09-27).** Unlink its `node_modules` junction first (`[System.IO.Directory]::Delete(path,$false)`), or
  `git worktree remove` can delete the main repo's `node_modules` through it. Then check for orphaned harness processes: `npm run e2e:down`
  can leave `scripts/e2e/up.mjs --child` running with the worktree as its working directory, which locks the folder ("Permission denied").
  Find them with `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '<worktree name>' }` and stop them.
  Before deleting any worktree, `git rev-list --count main..<branch>` must be 0 — task/guide-3 was marked done in TODO for a day while its 3
  commits had never been merged.
- **Run to the end (2026-09-27).** A prompt's numbered steps are ONE job. Don't stop between steps to report progress
  or ask permission. Send one message when everything is done, or when you are truly blocked after finishing
  everything you can (then use "QUESTION FOR INTEGRATOR").

## Worker etiquette (added 2026-09-24)

**Testing UI/flow changes: use the smoke harness** (`docs/SMOKE-HARNESS.md`) — `npm run e2e:up:bg`, then `npm run e2e:test`. It needs no keys. Do not report "browser tool failed."

See `docs/WORKER_QUEUE.md`: commit WIP at least every ~45 minutes and always before stopping; stop and ask ("QUESTION FOR INTEGRATOR") instead of guessing on ambiguous specs, product decisions, new dependencies or files outside your ownership list; keep side quests out of the code (list them as "Noticed, not done"); never call live services or add keys to any file.
