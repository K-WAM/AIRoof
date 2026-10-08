# NEXT_SESSION.md — start here (written end of 2026-09-25)

## CURRENT STATE 2026-10-08 (end) — end-to-end walk: bilingual calls, crew day, hide breakdown, emails
- **Bugs fixed:** (1) time clock — "Arrived jobsite" from the office writes `office_out` + `site_in` with the same timestamp
  and the fold had no tiebreak, so a worker could read "off the clock" right after arriving (lunch then refused).
  `foldPunches` now orders same-instant punches closes-first (`SAME_INSTANT_ORDER`, test added). (2) A Project-price /
  accepted-quote job with no field notes produced an empty invoice that could not be sent; the invoice now falls back to the
  accepted quote's lines when nothing was logged (`invoiceLinesFromQuote`). (3) Customer money read `$1200.00`; every
  customer document/email/receipt and Luxor invoice now uses `fmtMoney` (`$1,200.00`). (4) Pipeline "Needs Confirmation"
  was unbounded (42k px phone page with a backlog): newest call first, 3 at a time; Upcoming 5 at a time; a `?appt=` link
  is always shown. Long caller names no longer squeeze to one letter per line next to chips.
- **Spanish:** calls stay bilingual (start English, follow the caller). New: the end-of-call writer detects a Spanish caller
  (`detectCallerLanguage`, caller turns only) and stores `callerLanguage: "es"` on the call and its requests — Calls shows
  "Spoke Spanish", Pipeline cards a "Spanish" tag; the call topic badge understands Spanish (gotera, cita, presupuesto).
- **Emails:** document emails are a table-based rounded card with `lang`, viewport and an Arial fallback (Outlook/phones);
  all notification shells got `lang` + viewport. Plain-text part + reply-to were already sent.
- **Luxor billing:** Zelle line on Luxor invoices and overdue reminders when `LUXOR_ZELLE_TO` is set (Vercel env — owner
  to add the address); Stripe Pay link unchanged.
- **New spec:** `e2e/bilingual-crew-day.spec.ts` (see SMOKE-HARNESS.md). Not provable offline: a real ElevenLabs call in
  Spanish (T-196), inbox placement/DKIM (NH-3), real Whisper/gpt-4o translation of a spoken Spanish note.

## CURRENT STATE 2026-10-08 (night) — load times + desktop clarity pass
- **Measured on a production build** (new harness mode: `node scripts/e2e/up.mjs --detach --prod`): every company screen is
  ready in ~0.8–1.2 s locally, no layout shift on load or during live refresh (Team's one jump fixed). Dashboard no longer ships
  every industry's starter price list (`dashboardTiles.ts` split from `starterKits.ts`); Calls no longer loads its link lists twice.
- **Customers fixed:** a job created with a typed client name is linked to a customer by the server after it responds
  (`POST /api/jobs`, `after()`); it used to depend on a second browser call, so jobs could miss Customers.
- **Say-it-once (C5) on desktop:** paid invoice (one "paid" + "Marked paid on…" instead of "No payments recorded"), locked
  quote (no greyed editor, no duplicate chip/total — closes the earlier open item), Pipeline card time printed once, Team
  cards drop the state chip their tab already names; Work log's Edit sits on its panel; panel headers keep actions on the
  title row; Field picker says "No open jobs right now" / "Show finished jobs (n)"; customer phones formatted.

## CURRENT STATE 2026-10-08 (later) — production-readiness pass, roofing first
- **Hardening:** caller-supplied text (name/address/service from a phone call) is now HTML-escaped in the owner's
  booking/escalation emails (`agentTools.ts` dataRow/brandHeader) and in the Luxor invoice email; field notes (typed +
  voice, each a paid model call) have a per-IP budget (`FIELD_NOTE_LIMIT`, 30/min); the unused
  `PUT /api/calls/[callId]` (merged any body into a call record) is gone; production CSP drops `unsafe-eval`, allows
  `media-src https:` for old Vapi recordings, adds `Permissions-Policy` (camera/mic self only).
- **Speed:** Calls list is slim (`?slim=1`: no transcripts, server-computed topic badge + turn count; the open call's
  transcript loads via `GET /api/calls/[id]`) — ~150 KB → a few KB per load. Job page lazy-loads the dnd-kit photo grid
  and skips the quote summary fetch when the job has no quote.
- **Roofing UX:** a paid/invoiced job no longer says "Next: Findings" (`nextStep.ts` never points backwards); "Send to a
  worker" is hidden on finished jobs and appears once (header only); "Submit update" → "Add a note"; one teal action
  per job-page document tab and on the field time clock; Library's phone search row lost its 240 px blank gap.
- **Gates on the final tree:** vitest 237 files / 1846 tests green; tsc clean; eslint 0 errors; `next build` green (job page
  first load 199 → 183 kB); `e2e:call` 12/12; full Playwright 154/155 — the one failure (Send feedback below the fold at
  1280x720 since the Billing tab) fixed with a tighter ≤760 px sidebar tier and re-run green alone.
- **Open, not done:** an accepted quote still shows the greyed editor above the customer preview (say-it-once);
  Jobs list chip "Open" vs filter "Needs quote" wording; `[MOCK-classify]` text is harness-only.

## CURRENT STATE 2026-10-08 — read this first
- **Products per client** (owner: "toggle which customers have ability to use what based on the contract"): Admin → client →
  **Products** (3 switches, audited, `POST /api/admin/businesses/[id]/products`). Server refuses the rest (403 naming the
  product). Tabs not bought show **greyed with a lock** and open an upgrade page ("Ask Luxor to add it" emails
  connect@luxordev.com and flags the client: "Asked for it" on Products, "— wants Calls" in the client list).
- **Billing without Stripe**: clients' customers pay the client directly. Settings → Getting paid; How to pay + Pay button on
  invoices; **Record payment** on the job (partials, receipts); reminders at 1/7/14 days; **Billing** screen.
- Fixed on the way: the company shell asked for the demo tenant before sign-in finished (401) and briefly treated every module
  as on — it now waits for the signed-in user.

## CURRENT STATE 2026-10-04 (end)
- **Superadmin**: Playbook rewritten as short tabs (`/hub/guide`); **Usage & costs** per client with live provider balances
  (`/admin/usage`, rates in `src/lib/billing/aiCostRates.ts`); **billing automation** — receipt on Mark paid, reminders at
  1/7/14 days overdue, Pause client from Invoices, auto-resume on payment.
- **AI map**: calls = ElevenLabs Agents (old Vapi lines: gpt-4o-mini + Deepgram); voice notes = Whisper → gpt-4o reads them;
  call summary/outcome = DeepSeek with OpenAI fallback; quotes/invoices/reports = no AI.
- **Owner open items**: T-196 (prove ElevenLabs Spanish on a real call), T-197 (should inspectors build quotes?), T-190
  (Twilio texting), NH-32, merge the branch.

## CURRENT STATE 2026-10-04 (late night)
- **Field link is now reusable and sent, not posted** (owner: "textable or emailable … we are good with reusable code"). Job page →
  "Send to a worker": type a phone or email → the app emails it (letterhead), or texts it from the business line when texting is
  Ready, else opens the office phone's Messages with the text written. One link per job, any number of phones, every day, until
  "Stop link" / field-key rotation / 90 days (`openFieldJobLink`, `fieldJobLinks` + `fieldJobLinkIndex`, kept off the job doc).
  QR is one tap away for someone standing next to you. Old one-use links still resolve once.
- **Documents checked** (quote/invoice/report, desktop + phone, logo + Before/After photos, emails): photos are now picked by
  thumbnail; the phone invoice editor stacks and its tables scroll; the logo is asserted in all three docs and emails
  (`e2e/doc-photos.spec.ts`); invoiced jobs no longer say "Next: Report"; the header next-step button hides on its own tab.
- **Library**: tabs in plain words, most-used first (Common fixes · Prices & rates · Crews · Logo · Documents); one primary per
  empty tab. **Customers** for schools/institutions: "Who is it?" first (School or business / Person), organization name,
  contact person, "Email for quotes and invoices"; the type defaults to what most existing customers are.

## CURRENT STATE 2026-10-04 (night)
- **Owner's standard saved:** `docs/ZERO-TRAINING-UX-STANDARD.md` (checklist: `docs/SCREEN-CLARITY-HEURISTICS.md`). Applied:
  Jobs/Pipeline/Calls bounded with the card as the one tap target (phone heights 12–14k px → 2.3–3.7k px); Calendar fits a full
  week at 1280 px, unscheduled list searchable + bounded; job page "Field QR / link" (one button: QR code to scan + Text/copy link, native share, 24 h one-use link
  for contractors — no account); "Work on this job" (the inspector's findings) on both field screens; admin config chip row.
- **T-182–T-186 done.** `e2e/screen-audit.spec.ts` now fails on clutter (phone height, >1 teal button, >16 taps above the fold).
- **Security posture change to confirm:** field link open window 10 min → 24 h (`FIELD_EXCHANGE_TTL_MS`, one constant). Still one
  use, job-pinned, revocable by rotating the field key.
- Owner decisions still open: merge the branch, NH-32 (Blaze), real-phone test of the field screen.

## CURRENT STATE 2026-10-04 (late)
- **New standard:** `docs/SCREEN-CLARITY-HEURISTICS.md` — ten pass/fail clarity rules (C1–C10) on top of Nielsen. Phone audit with
  seeded data: Pipeline (~14.5k px), Jobs (~12.8k px) and Calls (~11.7k px) are still cluttered; filed as T-182–T-184
  (T-185 admin config, T-186 automated budgets) in `TODO.md`. Everything else passes.
- **T-180** (activity signal) stays a plan only. **T-181** (field updates) is done. Owner decisions still open: merge the
  branch, NH-32 (Blaze), real-phone test of the field screen.

## CURRENT STATE 2026-10-04 — read this first
- **Phase 33 done on branch `ccr-8c0916c7-3r7kkm`** (still not merged/deployed): T-172–T-179 polish, and **T-181 field
  updates** — one note composer for both field screens that prints the job + author before talking, warns when
  clocked in at a different job, and leaves a receipt naming both; server-side author identity (login, or the typed
  name on a QR link); a plain-words time clock with a running timer and a confirm on Clock out. Details + Nielsen
  table: `docs/USABILITY-AUDIT-2026-10-03.md` (follow-up section). T-180 is a plan only (`docs/T-180-ACTIVITY-SIGNAL-PLAN.md`).
- **Gates on the final tree (`82ff7ba`):** full e2e:test 149/149, 0 flaky, 25.6 min; vitest green; e2e:call 12/12. Field passes 2–3 the same day: JobPicker (search + 5 likeliest + Show all), finished jobs reachable, "office" not "shop", crew name on office note cards.
- **Owner:** merge the branch; decide NH-32 (Blaze); then try the field screen on a real phone (hold-to-talk and
  tap-to-start, Clock in → note → Clock out).

## CURRENT STATE 2026-10-03 — read this first
- **Roofing hardening + usability audit on branch `ccr-8c0916c7-3r7kkm` (not merged/deployed).** Read
  `docs/USABILITY-AUDIT-2026-10-03.md`: security fixes on the no-login field-QR write paths (photo HTML injection into
  report emails, prompt injection via client job context, NaN corrections), the duplicate-job bug from the New Job form,
  a ~10× cut in live-refresh Firestore reads (Spark quota), and per-screen Nielsen fixes (sidebar at 1280×800, Jobs tab
  counts, dashboard phone layout, Settings length, dead "Field view" button). Open ⚠️ items are listed per screen.
- **Owner:** review + merge; then decide Blaze (NEEDS-HUMAN — Spark's daily cap can take every tenant down at once).

## CURRENT STATE 2026-09-29 (evening) — read this first
- **Phase 32 is live** (T-157–T-171, `0b09946`, crm.luxordev.com, `firestore:rules` released). Spec + review: `MASTER_PLAN.md`
  "Phase 32 review …"; state: `TODO.md` Phase 32 stream table; prompts used: `docs/WORKER_QUEUE.md` section J.
- **Gates run before the push:** full vitest, `next build`, `npm run test:rules` 9/9, `e2e:call` 12/12, full Playwright 141 passed
  (the 2 failures were one spec, fixed, green alone). The merged-tree browser run caught 6 real regressions the workers' own checks
  missed — fixed in `945e123`/`bcd7ee4`. Lesson kept in memory: the integrator's full browser run on the merged tree is not optional.
- **Owner, next (in this order):**
  1. One real booking call to +1 (689) 204-2643 (Booking-change gate for T-169) — then the integrator reads the transcript.
  2. Decide the NH-30 defaults (nav labels, project price, quote→invoice, text sender, Canada texting, no quote revisions).
  3. NH-31: add +1 (778) 907-9769 to demo-roofing (Admin → demo-roofing → Configure → Phone lines / ElevenLabs numbers) and make a
     test call; delete the stale `VAPI_AUTH_BYPASS` in Vercel; approve `scripts/phone-lines.mjs --apply` and the
     `scripts/classify-accounts.mjs` mapping. NH-28: delete the stale `superadmin` field on kwamwad@gmail.com (inert now).
- **Texting stays OFF** (`SMS_ENABLED` absent in production). When NH-29 clears: set a line's texting to Ready in Admin → Configure →
  Phone lines (texts only ever come from the line the caller dialed), then flip `SMS_ENABLED`.

## CURRENT STATE 2026-09-28 (morning) — read this first
- **Pushed:** H2 (Deepseek: booking scenarios `npm run e2e:booking`, `docs/BOOKING-TEST-SCRIPT.md`, the daily booking canary cron at
  11:00 UTC + Admin Usage "Booking" column) and **Phase 30** built by the integrator: crews are editable with members (Library → Crews),
  the Calendar asks for a time on every drop (two jobs can share a crew-day), a distinct "Phone bookings" row, "Confirm + email crew"
  (crew + every member), the Team page's ⓘ role help + Disable, and the new field-only **Crew** role. TODO.md Phase 30 lists what's left.
- **Gates are tiered now** (AGENTS.md "Definition of done" item 2, T-151). This push ran: tsc, eslint (changed files), full vitest
  (1,476 pass; the 2 fails were the Team test updated for Disable + the known demoSeed load-flake, both green alone), the new
  `e2e/crews-calendar.spec.ts` 8/8 (desktop + phone, screenshots read), `e2e:call` 12/12, `e2e:booking` 7/7. **Not run** (owner: skip
  the long gates for now): full `e2e:test`, local `next build` (Vercel builds on push).
- **Codex H3 is still running** (`air-wt-setup-ux`). Merge notes for it are in `docs/WORKER_QUEUE.md` section H (CalendarBoard: take main).
- **Owner, when you can:** open Library → Crews and Team on the live site; try a drag on the Calendar. Still owed from before: relaunch
  Demo Studio, one booking call, Confirm & call customer — then the integrator reads both transcripts, and `/admin/usage` after 11:00 UTC.

## CURRENT STATE 2026-09-28 (~2 AM) — read this first
- T-146 pushed + deployed (9ca467c, crm.luxordev.com Ready). T-147 (owner's second round: Pipeline scroll, field findings confirm +
  back-to-job, ZIP-code rule, Edit customer details, quote intro/disclaimer, Dashboard "Latest from the field") — see TODO.md Phase 29.
- Still owed by the owner: relaunch Demo Studio (clears the Sep 25 "8:54" data), one booking call, then **Confirm & call customer** and
  answer the AI. Integrator reads both transcripts. Nothing outbound has rung a real phone yet.

## CURRENT STATE 2026-09-28 (just after midnight) — earlier
- **Owner's first real test call (2026-09-27 11:33 PM) → T-146, TODO.md Phase 29.** Branch `fix/demo-test-feedback-0928` (local, NOT
  pushed — waits for "approve push"). Booking itself worked (2 PM stored correctly); the confusion was a stale Sep 25 booking because Demo
  Studio was never relaunched. Fixed: AI no longer invents availability (prompt + 2 new agent tests), Call Back works for a superadmin
  and outbound ElevenLabs calls finally carry the tenant prompt + conversation record (Call Back, AI confirmation call, Demo Studio Test
  call — **none placed on a real phone yet**), no-email confirm = AI call, Create Job shows the existing job, photo library allowed.
- **After the push, owner:** relaunch Demo Studio → call + book → Pipeline → **Confirm & call customer** → answer the AI. Integrator reads
  both transcripts (inbound + the outbound conversation) before calling any of it done.
- Texting confirmations = NH-29 (carrier registration first). Agent tests now 10 saved (TODO Phase 28 list + Phase 29).

## CURRENT STATE 2026-09-27 (late night) — read this first; everything below is older
- **Pushed + deployed:** `main` == `origin/main`; production `https://crm.luxordev.com` (also `ai-roof.vercel.app`) Ready + healthy. Shipped
  today: T-127, E6b, T-129, T-130, the hours hotfix, T-144 (empty states + first-run checklist), **G1 (booking engine)**, the viewer-Library fix,
  and the G3 guide/runbook refresh (found unmerged during cleanup). Live ElevenLabs tools updated for G1; 6 agent tests pass.
- **The one thing between us and "booking works": a real call.** Owner relaunches Demo Studio (Roofing) — it writes Mon–Fri 8–5, weekends
  Closed and business-hour seed times; the stored `demo-roofing` doc still has round-the-clock hours + 8:54 AM/PM seed — then calls
  +1 (689) 204-2643 asking for a weekday 8 AM. Integrator reads the transcript. (`docs/BOOKING-RELIABILITY-PLAN.md` §7.)
- **Open owner decision:** the roofing template's prompt-only "Minimum 24-hour notice" rule (TODO.md Phase 28).
- **Worker queue = `docs/WORKER_QUEUE.md` section H:** H0 + H1 DONE. **H2 (Deepseek: booking tests + daily canary) and H3 (Codex: hours at
  setup, then the roofing UX pass) can both start now.** When either reports: review against its spec, merge, run the gates + `e2e:call` +
  full Playwright on the merged tree, then push.
- Worktrees: only the main checkout remains (all task worktrees + the stale `.kilo` one removed; merged branches deleted).
- Learnings from today: AGENTS.md "Booking-change gate" (agent-read wording, how to run ElevenLabs agent tests, the tool-URL pin),
  "Browser and end-to-end testing" and "Known hiccups" (worktree removal), all dated 2026-09-27.
- Still to add: +1 (778) 907-9769 under Admin → Clients → demo-roofing → Additional phone numbers. Pricing proposal + billing terms: TODO T-126.

## UPDATE 2026-09-25 (afternoon)
- **Round-2 demo feedback plan:** `docs/DEMO-FEEDBACK-PLAN.md` (E1–E6 worker tasks; tracked as TODO.md Phase 25) supersedes the older D-series prompts for the next wave.
- Smoke test DONE: C5 + C6 merged to local `main` (`src/e2e/demo-path.test.ts`, `src/e2e/field-audio.test.ts`; `docs/SMOKE-REPORT.md` all pass offline); `next build` passed on main.
  Merged worktrees removed. **Local `main` is ahead of `origin/main` — not pushed yet.**
- Owner decisions: **ElevenLabs only, Vapi retired from demos; roofing first.** The next goal is the 20-minute roofing demo:
  spec `docs/DEMO-READINESS-PLAN.md`, three worker tasks D1/D2/D3 in `docs/WORKER_QUEUE.md` section D, tracked as TODO.md Phase 24.
- Owner blocker: **Twilio Upgrade** (NH-21) before any prospect calls the ElevenLabs line.
- **Click-by-click for the owner: `docs/DEMO-DAY-RUNBOOK.md`.** Live check 2026-09-25 evening: the demo tenant was still configured as "teste" / care-homes (agent Elena) from an earlier launch, J-1001 and the roofing Library were MISSING, escalation phone was a placeholder — a Roofing launch from Demo Studio fixes the first two; the owner sets the phone. ElevenLabs side verified OK (number assigned, 7 tools, forced pre-tool speech, per-call overrides + initiation webhook enabled). All worktrees removed.
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
