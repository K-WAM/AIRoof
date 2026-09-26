# DEMO-READINESS-PLAN.md — the 20-minute roofing demo, on ElevenLabs

Written 2026-09-25, revised the same day into **three worker tasks** (D1 Codex, D2 Codex, D3 Deepseek). Paste-ready
prompts are in `docs/WORKER_QUEUE.md` section **D**, and TODO.md Phase 24 tracks them. This file is the spec workers
follow; the prompts only point here.

## STATUS — end of 2026-09-25 (read this first)

**Built and merged to `main` (deployed):** D1 (ElevenLabs demo line, Demo Studio redesign, reset hygiene, call-quality, live call row, call audio, test call, J-1001), D3 (roofing content) and **all of D2** (Stages 1-4). Codex B stalled after Stage 1, so the integrator (Claude) built D2 Stages 2-4 directly; the "D2 Stage 2" prompt in WORKER_QUEUE.md is obsolete.

**Deviations / not built (deliberately):**
- **Voice model swap NOT done** (D2 step 5): switching `whisper-1` for `gpt-4o-mini-transcribe` needs live latency numbers and a Spanish check (those models return no language). Instead `field-audio` now logs phase timings ("field-audio timing" in Vercel logs: transcribeMs / parseMs / saveMs / totalMs) and the field screens show elapsed-time text (Uploading -> Transcribing -> Updating the job). Read the logs after the first real field test, then decide.
- **Quote auto-draft waits for the first finding** (or the first "+ Add item"): an empty draft would burn a quote number on every job whose tab is merely opened.
- **Job history omits "crew assigned" as a timed event** (no timestamp is stored for it); it shows "Visit scheduled" at the scheduled time. Everything else in the history is a real, stored timestamp; nothing is invented.
- **Customers is a top-level page** gated by the Library module (same availability as before), labelled with the industry word.
- Integrator fixes worth knowing: booking tool result no longer invites the AI to read the appointment ID; reset backup is size-safe; the live-refresh hook's three pitfalls (selection reset, error page on a failed refresh, non-returned promise) fixed on Calls/Pipeline/Dashboard; the office job page polls ONE document (not five) so an open tab does not burn the Spark read quota.

**NOT yet proven (needs the owner):** no real phone call has been placed since these changes; the field screens, voice latency, emails and the whole 20-minute run have not been done on real devices. Blockers: Twilio Upgrade (NH-21), owner's cell as the demo tenant's escalation phone. Next: the owner's scripted calls, then 3 dry runs (§2 definition of demo-ready).

Owner brief (2026-09-25):
- Make the core loop smooth, self-explanatory and repeatable in a 20-minute live demo. The loop is call → request → job →
  field → findings/photos → Library → quote → report → invoice.
- **Roofing first.** **ElevenLabs only; no more Vapi.**
- Type in the prospect's business name and the phone agent adapts.
- Simple enough to explain itself, while covering what a field-service product like Jobber does.
- Call integration and field updates → job details must work seamlessly.

---

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **ElevenLabs is the demo line.** The ElevenLabs number (+1 689 204 2643) moves to the demo tenant `demo-roofing`. Vapi disappears from Demo Studio and the demo docs. The Vapi number stays connected but unadvertised for 2 weeks (T-117 P2), then is released. The Vapi code path stays until no tenant uses it (T-117 P4). |
| D2 | **"Type their name and the agent adapts" works by design on ElevenLabs.** At the start of *every* call, the initiation webhook reads the tenant owning the called number fresh from Firestore and builds the prompt and greeting from it (`src/app/api/webhooks/elevenlabs/initiation/route.ts` → `buildInitiationResponse`). A Demo Studio launch writes the name, so the **next call greets as that company**, with no push to ElevenLabs and no dashboard edit. Only the number → tenant mapping is cached, and it doesn't change between launches. |
| D3 | A launch must **not** PATCH the shared ElevenLabs agent. Per-call overrides already carry the tenant prompt, and a PATCH overwrites the agent's hand-tuned base prompt. |
| D4 | Jobs are never auto-created. "One tap" means a human taps **Confirm & create job**. |
| D5 | Reports carry no prices unless the owner ticks Include quote (2026-09-25). Firebase stays on Spark for demos (§13 explains why it isn't enough for paying customers; that's the owner's decision). |
| D6 | Roofing only for now. Other industries keep working as they do today, and their demo content comes later using D3's pattern. |

## 1. Demo-breaking findings (verified in code, 2026-09-25)

1. **Demo Studio is hard-wired to Vapi:** `LIVE_LINE_PHONE` in `demo-customize/route.ts`, `DEMO_LINE_PHONE` in
   `templates.ts`, `VAPI_DEMO` in `DemoRunbook.tsx`, and the "connect a Vapi number" copy in `hub/demo/page.tsx`.
2. **Demo reset leaks the last prospect's data:**
   - It deletes job documents but not their `updates`/`photos`/`photoBlobs` subcollections.
   - Job IDs (J-1001…) and the counter are reused, so a new job can inherit old photos and field updates.
   - It never clears `customers`, `quotes`, `invoices`, `punches`, `schedulingLocks`, `library/logos` or the tenant's
     `elevenlabsConversations`.
   - **Stale `schedulingLocks` make a second dry run's "tomorrow at 8" fail with "that time was just taken".**
3. **The call sounds robotic in places (T-118):**
   - The tool result carries the raw `appointmentId`, which the AI reads out letter by letter.
   - There's about 7 s of dead air before tools.
   - It promises emails that are only sent after an admin confirms.
4. **ElevenLabs calls have no recording (T-125).** The player keys off `recordingUrl`, which is never set.
5. **Nothing refreshes by itself.** Calls, Pipeline, Dashboard and the job page load once. The call row appears only after
   post-call processing.
6. **Request → job takes a form.** The Review card opens a prefilled `/company/jobs` form. `POST /api/jobs` **ignores
   `clientEmail`** and records no link to the call.
7. **The quote needs typing:**
   - Only "+ Add manual line" exists; there's no Library picker.
   - Three unexplained toggles sit above a blank "Description of work".
   - The draft needs its own click.
8. **Findings ⇄ Library is one-way.** There's no "Save to Library" and no price on a one-off. Voice-parsed issues don't
   suggest catalog items. Findings can't be added from the field.
9. **Report notes start empty** until "draft" is pressed. There's **no lifecycle history** (the Timeline tab is the field
   timeline only). There's **no "what's next"** on the 9-tab, 2,359-line job page.
10. **Roofing content is shingle-heavy.** South Florida needs tile, flat roofs, hurricanes, insurance and wind mitigation.
11. **Owner blocker: Twilio is still on trial.** Callers hear a trial message (NH-21).

## 2. The 20-minute running order (what the three tasks build toward)

**Five minutes beforehand, not counted.** Demo Studio → Roofing is preselected → type company, owner name, email, phone and
city, and drop in their logo → **Launch**. The status card turns green and shows the exact greeting the caller will hear.
Press **Test call** and your phone rings as their company. Keep the dashboard open in a second window.

| Clock | Step | Plan B |
|---|---|---|
| 0–2 | Hand them the demo number: "Call this, it's your receptionist." | — |
| 2–6 | **They call.** They ask about tile or insurance, try something off-topic, then book an inspection with name, address and problem. A **Live** row appears in Calls while they talk. | You call on speaker. |
| 6–9 | The call completes with summary, transcript and recording → Pipeline → Review card → **Confirm & create job** (one tap) → the job opens with customer, email, address, reason and a "From call" link. | Seeded request. |
| 9–13 | Phone: the job's **Field QR** → **Arrived at job** → hold to talk ("This is Marco… six cracked tiles… pipe boot is split…") → one photo. The office job page updates by itself, and **suggested findings** appear → tap to add. | **J-1001**, the seeded fully worked job. |
| 13–16 | The Quote tab is **already drafted** from findings with Library prices → **+ Add item** → "Damaged flashing" → edit the price → **Send** to their email. | Print preview. |
| 16–18 | Report (auto-drafted, photos, no prices) → send. Invoice from the job. | Same, on J-1001. |
| 18–20 | **Job history** (call → … → invoice) → how onboarding works (keep your number and forward it). | — |

**Demo-ready** means the owner does **3 consecutive dry runs on the live line**, each under 20 minutes, with no manual
reloads, and typing limited to the prospect's details, one price edit and one email address.

---

## 3. The three worker tasks

Rules for all three:
- `AGENTS.md` and the worker etiquette in `docs/WORKER_QUEUE.md` apply.
- One worktree per task, and **commit after every numbered step**.
- No live services and no keys; use mocked `fetch`.
- Mobile at 375 px, the one-teal design system, and `jsonWithCache` (never `public`/`s-maxage`).
- Tenant-scoped everything.
- **Stay inside your file ownership list.** If you need a file outside it, stop and ask; don't edit it.

Gates at the end of each part:
- `npx tsc --noEmit`, and eslint on changed files.
- The focused tests, then the full `npx vitest run`. `send.test` and `company/team` are load-flaky; re-run them alone.
- **No `next build`.** The integrator builds on `main`.
- Append to `docs/IMPLEMENTATION_LOG.md` with a shell `cat >> … <<'EOF'` (the file has odd bytes).

**Merge order:** D3 (small) first. D1 Part 1 is next and is what makes the demo line work. D2 merges stage by stage.
D1 Part 2 goes whenever it's ready.

### D1 — Codex A · **Sol medium** · "Phone line + Demo Studio" (T-120, T-129, T-118, T-125, T-130 server side, T-131)
Worktree `D:/Apps/air-wt-demo-line`, branch `task/demo-line`.

**Owns:**
- `src/app/api/admin/demo-customize/**`
- `src/app/hub/demo/**`
- `src/app/api/webhooks/elevenlabs/**`
- `src/lib/voice/**`
- `src/lib/ai/agentPromptBuilder.ts`
- `src/lib/tools/agentTools.ts`: the tool **output shape** only; scheduling logic unchanged
- `src/lib/calls/endOfCallWriter.ts`
- new `src/app/api/calls/[callId]/audio/route.ts`
- `scripts/setup-elevenlabs-agent.mjs`
- new `scripts/move-demo-line-to-elevenlabs.mjs`
- `src/lib/verticals/templates.ts`: **only** the `DEMO_LINE_PHONE` constant
- `src/types/index.ts`: optional fields only
- tests next to each of these

**Must not touch:** `src/app/company/**`, `src/components/**`, `src/app/api/jobs/**`, `src/lib/jobs/**`, the rest of
`src/lib/verticals/**` (D3 owns content).

**Part 1: the line and the studio.** This is the priority, and the demo depends on it.
1. **Migration script** `scripts/move-demo-line-to-elevenlabs.mjs`. Plain ESM like `scripts/seed-demo-business.mjs`.
   - Credentials: read `FIREBASE_SERVICE_ACCOUNT_JSON` from env or `.env.local`, using the dotenv `\n` handling. **Never
     print it, and never let an exception echo the line it came from.**
   - Modes: default `--dry-run` prints a before/after diff; `--apply` writes; `--rollback` restores.
   - It reads `businesses/carlita-elevenlabs-test.elevenlabs` (`agentId`, `phoneNumberId`, `phoneNumber`) and **copies**
     it to `demo-roofing`, setting `voiceProvider: "elevenlabs"`.
   - It moves carlita's `elevenlabs` map to `elevenlabsArchived`, so `findBusinessByElevenLabsPhoneNumber`/`AgentId`,
     which use `.limit(1)`, can only find `demo-roofing`.
   - It leaves `demo-roofing.vapiAssistantId` alone (the 2-week fallback).
   - Expected values, printed in the dry run for the integrator to eyeball: agent `agent_0101m3a5z9qxenybnpjsragg7dvt`,
     number id `phnum_0801m3aknbref2w9tbhqc6ad3xzb`, +1 689 204 2643.
   - Workers cannot run `--apply`; the integrator does.
2. **`demo-customize/route.ts`.**
   - Delete `LIVE_LINE_PHONE`. The line phone comes from the tenant's `elevenlabs.phoneNumber`, formatted for display.
   - **Remove the persona push** (see D3 in §0). Replace `vapiUpdated`/`vapiError` with:
     - `lineReady`: provider is elevenlabs, `isConfigured` is true, and `buildInitiationResponse(merged, undefined, now)`
       renders.
     - `lineError`: the reason it isn't ready.
     - `greetingPreview`: the exact first message a caller hears, including the recording notice.
   - If the tenant is still on Vapi, return `lineError: "Demo line is not on ElevenLabs yet — run
     scripts/move-demo-line-to-elevenlabs.mjs"`.
   - Accept the optional fields `contactName`, `serviceArea` and `logoDataUrl`:
     - `contactName`: add it to `BusinessConfig` as optional.
     - `serviceArea`: this field already exists.
     - `logoDataUrl`: PNG/JPEG/WebP only, **never SVG**. Validate it with the logo library's own caps and helpers
       (`src/lib/branding/logo.ts`, `api/company/library/logos`). Import them; don't copy them. Store it as the default
       logo. With no logo, clear the logos.
   - Add a `GET` returning the current line state for the status card:
     - `businessName`, `industry`, `phone`, `lineReady`, `greetingPreview`
     - `seededAt`
     - `lastCallAt`: the newest `calls` doc
     - presence booleans for `ELEVENLABS_API_KEY`, `ELEVENLABS_TOOL_SECRET` and the post-call webhook secret. **Booleans
       only, never values.**
3. **Reset hygiene (T-129).** Keep both guards unchanged: the code allowlist plus the `isDemo` marker. Also keep the lock and
   the backup-before-delete.
   - Delete jobs with `db.recursiveDelete` so `updates`, `photos` and `photoBlobs` go too. Extend
     `src/test-utils/fakeFirestore.ts` if it lacks `recursiveDelete`; that is allowed.
   - Clear `customers`, `quotes`, `invoices`, `punches`, `agentActions`, the tenant's **`schedulingLocks`** (verify the path
     used in `agentTools.ts` ~line 497), and top-level `elevenlabsConversations` where `businessId == demo-roofing`.
   - Reset `library/logos` (empty, or the prospect's logo).
   - Re-import the roofing work-catalog and pricing starter kits by calling the **same helpers** the
     `api/company/work-catalog/starter` and `api/company/library/starter-kit` routes use. Extract a helper if they're inline.
   - Tests:
     - orphan photos and updates don't survive a relaunch
     - a same-slot booking succeeds after a reset
     - a tenant without `isDemo` is still refused
4. **Seed the fully worked job J-1001** from D3's `src/lib/verticals/demoSeedRoofing.ts` (contract in D3). Run
   `git merge main` first; if D3 isn't merged yet, skip this step and say so.
   - For roofing, J-1001 = `ROOFING_WORKED_JOB`. Write:
     - the job doc (status `in_progress`, `notes`, `clientEmail`)
     - its `updates` ledger as `FieldUpdate` docs (`updateId: "seed-<n>"`, `createdAt: now - minutesAgo*60_000`,
       `language`/`rawTextEn` as given)
     - findings via `copyCatalogFinding()` for each `findingItemIds` entry found in `WORK_CATALOG_STARTER.roofing`
   - Then call `writeJobProjection()` for J-1001.
   - The other seeded jobs shift to J-1002 and up, and the counter is set past the last one.
5. **Demo Studio redesign** (`hub/demo/page.tsx`, `DemoRunbook.tsx`). The target is **scannable in 10 seconds**. Top to
   bottom:
   - **Status card.** The big tap-to-call number; "Currently: <Company> · Roofing"; a green **Ready** or red reasons (from
     the GET); last call time; the greeting preview.
   - **1 · Set up the prospect.** One compact form: Company, Owner name, Email, Phone, City/service area, and a logo drop
     zone with a live thumbnail. Roofing is preselected; other industries sit behind a small "Change industry" link. One
     button: **Launch demo**. Everything is optional.
   - **After launch.** Show the greeting preview plus a row of buttons: Test call (Part 2), Open dashboard, Field QR, Try
     page.
   - **2 · Run the demo.** §2's running order as 7 numbered rows. Each row has a time chip, one bold action, one "say this"
     line, a Plan B line, and a deep link (Pipeline, Calls, Jobs or J-1001, with `?preview=demo-roofing`).
   - **3 · Reset**, at the bottom, keeping the typed-RESET confirm.
   - Remove **every** Vapi mention (`VAPI_DEMO`, the two-line layout, the "connect a Vapi number" copy). Update
     `DemoRunbook.test.tsx`.
   - `DEMO_LINE_PHONE.roofing` = `"+1 (689) 204-2643"` (roofing only; `/try/roofing` then shows it).
   - Use `.button` variants and CSS tokens, no inline hex. It must fit 375 px without horizontal scroll.

**Part 2: call quality and instant visibility.**

6. **Call quality (T-118).**
   - Tool results from `bookAppointment`, `lookupAppointment` and `cancelAppointment` gain a `sayToCaller` sentence, for
     example "You're booked for Tuesday, September 30 at 8:00 AM." IDs stay in the result, since follow-up tools need them.
   - `buildAgentPrompt` gains a provider-neutral, config-driven **"How you speak"** section. It says:
     - Never read IDs, codes or reference numbers aloud; use `sayToCaller`.
     - Short turns, one question at a time.
     - Confirm the name spelling and the address back once.
     - Never promise an email or text unless a tool result says one was sent. After hours, say "the office will confirm
       first thing".
     - When `contactName` is set: "<contactName> or someone from the team will follow up."
     - Add the bilingual invitation when `agentLanguages` includes `es`.
   - No per-industry `if`s; the vocabulary comes from the template (D3).
   - Before calling `checkAvailability` or `bookAppointment`, say a short filler ("One moment while I check the
     calendar"). This goes in the prompt, **and** in `scripts/setup-elevenlabs-agent.mjs` as the tool-level pre-tool-speech
     setting. **Verify the field name against current ElevenLabs API docs; if you can't, leave a marked TODO rather than
     guess.**
   - Count the Firestore reads before the booking transaction and remove duplicates (for example, the business doc read
     twice).
7. **Live call row (T-130, server side).**
   - When the initiation webhook resolves a tenant *and* has a `conversation_id`, it creates or merges
     `businesses/{bid}/calls/call_elevenlabs_{conversation_id}` (the **same id** the tools route and post-call use) with
     `status: "in_progress"`, `callerPhone`, `startedAt`, `provider: "elevenlabs"`.
   - Post-call **merges** into that doc: it completes it and keeps `startedAt` if its own payload lacks one.
   - Post-call also writes `appointmentIds` (appointments whose `sourceCallId` equals this call) and
     `providerIds.elevenLabsConversationId`.
   - Best-effort only: a write failure never blocks the call answer.
8. **Call audio (T-125).** Add `GET /api/calls/[callId]/audio?businessId=`.
   - Auth: the same staff/session auth as the other call routes. The call must belong to the business.
   - It fetches `https://api.elevenlabs.io/v1/convai/conversations/{id}/audio` with `xi-api-key` and streams it back as
     `audio/mpeg` with `Cache-Control: private, max-age=3600`. **Nothing is stored.**
   - A provider 404 returns our 404.
   - Post-call sets `recordingUrl` to this route, so the existing Calls and Review-card players work unchanged.
9. **Test call.** `POST /api/admin/demo-customize/test-call` with `{ phone }`. It is superadmin-only, rate-limited to 3 per
   10 min, and does `startOutboundCall` from the demo line to `phone`. The Studio remembers the owner's phone in
   `localStorage`, wrapped in try/catch.

**D1 tests (minimum):**
- The guards still refuse a real tenant.
- The reset removes the listed data.
- A launch makes no ElevenLabs/Vapi network call, and `greetingPreview` contains the company name.
- Initiation creates the in-progress row, and post-call merges into it.
- The audio route returns 401 without a session, 403 for another tenant, and streams with a mocked fetch.
- `sayToCaller` is present, the prompt contains the "How you speak" rules, and the prompt has no unconditional "you'll
  receive an email".
- The test-call route is superadmin-only.

### D2 — Codex B · **Terra medium** (Claude reviews the quote diff) · "Job loop" (T-133..T-138 + workflow cleanup)
Worktree `D:/Apps/air-wt-job-loop`, branch `task/job-loop`.

**Owns:**
- `src/app/company/**`
- `src/components/**`
- `src/app/field/**`
- `src/hooks/**`
- `src/app/api/jobs/**`
- `src/app/api/company/work-catalog/**`
- `src/lib/jobs/**`
- `src/lib/billing/jobQuote*.ts`
- `src/lib/documents/**`
- `src/types/jobs.ts` and `quote.ts`: optional fields only
- tests next to each

**Must not touch:** webhooks, `src/app/hub/**`, `src/app/admin/**`, `demo-customize`, `src/lib/verticals/**`,
`src/lib/voice/**`, `src/lib/tools/**`, `agentPromptBuilder.ts`.

`jobs/[jobId]/page.tsx` is 2,359 lines. **When you touch a tab, extract it into its own component file** (as
`QuotePanel.tsx` and `FindingsPanel.tsx` already are), with no behavior change beyond the task. Don't refactor tabs you
aren't touching.

**Stage 1: things appear by themselves, and a request becomes a job in one tap.**
1. `src/hooks/useLiveRefresh.ts` refetches on window focus and every N s while the document is visible. It pauses when
   hidden, never overlaps requests, and **skips while the page has unsaved inline edits**. Use it on:
   - Dashboard, Calls and Pipeline: 10 s.
   - The job page (job, updates, photos): 5 s.

   Rows new since the last fetch get a brief highlight. On Calls, `status: "in_progress"` with `startedAt` under 30 min
   shows a **Live** badge; older than that shows "Ended".
2. **Confirm & create job.** Add `POST /api/jobs/from-request` taking `{ businessId, appointmentId? | leadId? }`.
   - It reads the appointment or lead and builds the job:
     - title: `${serviceType} — ${address}`
     - `clientName`, `clientPhone`, **`clientEmail`**, `address`, `serviceType`
     - `notes`: the reason for the call
     - `appointmentId`/`leadId`, `sourceCallId`
     - `callSummary`, from the call doc
   - It runs `resolveCustomer()` server-side.
   - It uses the same J-XXXX counter transaction as `POST /api/jobs`. **Extract that into a shared helper; don't duplicate
     it.**
   - It is **idempotent**: a job that already exists for that appointment or lead is returned, so a double tap never makes
     two.
   - The Review card's accept → this route → navigate to the job, keeping `?preview`.
   - Add the optional Job fields `sourceCallId`, `leadId`, `callSummary`.
   - The job header shows "From call · <time> · View transcript" when `sourceCallId` is set.
   - Also make manual `POST /api/jobs` **accept `clientEmail`**, which it drops today.
   - Owner rule: this is a human tap. Nothing creates jobs automatically.

**Stage 2: Findings ⇄ Library ⇄ Quote.**

3. **Findings.**
   - A one-off finding gains an optional **Price** (one `other` line, qty 1) and a **Save to Library** checkbox. Saving
     appends a work-catalog item (add a narrow append op to the work-catalog API if none exists) and writes `itemId` back
     onto the finding.
   - **Suggested findings:** a pure `src/lib/jobs/suggestFindings.ts` ranks catalog items against `job.parsed.issues` by
     token overlap. Reuse `normalizeName` folding, and unit-test it.
   - Show the top suggestions above the checklist as "From field notes: <issue> → <catalog item> [Add]", with a count on
     the tab label.
   - Add a shared `src/components/field/FindingPickerSheet.tsx` (search catalog → tap → added) on **both** field screens.
     If the job PATCH route refuses field grants, add a narrow append-only `POST /api/jobs/[jobId]/findings` that accepts
     them (a snapshot copy, 60 max).
4. **Quote** (`QuotePanel.tsx`).
   - Opening the tab with no quote **creates the draft automatically**, using the idempotent POST.
   - Header: status chip · **Estimated total**, live · Valid until.
   - Items render as cards: **Issue** (problem) → **Work** (solution) → its priced lines (grouped by the existing
     `QuoteLine.findingId`), with qty, unit and price editable and a subtotal. Lines without a finding go under "Other
     work".
   - The main button is **+ Add item**. It opens the same catalog picker as step 3 and adds the finding to the **job**
     (`includeInQuote` and `includeInReport` both true) and to the quote, along with its lines at the Library default
     prices.
   - The secondary button is **+ Custom item** (problem, work, price, and a Save to Library checkbox).
   - Replace the blank "Description of work" with a collapsed **Intro text (optional)**, prefilled by a pure, tested
     `draftQuoteIntro(job, findings)` built from the reason for the call and the findings.
   - The three toggles move into a collapsed **"What the customer sees"** group. Each gets a one-line explanation:
     - Hide materials: materials show as one total line.
     - Hide labor details: labor shows as one total line.
     - Show technicians: prints crew names.

     Put that copy in `src/lib/documents/optionsCopy.ts` and reuse it on the invoice and report toggles.
   - **No new money math.** Totals stay on `quoteTotal`/`quoteGroups`.

**Stage 3: field updates feed the job, visibly.**

5. **Latency.**
   - Log transcription, parse and total ms in `field-audio/route.ts`.
   - Try `gpt-4o-mini-transcribe` behind a constant, falling back to `whisper-1` on error. **Only keep it if Spanish still
     works:** those models return no `language`, so use `detectLanguage()` (`src/lib/i18n/detect.ts`) on the transcript.
     Keep the Whisper prompt biasing. Tests cover the EN and ES paths, extending `src/e2e/field-audio.test.ts`.
   - On the client, show elapsed-time status text: "Uploading…", then "Transcribing…", then "Updating the job…".
6. The office job page (Stage 1 refresh) must show a new field update across Timeline, Materials, Labor, Issues and the
   finding suggestions **without a reload**. Add a component test that mocks the fetch sequence.
7. **Work complete** on both field screens, with a confirm. It calls a narrow `POST /api/jobs/[jobId]/complete` that
   accepts field grants, is idempotent and appends `statusHistory`.
   - Arrival and departure stay the existing `site_in`/`site_out` punches. Relabel the TimeClock buttons in plain words
     ("Arrived at job", "Left job", "Start lunch", "Back from lunch", "Clock in at office", "Clock out at office"); the
     punch types don't change.

**Stage 4: the job page explains itself.**

8. **Report auto-draft.** Opening the Report tab with empty notes fills them from `draftNarrative()`, extended with the reason
   for the call, arrival and departure per technician (punched labor in the projection), and the technician names. Save on
   the first edit or blur, not on open. No prices, as before.
9. **Job history.** A pure, tested `src/lib/jobs/history.ts` `buildJobHistory()` merges existing timestamps into one sorted
   list:
   - call
   - appointment created and confirmed
   - job created
   - crew assigned
   - punches
   - field updates, with the speaker
   - photos
   - findings
   - quote created, sent and answered
   - invoice created and sent
   - status changes

   The only new data is an append-only `statusHistory: {status, at, by}[]` written by the status PATCH and `/complete`.
   Render it read-only at the top of the Timeline tab ("Job history"), with the field timeline below as "Field notes". Add
   at most one lightweight extra fetch.
10. **Next-step stepper**, under the job header: Findings → Quote → Work → Report → Invoice. Each step is done, current or to
    do, derived from the job. The current step has one primary button that opens its tab. Reorder the job tabs to match:
    Timeline · Photos · Issues · Findings · Quote · Materials · Labor · Report · Invoice.
11. **Workflow cleanup.** Bounded; this is not a redesign.
    - **Customers in the nav.** A `/company/customers` page that reuses `CustomersSection`, labelled with `vocab`. Keep the
      Library tab or link it there. It must follow the Navigation Completeness Rule.
    - **Jobs list stage filters:** Needs quote · Quote sent · In progress · Ready to invoice · Invoiced, plus quote and
      invoice status chips per row. This covers the Quotes and Invoices lists Jobber users expect, without new pages.
    - Every empty state gets one line on what to do next and one button.
    - Remove remaining Vapi wording from company pages. For example, the dashboard agent tile becomes "Phone line:
      <number>".

**D2 tests (minimum):**
- `useLiveRefresh` pauses when hidden and skips when dirty.
- `from-request` is idempotent, carries the email and `sourceCallId`, and resolves the customer.
- `POST /api/jobs` keeps `clientEmail`.
- `suggestFindings`, `draftQuoteIntro` and `buildJobHistory` have unit tests.
- Save to Library appends to the catalog.
- The quote picker adds a finding and its lines with Library prices.
- `/complete` accepts a field grant and rejects a grant for another job.
- The field-audio EN/ES paths still pass.

### D3 — Deepseek · **V4 Flash, Think High** · "South Florida roofing content" (T-132)
Worktree `D:/Apps/air-wt-roofing`, branch `task/roofing-content`. Content only, no logic.

**Owns:**
- `src/lib/verticals/templates.ts`: the **roofing block only**, not `DEMO_LINE_PHONE` and not other verticals
- `src/lib/verticals/workCatalogStarter.ts`: the `roofing` array only
- new `src/lib/verticals/demoSeedRoofing.ts`
- its test

1. **Roofing template.**
   - `approvedServices`, most common first. `demoSeed` uses the first four for seeded titles. Suggested order: Roof
     inspection · Roof leak repair · Tile roof repair · Flat roof repair · Roof replacement · Emergency tarping · Wind
     mitigation inspection · Gutter repair.
   - `approvedFaqs`: spoken-friendly answers of at most 2 sentences, with no lists, URLs or unexplained abbreviations. Cover:
     - tile vs. shingle vs. flat vs. metal
     - "do you work with insurance claims" (we document the damage with photos and a report for your insurer; we don't
       give coverage advice)
     - hurricane prep and emergency tarping
     - wind-mitigation and 4-point inspections
     - "how long does an inspection take"
     - "do you pull permits" (yes, when the job requires one; the estimator confirms on site)
   - **Never claim a license number, insurance coverage, a code section or a price.**
   - `emergencyRules`: add active leak during rain, storm damage exposing the deck, and a tree on the roof.
   - The `vocab.voiceExample` line uses tile ("six cracked tiles on the south slope").
2. **Starter catalog:** add missing/slipped tile, fascia/soffit rot, flat-roof membrane blister, flat-roof membrane split,
   failed sealant/mastic, drip edge, emergency tarp, and wind-mitigation inspection. Match the existing `roof()` item style
   and include example priced lines. Keep the itemIds `starter-roofing-<slug>` stable, and don't rename existing ones.
3. **`demoSeedRoofing.ts`**, exactly this contract (D1 imports it):
   ```ts
   import type { ParsedUpdate } from "@/types/jobs";
   export interface WorkedJobSeed {
     title: string; clientName: string; clientPhone: string /* +1305555xxxx */; clientEmail: string /* @example.com */;
     address: string /* South Florida */; serviceType: string /* one of roofing approvedServices */;
     notes: string /* the caller's reason, as the AI captured it */;
     updates: Array<{ rawText: string; submittedBy: string; minutesAgo: number; language: "en" | "es"; rawTextEn?: string; parsed: ParsedUpdate }>;
     findingItemIds: string[] /* must exist in WORK_CATALOG_STARTER.roofing */;
   }
   export const ROOFING_WORKED_JOB: WorkedJobSeed;
   ```
   Use three updates:
   - "Marco" arrives at 8
   - the findings: cracked tiles and a split pipe boot, **with one update in Spanish**
   - departure with hours

   Use two or three findings. `parsed` must be internally consistent (timeline, materials, labor with hours, issues,
   `invoiceSuggestions: []`).
4. **Test** `demoSeedRoofing.test.ts`: every `findingItemIds` entry exists, `serviceType` is in `approvedServices`, and the
   parsed arrays are well-formed. Existing template and catalog tests still pass.

---

## 4. Jobber-style coverage (what "simple but complete" means here)

| A field-service suite does… | We have | This plan | Later (not now) |
|---|---|---|---|
| Requests from calls, web and email | AI phone intake → Pipeline review ✓ | One-tap request → job (D2) | Email intake (T-109), web request form |
| Clients / CRM | Customers entity + instant search ✓ (a Library tab) | Top-level Customers page (D2) | — |
| Quotes | Draft, send, record the answer ✓ | Library picker, auto-draft, explained options (D2) | Online approval, optional line items |
| Jobs, scheduling, dispatch | Jobs, Calendar Powerboard, crew email ✓ | Next-step stepper, stage filters (D2) | Recurring jobs |
| Tech mobile app | Field QR, **voice notes EN/ES**, photos, time clock ✓ | Live office view, findings from the field, Work complete (D2) | Checklists / forms |
| Invoices and payments | Invoices ✓ | — | Online payment and reminders (Stripe, T-126, held) |
| Timesheets | Punch ledger ✓ | Arrival and departure in report and history (D2) | Payroll export |
| Customer portal, reviews, follow-ups | — | — | Client hub, review requests, quote follow-ups |

Our differentiator in the demo is **the phone AI and voice field notes writing straight into the job record**. Keep the UI
to one obvious next action per screen rather than adding modules.

## 5. Integrator steps (Claude, after each merge)

1. **Merge D3**, then **D1 Part 1** → run `node scripts/move-demo-line-to-elevenlabs.mjs` (dry run, then `--apply`) →
   **redeploy** (flushes the TTL-less lookup caches in `businessLookup.ts`) → `curl /api/health`.
2. Set `demo-roofing`'s escalation phone to the **owner's cell** (never a prospect's). Check the ElevenLabs agent saves call
   audio (MCP `agents_get`), and apply the pre-tool-speech setting with `scripts/setup-elevenlabs-agent.mjs --apply
   --agent-id …`.
3. Launch "Test Roofing Co" from Demo Studio, then place **5 scripted calls** with the owner: booking, a tile question,
   insurance, off-topic and an emergency. Pass means no ID read aloud, no gap over 2 s, the name spoken correctly, a Live row
   during the call, and a recording after.
4. Merge D2 stage by stage, `next build` on `main`, deploy, and live-check each stage on the demo tenant.
5. Update the playbooks for the new line and flow: `public/guides/onboarding-guide.html`, the `/hub/guide` Demo Playbook tab,
   `docs/NEXT_SESSION.md` (CLAUDE.md requires this when the demo number changes).
6. The owner does 3 dry runs (see the definition in §2).

## 6. Worktree policy (clean up as we go)

- One worktree per task: `D:/Apps/air-wt-<task>`, with `node_modules` junctioned to the main repo's.
- When a branch merges and the same worker continues in the same area, **reuse** the worktree: `git -C <wt> switch -c
  <next-branch> main`.
- When a line of work is finished, the integrator removes it. Unlink the junction first with
  `[System.IO.Directory]::Delete("<wt>\node_modules", $false)`, then `git worktree remove <wt>`, then
  `git branch -d <branch>`.
- 2026-09-25: removed `air-wt-documents-core`, `air-wt-guide-2`, `air-wt-report`, `air-wt-request-review` and
  `air-wt-smoke` (all merged). `.kilo/worktrees/*` isn't ours; leave it.

---

## 11. Onboarding: the minimum to go live (later, T-140)
- **Ask only for:** business name, industry, owner name/email/mobile (the login and escalation number), hours and
  timezone, service area, a confirm of the template's services, the notification email, and a logo.
- **How calls arrive:** they keep their number and forward it (always, or on no-answer/after hours) to a number we
  provision. The initiation webhook resolves the tenant by `called_number`, so forwarding needs no special handling.
- **Defaults instead of questions:** seats (counted from invites), roles (owner = admin, techs = field), Library (starter
  kit, edited in week 1), FAQs and rules (template), crews (as techs are invited), payment (held), integrations (none
  needed).
- **One-button number provisioning:** buy a Twilio number → import it into ElevenLabs → assign the shared agent → store it
  on the tenant. This is T-112(m).
- **"Convert this demo to a customer":** copy the Studio profile, logo and Library into a *new* tenant.

## 12. Their existing company email
1. **Default, no setup:** send from `crm@luxordev.com` under their company name, with **Reply-To = their office email**.
   Replies land in their normal M365 or Google inbox.
2. **Optional, 10 minutes of DNS (T-141):** verify their domain in Resend on a **subdomain** (for example
   `notify.theirco.com`) so we never touch the root SPF/DMARC that M365/Google own.
3. **Avoid** sending through their mailbox via OAuth (Graph or Gmail API). It brings a Google restricted-scope security
   assessment, M365 admin consent, and silently expiring tokens.
4. **Inbound (T-109):** a per-tenant intake address plus a forwarding rule. M365 blocks external auto-forwarding by default,
   so their admin must allow it. Confirm which inbound provider to use before building.

## 13. Storage and reliability (verified)
**There is no Cloudinary.** Photos are base64 inside Firestore, and calls, bookings, jobs and photos all share **one Spark
project**.
- **Spark caps:** 1 GiB of storage in total, 50k reads and 20k writes a day. That's about 1,100 full-size photos, which one
  busy roofer fills in about 5 weeks. **When a Spark quota is hit, Firestore refuses writes, so calls, bookings and voice
  updates stop saving for every tenant.** Fine for demos, not for paying customers. The owner decides before the first
  paying customer: Blaze plus Cloud Storage for photos, via the `src/lib/photos/store.ts` seam (T-128).
- **No backups on Spark.** Scheduled export comes with Blaze.
- **Vercel Hobby forbids commercial use.** Move to Pro before the first invoice (NH-27).
- **Resend plan limits:** check them before 2–3 tenants are live.
- **Post-call webhook failure loses the call.** T-142: an hourly cron backfills missing calls from ElevenLabs'
  conversation list.
- **`writeJobProjection` race.** It reads all updates and then updates, with no transaction, so two technicians updating at
  once can leave one update out of the projection until the next write. T-143: recompute in a transaction.
- **ElevenLabs Creator concurrency** (about 10 calls) is fine for the first customers.
