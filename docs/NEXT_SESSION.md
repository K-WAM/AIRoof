# NEXT_SESSION.md — start here (written end of 2026-09-25)

## UPDATE 2026-09-25 (afternoon) — read this first
- Smoke test DONE: C5 + C6 merged to local `main` (`src/e2e/demo-path.test.ts`, `src/e2e/field-audio.test.ts`; `docs/SMOKE-REPORT.md` all pass offline); `next build` passed on main.
  Merged worktrees removed. **Local `main` is ahead of `origin/main` — not pushed yet.**
- Owner decisions: **ElevenLabs only, Vapi retired from demos; roofing first.** The next goal is the 20-minute roofing demo:
  spec `docs/DEMO-READINESS-PLAN.md`, three worker tasks D1/D2/D3 in `docs/WORKER_QUEUE.md` section D, tracked as TODO.md Phase 24.
- Owner blocker: **Twilio Upgrade** (NH-21) before any prospect calls the ElevenLabs line.
- **END OF DAY 2026-09-25 — all three Phase 24 tasks are built and deployed** (D1 phone line + Demo Studio, D2 job loop, D3 roofing content; the integrator finished D2 because Codex B stalled). Read the STATUS block at the top of docs/DEMO-READINESS-PLAN.md. **Next:** (1) owner: Twilio Upgrade + set the demo tenant's escalation phone to the owner's cell; (2) place the 5 scripted calls (booking, tile question, insurance, off-topic, emergency) on +1 (689) 204-2643 after a Demo Studio launch and check: no ID read aloud, no gap over ~2 s, Live badge during the call, recording after; (3) do the field run on a real phone (Field QR, voice EN + ES, photo, + Finding, Work complete) and read the "field-audio timing" log lines; (4) 3 dry runs. Worker prompts D1/D2/D3 in WORKER_QUEUE.md are all obsolete (done). `air-wt-job-loop` still exists with Codex B's stale uncommitted partial — delete it (unlink the node_modules junction first, then git worktree remove --force, git branch -D task/job-loop).
- **Later the same day:** D3 (roofing content) and D1 Part 1 (Demo Studio on ElevenLabs) are merged + deployed, and the demo line MOVED:
  **+1 (689) 204-2643 now answers as `demo-roofing`** (Demo Studio renames it per launch; calls/bookings land in `demo-roofing`). The Vapi
  number is no longer advertised. D1 Part 2 (call quality, live call row, audio, test call) and D2 (job loop) are still in progress — see TODO.md Phase 24.
- The paragraph and "First 15 minutes" below predate this and are superseded where they conflict (the smoke test is done; the demo line is moving to ElevenLabs).

## Where we are in one paragraph
`main` is pushed and deployed at `https://crm.luxordev.com` (health: Firestore connected, all providers configured, Stripe not). The whole customer story is BUILT and unit-tested
(call books -> request in Pipeline -> Review request card: confirm/decline -> job -> field updates EN/ES -> report, quote, invoice with one shared letterhead/logo), but **only the first link
(a real ElevenLabs call booking an appointment) has ever been proven live, and nobody has run the full chain end to end** — that is the next session's job (T-124 smoke test, then the
owner's live run-through NH-26). Email is fixed: prod `RESEND_FROM` = `Luxor CRM <crm@luxordev.com>`, business-name sender, replies to the business, logos/photos inline, failed sends no longer
marked "sent". Reports carry NO pricing (owner decision). Vapi (+1 754 283 7658) is still the any-industry demo line; ElevenLabs (+1 689 204 2643, tenant `carlita-elevenlabs-test`) is roofing-only.
Firebase stays on Spark by owner decision (no Blaze yet). Full task list: `TODO.md` Phase 23 (T-122..T-128) + NEEDS-HUMAN NH-24..NH-28.

## First 15 minutes
1. `git status` / `git log --oneline -8` (expect main == origin/main). `curl https://crm.luxordev.com/api/health`.
2. **Hand Codex the smoke-test prompt (T-124) — paste-ready, model Terra medium:**
```
Read D:/Apps/6 - AI Receptionist/docs/WORKER_QUEUE.md and follow section "C5" exactly.
Create the worktree: cd "D:/Apps/6 - AI Receptionist" && git worktree add ../air-wt-smoke -b task/e2e-smoke main
Junction node_modules like the other worktrees; verify toplevel and branch before your first edit.
Do not change production code to make the test pass. Do not push or merge to main. Commit every ~45 minutes.
```
   When it reports: read `docs/SMOKE-REPORT.md`, fix every failed step (small = you, live-call-path = Codex Sol medium), merge, push.
3. Deepseek: nothing queued. If it must be used: T-127 cleanup is Terra-low territory (dead `_ReportRenderer`, worktree removal) — give it to whoever is free.

## Owner's list (details: `TODO.md` NEEDS-HUMAN and `docs/NEEDS-HUMAN-CHECKLIST.md`)
- **NH-24 rotate the Firebase service-account key** (it was printed into a session transcript) + mark `RESEND_API_KEY` Sensitive in Vercel.
- **NH-25** open the "[Test] Luxor CRM email deliverability check" email -> Show original -> dkim/spf/dmarc = pass, inbox not spam.
- **NH-26 live run-through** (15 min): call the ElevenLabs line and book -> `/company/calls?preview=carlita-elevenlabs-test` -> Pipeline -> Review card confirm + create job -> Field QR on a phone (English + Spanish) ->
  Report / Quote / Invoice, email each to yourself. Report must show no prices.
- **NH-27** before selling: Vercel plan (Hobby forbids commercial use), Twilio Upgrade (NH-21), legal docs, recording wording (NH-4/NH-22). Firebase stays on Spark for now.
- Still open from before: NH-1 Vapi audit, NH-8 real-device tests, NH-17 (crm domain is live; only Firebase Authorized-domain for Google sign-in unconfirmed), NH-18 Care Homes/Daycares safety calls, press **Apply** on Admin -> Clients -> Sync live phone assistants.

## Known gaps (honest list)
- ElevenLabs calls have **no recording** (transcript + summary only) and the test tenant has no escalation phone (T-125). The existing call `call_elevenlabs_conv_2` has no `startedAt` (invisible in Calls; new calls are fine — unverified until the next call).
- T-118 prompt fixes still open: AI reads appointment IDs letter-by-letter; ~7 s dead air before tools. T-119 config declutter done.
- Spanish phone voice (NH-15/16), gpt-realtime turn-taking (do not retry via Vapi), billing (T-126, held), photos on Spark (T-128, held).

## Tooling facts (do not re-derive)
- **Vercel CLI:** `vercel env add NAME production --value '...' --no-sensitive --yes --non-interactive </dev/null` (without `--no-sensitive` it defaults to Sensitive and `env pull` returns `""`; without `--value` + `</dev/null` it hangs). `vercel redeploy <url> --no-wait`. Logs: `vercel logs --environment production --since 12h --no-follow --query "elevenlabs"`.
- **Prod Firebase key for a script:** it is NOT in `.env.local`. `vercel env pull <scratchpad file> --environment=production --yes` writes it as pretty-printed JSON whose
  between-field newlines became `\n` escapes too; `node --env-file` cannot load it (stops at the first inner quote). `scripts/move-demo-line-to-elevenlabs.mjs` shows the
  working pattern (`MIGRATION_ENV_FILE`, read the line directly, turn only out-of-string `\n` back into whitespace). Never print JSON.parse errors — they quote the input. Delete the file after.
- **Never print a secret**: parse `FIREBASE_SERVICE_ACCOUNT_JSON` from a pulled env file with the dotenv-style `\n` handling and never let an exception echo the source line (that is how the key leaked). Delete pulled env files immediately.
- **ElevenLabs MCP** is registered at user scope with the US URL (`https://api.us.elevenlabs.io/v1/mcp`); re-auth via `/mcp`. Setup script: `node scripts/setup-elevenlabs-agent.mjs --apply --agent-id <id>`.
- Files in this repo are mostly CRLF: multi-line Python/sed replacements need `\r\n`. `docs/IMPLEMENTATION_LOG.md` has odd bytes: append with a shell `cat >>` / `printf >>`, never a patch tool.
- Removing a worktree: unlink the `node_modules` junction first (`[System.IO.Directory]::Delete(path,$false)`), then `git worktree remove`. Lint ignores `.kilo/**`.
- Full `vitest run` has two load-flaky tests (`send.test`, `company/team`) — re-run them alone before believing a failure.
- Worker prompts live in `docs/WORKER_QUEUE.md` (sections A/B/C). Every prompt needs the abs worktree path + `git worktree add` command and a suggested model + effort.

## Repo state
Local `main` has the C5/C6 merges + the Phase 24 plan (not pushed as of 2026-09-25 afternoon). All merged worktrees removed; only the stray `.kilo` one remains (not ours).
Phase 24 worktrees appear as workers start: `air-wt-demo-line` (D1), `air-wt-job-loop` (D2), `air-wt-roofing` (D3). Worktree policy: `docs/DEMO-READINESS-PLAN.md` §6.
Local uncommitted: only `.claude/settings.local.json` (ignore).
