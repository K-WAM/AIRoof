# Demo feedback, round 2: worker plan for Codex + Deepseek (2026-09-25)

## Context

The owner ran the roofing demo live on the ElevenLabs line. Round 1 found the bugs: escalated calls missing from the Pipeline, "Invalid session" on invoicing, confusing job tabs, materials showing through "hide materials", and parse failures.

Round 2 adds requests. The owner wants the rest built by **Codex and Deepseek workers**, using paste-ready prompts. This file is the spec. At step 0 the integrator copies it into the repo as `docs/DEMO-FEEDBACK-PLAN.md`, so workers can read it. The prompts go into `docs/WORKER_QUEUE.md` section **E**.

### Already done (on branch `fix/demo-feedback-0925`, not pushed)
- **`58ed94b`:**
  - Blank/empty model text no longer fails the parse; there is a Retry for failed field notes.
  - Session refresh: the `__session` cookie now carries the real token expiry, with a refresh before expiry, a refresh on focus, and a single 401 retry.
  - Order is Complete → Invoiced. A job becomes Invoiced when the invoice is **sent**, and there is a "Mark paid" button.
  - A sent invoice's editor is locked.
  - Status clicks check the response.
  - Time-clock punches re-project Labor.
- **`43a6aa0`:**
  - An escalation creates an Urgent lead, one lead per call (`lead_call_{callId}`).
  - End-of-call safety net `src/lib/calls/callLead.ts`.
  - Roofing emergency rules and the prompt no longer escalate a small drip.
  - The agent reads the full phone number back when asked.
  - Pipeline/Calls chips and one primary action per lead; `fmtPhone`.
- **`28affdd`** (step 0):
  - `JobQuote.answeredAt`, set by Mark accepted/declined.
  - The QuotePanel status/lock banner and an `onQuoteChange` prop.
  - The history "Invoice paid" event.

**Step 0 is done (2026-09-26):**
- Local `main` was fast-forwarded to `28affdd`. It holds all of the above. **Not pushed.**
- Full vitest green: 1,184 tests; `company/team` and `vapi` timed out under load and pass alone.
- `next build` green.

### Owner decisions (both rounds)
- **Job tabs:** plain record tabs on the left (Activity, Photos, Materials, Labor). Numbered, highlighted workflow tabs on the right: ① Findings ② Quote ③ Report ④ Invoice. The Issues tab merges into Findings.
- **Completion:** the crew **cannot** mark a job complete any more. Only the office can (status bar or the "Next" button).
- **Jobs:** never auto-created. Escalations and the safety net create *leads* only.
- **Reports:** price-free unless the owner ticks "Include quote" on that report. This amends decision D5.
- **Legal wording:** editable defaults, pre-filled with DRAFT Florida wording. They stay **off** on documents until the owner ticks "reviewed" (attorney review is NEEDS-HUMAN). Nothing unreviewed reaches a customer.
- **Photos on documents:** Before | After side by side, 4 pairs per page, caption under each photo, drag-and-drop ordering. This applies to the quote, the invoice and the report.

### Answers to the owner's questions (verified in code)
- **How is the Pipeline Follow-up Queue filled?**
  - From calls only: the AI's `createLead` tool, escalations (since `43a6aa0`), the end-of-call safety net, and the unverified-caller fallback on lookup/cancel.
  - The demo seed also writes some.
  - There is no manual "add lead", no web form, and email intake (T-109) is not built.
  - Appointments come only from the AI's `bookAppointment`, plus the demo seed.
- **Does the AI really check the calendar for conflicts? Partly.**
  - `checkAvailability` reads existing appointments **and** jobs scheduled on the Calendar (`agentTools.ts:396-458`).
  - But the booking itself (`bookAppointment`, `:477-638`) only guards against *unassigned* appointments. It ignores scheduled jobs and crew-assigned bookings, so the AI can book over a job.
  - Cancelling or declining never frees the time slot. The next caller is offered a free slot, then told "just taken".
  - There is no Google Calendar; bookings are `calendarProvider: "mock"`.
  - **E2 fixes all of this.**
- **Which AI reads field notes, and how is it recharged?**
  - Voice is transcribed by **OpenAI Whisper** (`whisper-1`). Text is parsed by **OpenAI GPT-4o** (`src/lib/ai/registry.ts:61`). Both are billed to the OpenAI account (`OPENAI_API_KEY`).
  - **DeepSeek** (`deepseek-chat`, `DEEPSEEK_API_KEY`) only classifies finished calls.
  - When DeepSeek credits run out, classification fails **silently**. The new lead safety net is skipped with it. There is no fallback today; E2 adds an OpenAI fallback.
  - The phone agent's own LLM and voice are billed by ElevenLabs.
  - Top-up steps, account owners and a monthly-cost table go into `docs/AI-PROVIDERS.md` (E4) and project memory.
- **Are all jobs logged?**
  - Yes. Every job stays in Firestore forever; nothing deletes or archives it.
  - **But the Jobs list only loads the newest 100** (`api/jobs/route.ts:35`, no paging). Older jobs are unreachable except through the customer page or a direct URL.
  - There is no export. **E2 adds "Load older", a server status filter, and a CSV export.**
- **The field buttons that said "Forbidden" were the time-clock buttons.**
  - Their endpoint `/api/timeclock/punch` has no job id in the URL. `verifyFieldAccess` pins a QR grant to the job id in the path (`verifyRole.ts:357, 557`), so every punch 403s.
  - The QR page also starts with `businessId = "demo-roofing"` and fetches the time clock before the real session loads.
  - **E1 fixes this.**
- **"+ Finding" list cut off:**
  - `.sheet` uses `max-height: 88vh` (wrong on phones because of the browser toolbars) and has one scrolling box with no inner list scroller (`globals.css:2564-2584`, `Sheet.tsx`).
  - Safe-area padding is inert because the viewport lacks `viewportFit: "cover"`.
  - **E3 fixes this.**
- **Team overview and lock:**
  - A Team panel exists inside Settings (owner-only): invite, role, and Remove (`active: false`).
  - It has no invited-vs-signed-in status and no last sign-in.
  - "Remove" doesn't disable the login, and the member cache takes up to 30 s to notice.
  - A **viewer** can still post field notes and complete jobs.
  - There is no way to revoke QR links.
  - **E1 builds a Team page with lock/unlock and restrictions.**
- **Reverse chronological order:**
  - These lists are already newest-first: Calls, leads, Jobs, Customers.
  - These are oldest-first and get fixed: Pipeline "Past & Cancelled", job field updates, job history, the work log.
  - Two queries also *lose recent data*: appointments (`startTime asc` + limit returns the oldest 500) and the dashboard's "today" (`order=asc&limit=200`).
  - "Upcoming" lists stay soonest-first on purpose.
  - Fixes: E2 (lists and queries) and E3 (the job page).
- **The invoice must be a better version of the Roof Doctor reference, with similar wording.**
  - The reference is `docs/Roof Doctor's Invoice.pdf`, described in `HANDOFF.md:160-194`.
  - Ours lacks:
    - the "per your request we dispatched… technicians identified the following" opening;
    - the "debris removed / see enclosed photos / requesting payment" closing;
    - the thank-you line;
    - qty × rate columns;
    - a labelled "License #";
    - a work order / PO reference;
    - photos.
  - Our preview and email also disagree on Terms (the email always prints a due date). **E5 fixes the wording; E6 adds the photos.**
- **Photo system today:**
  - Label (caption) and Before/After/Other phase exist.
  - The report pairs Before and After *by position only*.
  - There is **no drag-and-drop** (`sort` is never written).
  - Quotes and invoices show **no photos**.
  - The report email posts up to 12 base64 photos in the request body, which likely exceeds Vercel's 4.5 MB limit.
  - **E6.**

---

## Step 0: integrator (Claude), before any worker starts
1. Finish the uncommitted slice-3 work:
   - Type-check.
   - Add a test for `answeredAt` in `quote/route.test.ts`.
   - Commit ("fix(quote): record when the customer answered; locked-quote banner").
2. Gates on the branch: `npx tsc --noEmit`, the full `npx vitest run`, `npx next build`.
3. Merge `fix/demo-feedback-0925` into local `main` (fast-forward). **No push until the owner says so.**
4. Copy this file to `docs/DEMO-FEEDBACK-PLAN.md`. Add section E (the prompts below) to `docs/WORKER_QUEUE.md`, and Phase 25 rows (E1–E6) to `TODO.md`. Commit on `main`.
5. For each wave-1 worktree:
   - Create it: `git worktree add ../<wt> -b <branch> main`.
   - Junction `node_modules`.
   - Copy `graphify-out/` into it.

## Waves and file ownership (no two workers edit the same file at the same time)

Model names as they appear in the owner's pickers. Codex: **GPT-6 Sol** (risky: auth, live calls, legal, money) or **GPT-5.5 Terra** (spec'd UI), each with an effort level. Deepseek: **V4.1 Flash, Thinking: Hard** (the owner's default).

| Wave | Task | Worker, model | Worktree / branch |
|---|---|---|---|
| 1 | **E1** Field access + Team page | Codex A, **GPT-6 Sol, medium** (auth) | `D:/Apps/air-wt-access` / `task/access-team` |
| 1 | **E3** Job page restructure | ~~Codex B~~ **Integrator (Claude) finishes it** (2026-09-26: Codex B stopped after tabs/CSS/sheet/time-sort; the remainder is the hot 2,450-line page). Codex B's partial commits are kept. | `D:/Apps/air-wt-job-page` / `task/job-page` |
| 1 | **E4** Docs, legal memo, AI providers, seeded call transcripts | Deepseek **V4.1 Flash, Thinking: Hard** | `D:/Apps/air-wt-docs-legal` / `task/docs-legal` |
| 2 (**start now**, 2026-09-26) | **E2** Scheduling truth + lists + jobs log | **Codex B**, **GPT-6 Sol, medium** (live call path). Moved from Codex A: its files do not overlap E1's or E3's, and Codex B is free. | `D:/Apps/air-wt-schedule-lists` / `task/schedule-lists` |
| 2 (after E3 + E4) | **E5** Documents: invoice wording, report fixes, Terms & notices | Codex B, **GPT-6 Sol, medium** (legal wording, customer documents) | `D:/Apps/air-wt-documents-2` / `task/documents-2` |
| 3 (after E5) | **E6** Photos on documents + drag-and-drop | Codex B, **GPT-5.5 Terra, medium** | `D:/Apps/air-wt-photos` / `task/doc-photos` |

Hot files and their owners:
- `src/app/company/jobs/[jobId]/page.tsx`: E3 in wave 1, then E5, then E6.
- `src/lib/documents/**`: E5, then E6.
- `src/lib/auth/verifyRole.ts`: E1 only.
- `src/lib/tools/agentTools.ts`: E2 only.
- `src/app/globals.css`: E3 in wave 1 (others use existing classes).

---

## E1: Field access + Team page (Codex A, GPT-6 Sol, medium)
**Owns:**
- `src/lib/auth/verifyRole.ts`, `src/lib/auth/memberCache.ts`
- `src/app/api/timeclock/punch/route.ts`, `src/components/field/TimeClock.tsx`
- `src/app/field/page.tsx`, `src/app/company/field/page.tsx`
- `src/components/field/WorkCompleteButton.tsx` (delete), `src/app/api/jobs/[jobId]/complete/**`
- `src/app/api/company/team/**`, `src/lib/team/**`, `src/types/team.ts`
- `src/app/company/settings/TeamPanel.tsx`, new `src/app/company/team/page.tsx`
- `src/app/company/company-nav.tsx` (Team link)
- `src/app/api/auth/profile/route.ts`
- `src/app/company/layout.tsx` (only the locked-out message and MODULE_ROUTES if needed)
- `src/components/field/fieldButtons.test.tsx` (remove only the WorkComplete block)
- tests next to each of these
- **Widened 2026-09-26 (owner-integrator decision, after E1's question):** for steps 3-5 you may also make **one-line / minimal edits** to exactly these files and no others:
  - `src/types/jobs.ts` (the stale comment near `:126` only)
  - `docs/DEMO-DAY-RUNBOOK.md` (line ~68) and `docs/DEMO-READINESS-PLAN.md` (the "Work complete" lines only; do NOT touch the D5 row)
  - `src/app/api/jobs/[jobId]/updates/route.ts`, `field-audio/route.ts`, `findings/route.ts`, `photos/route.ts`, `photos/[photoId]/route.ts`, `src/app/api/transcribe/route.ts`: the "Crew (no name given)" label and the viewer-write gate only
  - Design for step 5: add `options.write?: true` to `verifyFieldAccess`. A real logged-in session then needs owner/staff/superadmin. A `field:` QR grant still passes if pinned to that job. **Do not decide by role alone: the QR grant's synthetic user has role "viewer".** Read-only handlers (GET) stay open to viewers.

**Must not touch:** `jobs/[jobId]/page.tsx`, `globals.css`, `Sheet.tsx`/`FindingPickerSheet.tsx`, anything under `src/lib/documents`, `agentTools.ts`.

1. **Time clock works from a QR phone.**
   - Add an explicit option to `verifyFieldAccess(req, businessId, { jobId })`.
   - For a job-pinned grant, the supplied `jobId` must equal the grant's job.
   - Site punches (`site_in`, `site_out`, `break_*`) pass the body's `jobId`. Office punches (`office_in`, `office_out`) are allowed for a grant, because they're the worker's own day, not a job action.
   - Use it in `punch/route.ts` (GET and POST).
   - **Negative tests first:** a grant for job A punching job B is refused, a wrong business is refused, an expired grant is refused, and a QR punch on its own job is allowed.
2. **`/field` stops fetching before the session is known.**
   - Remove the `"demo-roofing"` default (`field/page.tsx:47`); render TimeClock only once `/api/field/session` returns.
   - TimeClock shows human errors ("This link has expired — ask the office for a new QR code"), never a raw "Forbidden".
   - `refresh()` clears the error.
3. **Remove field completion.**
   - Delete `WorkCompleteButton` and its render sites in both field screens.
   - Keep `POST /api/jobs/[jobId]/complete`, but gate it with `verifyAuthAndRole(["owner","staff","superadmin"])`. The office "Next: Mark work complete" button (E3) may reuse it; otherwise the office uses the status PATCH.
   - Update the tests and the stale comments/docs listed in the investigation (`types/jobs.ts:126`, `DEMO-DAY-RUNBOOK.md:68`, `DEMO-READINESS-PLAN.md:345,392,454`).
4. **Worker name on the QR screen.**
   - The name field becomes required before the first voice/text update, photo or punch: one inline prompt, remembered per device as today.
   - The server fallback label becomes "Crew (no name given)" instead of "field-worker" (`field-audio/route.ts:165,205`). Also use it in `updates/route.ts`.
5. **Viewer role is read-only.** Field writes (updates, audio, photos, findings, punches) need owner/staff, or a QR grant for that job. A logged-in viewer may read, but not post. Update `verifyFieldAccess` callers accordingly; test it.
6. **Team page `/company/team`** (owner and superadmin; add it to the company nav).
   - A table of every member: name, email, role, title, status, last sign-in, invited date.
   - Status is one of:
     - **Invited**: never signed in (Admin SDK `getUsers` → `metadata.lastSignInTime` is null);
     - **Active**;
     - **Locked**.
   - Actions: change role (restrict), **Lock** / **Unlock**, Resend invite, Remove.
   - **Lock** does all of the following:
     - sets `active:false`, `lockedAt` and `lockedBy`;
     - calls `auth.updateUser(uid,{disabled:true})` and `auth.revokeRefreshTokens(uid)`;
     - invalidates the member cache.
   - **Unlock** reverses it.
   - The last-owner guard stays.
   - `/api/auth/profile` returns `locked: true` for an inactive member. The company layout then shows "Your access has been turned off — contact your administrator" instead of the app.
   - A **"Revoke all field QR links"** button rotates the business `fieldKey`. Confirm first; it kills every QR session at once.
   - The Settings TeamPanel becomes a short summary that links to the Team page.
7. **Gates:** `npx tsc --noEmit`, eslint on changed files, focused tests, then the full `npx vitest run`. No `next build`. Mobile at 375 px, one-teal `.button`, `jsonWithCache` noStore on team routes.

## E2: Scheduling truth, list order, jobs log (Codex A, GPT-6 Sol, medium, after E1 merges)
**Owns:**
- `src/lib/tools/agentTools.ts` (scheduling functions only: `buildAvailableSlots`, `checkAvailability`, `bookAppointment`, `cancelAppointment`, lock helpers)
- `src/app/api/appointments/**`, `src/app/api/businesses/[businessId]/appointments/**`
- `src/app/api/jobs/route.ts` (GET list), new `src/app/api/jobs/export/route.ts`
- `src/app/company/jobs/page.tsx`, `src/app/company/pipeline/page.tsx`, `src/app/company/dashboard/page.tsx`, `src/components/CommandBar.tsx` (if the jobs fetch changes)
- `src/app/api/admin/usage/route.ts`
- `src/lib/ai/registry.ts`, `src/lib/ai/deepseekClient.ts` (`classifyCallOutcome` only)
- tests

**Must not touch:** `jobs/[jobId]/**`, auth files, `src/lib/calls/**` (read only).

1. **One conflict rule for both tools.**
   - Extract `isSlotBusy(window, appointments, jobs)` from `buildAvailableSlots`.
   - `bookAppointment`'s transaction must refuse a slot that overlaps any non-cancelled appointment (assigned or not) or any job with `scheduledStart`/`scheduledEnd`, business-wide, the same rule checkAvailability uses.
   - Keep the `schedulingLocks` transaction and business-hours checks.
   - Tests: booking over a Powerboard job is refused; booking over a crew-assigned appointment is refused; a free slot books.
2. **Free the slot on cancel.** `cancelAppointment` and the owner decline route (`api/appointments/[appointmentId]/route.ts:88`) delete that appointment's `schedulingLocks` buckets in the same transaction. Test: cancel, then rebook the same time.
3. **Appointment lists never lose recent data.**
   - Upcoming appointments must never disappear, however many old ones exist.
   - Pipeline "Past & Cancelled" is newest-first.
   - The Dashboard's "today" and "pending" query their date window (`from`/`to`), not `order=asc&limit=200`.
   - "Needs confirmation" and "Upcoming" stay soonest-first.
4. **Jobs log.**
   - `GET /api/jobs` gains cursor paging (`before=<createdAt>`, page 100) and a server-side `status` filter.
   - The Jobs page gets "Load older jobs". A search with no hits in the loaded pages offers "Search older jobs", which loads more pages.
   - Add `GET /api/jobs/export?businessId=` (owner/staff, noStore): a CSV of every job (id, title, customer, phone, address, status, created, completed, invoice id, invoice status, total). Add an "Export CSV" button on the Jobs page.
5. **Newest-first everywhere history-like:** audit the pages you own against the list in this plan's "Answers" section. Admin usage gets sorted by business name.
6. **Call classification fallback.**
   - If DeepSeek errors (including no credits), retry `classifyCallOutcome` once on OpenAI `gpt-4o-mini` through `selectClient` overrides, and log `classify fell back to OpenAI`.
   - Also fix `selectModel` ignoring `backOfficeModel` (`registry.ts:91-96`).
   - Test with mocked clients.
7. **Gates:** same as E1. No live calls. Run the agent-tool tests: `src/lib/tools`, `src/lib/vapi`, `src/app/api/webhooks`, `src/e2e`.

## E3: Job page restructure (Codex B, GPT-5.5 Terra, medium; starts after step 0)
**Owns:**
- `src/app/company/jobs/[jobId]/**`: `page.tsx`, `FindingsPanel.tsx`, `QuotePanel.tsx`, `JobHistory.tsx`, `JobStepper.tsx` (delete), and new sibling components
- `src/lib/jobs/nextStep.ts`, `src/lib/jobs/projection.ts` (sort only), `src/lib/jobs/history.ts`
- `src/components/ui/Sheet.tsx`, `src/components/field/FindingPickerSheet.tsx`
- `src/app/globals.css` (job tabs + sheet)
- `src/app/layout.tsx` (viewport only)
- tests

**Must not touch:** the field pages (E1); the Report and Invoice *document rendering* beyond moving their error banners (E5 owns those next).

1. **Tab bar** (`page.tsx` `TABS` ≈ `:780`, bar ≈ `:956`).
   - Left: **Activity (N updates)** (keep id `timeline` for links), Photos, Materials, Labor.
   - After a divider: numbered highlighted pills **① Findings ② Quote ③ Report ④ Invoice**.
   - Each pill shows ✓ when its `jobSteps()` step is done, and a ring on `currentStep()`.
   - The Quote pill shows a small "Sent"/"Accepted" label. The page loads the quote once (`GET /api/jobs/[id]/quote`) and `QuotePanel` keeps it current via `onQuoteChange`.
   - Move the styles into a `.job-tabs` class: `overflow-x:auto; overflow-y:hidden` (this kills the scroll arrow). Tap targets ≥ 44 px; scrolls horizontally at 375 px.
2. **Header.**
   - Replace "Generate Report"/"Generate Invoice" with one primary **"Next: …"** button from `currentStep()`. It opens that tab; the Work step marks the job complete via the status PATCH.
   - Delete `JobStepper` (this removes "Every step is done" from every tab).
   - Invoice tab with no invoice: a "Create invoice" button (no auto-create).
   - Move the `reportError`/`invoiceError` banner into those tabs.
3. **Activity tab.**
   - The Field Updates card (≈ `:1877`) moves inside Activity only.
   - Order, all newest first: field updates → work log → job history (last 5 plus "Show all"). Reverse at render; `buildJobHistory` stays chronological.
   - Fix the work-log time sort in `projection.ts:163-168` (parse "8:00 AM" / "08:00" / "13:30" into minutes).
4. **Issues → Findings.**
   - Remove the Issues tab, and `"issues"` from the Edit-bar list.
   - `FindingsPanel` gets **"Reported by crew (N)"** from `job.parsed.issues`: a severity chip, the text, and one action. The action is "＋ Add {Library item}" when a per-issue `suggestFindings()` match exists, else "＋ Add as finding" via `customFinding()`. Rows already added show "Added ✓".
   - This replaces the "From the field notes" box.
5. **Numbered findings:** a numbered badge 1, 2, 3, a tinted header band, and a clear gap between cards.
6. **Lock notes.** A one-line note on Findings/Materials/Labor/Activity when a sent quote or a sent invoice won't pick up changes, e.g. "Invoice INV-1002 was sent Sep 25; changes here won't change it". It does not block editing.
7. **Dates:** every `toLocale*` on the page, including the "From call" line (≈ `:836`), becomes `useFormat()` (`fmtDayTime`, business timezone).
8. **Picker sheet cut off.**
   - `.sheet`: `max-height: min(88dvh, calc(100dvh - 24px))`, a flex column, fixed title/search, and the list in its own `overflow-y:auto; min-height:0; overscroll-behavior:contain` container.
   - `viewportFit: "cover"` in `src/app/layout.tsx` so the safe-area padding works.
   - Check at 375 px and on desktop that the last item is fully visible.
9. **Gates:** same as E1, plus a Playwright check of the job page at 1280 px and 375 px (tabs, no scroll arrow, Activity order, picker bottom visible).

## E4: Docs, legal memo, AI providers, seeded call transcripts (Deepseek V4.1 Flash, Thinking: Hard)
The rubric normally sends legal wording to Sol. Here the memo is only a *draft for an attorney*. Three gates sit between it and any customer: the integrator's review, the attorney's review, and E5's approval flag (nothing renders until the owner approves). So the cheap model is safe for the first draft.

**Owns:**
- new `docs/AI-PROVIDERS.md`, new `docs/FLORIDA-DOCUMENT-NOTICES.md`
- new `src/lib/documents/legalNotices.ts` + its test
- `src/lib/verticals/demoSeed.ts`
- `src/app/api/admin/demo-customize/route.ts` (seed-writing block only, ≈ `:418-443`)
- `docs/DEMO-READINESS-PLAN.md` (D5 line only), `docs/NEXT_SESSION.md` (one update line)

Nothing else.

1. **`docs/AI-PROVIDERS.md`**, one table row per paid service:
   - Services: OpenAI (Whisper `whisper-1`, GPT-4o parsing, gpt-4o-mini), DeepSeek (`deepseek-chat` call classification), ElevenLabs (phone agent + voice), Twilio (number), Resend (email), Vapi (retired, still billed?), Vercel, Firebase.
   - Columns: what it does in the app, env var names (names only, never values), what breaks when the balance runs out, where to recharge (dashboard URL, marked "verify"), and account owner ("owner to fill").
   - Add a "what to check first when something stops" section.
2. **`docs/FLORIDA-DOCUMENT-NOTICES.md`**, headed **"DRAFT, not legal advice, attorney must review"**. For each notice give: what it is, statute, when it applies (residential? contract over $2,500? direct contract with the owner?), which document (quote/contract vs invoice), and suggested wording.
   - Statutory notices: the Construction Lien Law notice (§713.015); the Homeowners' Construction Recovery Fund notice (§489.1425); the construction-defect notice (§558.005); license number on offers (§489.119(5)(b)); deposit rules (§489.126).
   - General quote/invoice terms: quote validity, material price increases, concealed/hidden damage and change orders (e.g. rotted decking at unit prices), permit and inspection fees, weather and hurricane-season delays, payment terms, late payment, workmanship warranty placeholder.
   - Mark every statutory quote "verify verbatim against the current Florida Statutes".
3. **`src/lib/documents/legalNotices.ts`**: exactly this contract (E5 imports it):
   ```ts
   export type NoticeDoc = "quote" | "invoice";
   export interface LegalNoticeDefault {
     id: string;                  // "fl-lien-713", "fl-recovery-fund-489", "fl-defect-558", "quote-validity", "hidden-damage", "price-escalation", "permits", "weather-delays", "payment-terms"
     title: string;
     appliesTo: NoticeDoc[];
     statutory: boolean;          // true = only when residential and total > thresholdUsd
     thresholdUsd?: number;       // 2500 for the statutory ones
     text: string;                // DRAFT wording from the memo; {businessName} / {licenseNumber} placeholders allowed
   }
   export const FLORIDA_NOTICE_DEFAULTS: LegalNoticeDefault[];
   ```
   A small test checks the ids are unique, every statutory notice has a `thresholdUsd`, and no text is empty.
4. **Seeded demo calls get transcripts.**
   - Each seeded call gets 3–5 realistic turns matching its seeded lead or appointment (use the vertical's services and vocab, never "roofing" words for other industries), plus a deterministic `callId` and `durationSecs`.
   - Link the seeded leads and appointments with `sourceCallId`, so "This call produced" works in the demo.
   - Update `demoSeed.ts` types and tests.
5. **Doc lines:**
   - D5 in `docs/DEMO-READINESS-PLAN.md`: "Reports carry no prices unless the owner ticks Include quote (2026-09-25)".
   - One line in `docs/NEXT_SESSION.md` pointing to `docs/DEMO-FEEDBACK-PLAN.md`.
6. **Gates:** `npx tsc --noEmit`, eslint on changed files, `npx vitest run src/lib/verticals src/lib/documents`, then the full run. **Never claim a statute's text is exact; say "verify".**

## E5: Documents (Codex B, GPT-6 Sol, medium, after E3 and E4 merge)
**Owns:**
- `src/lib/documents/**`, `src/lib/billing/*EmailHtml.ts`
- `src/app/api/jobs/[jobId]/{invoice,quote,report}/**` routes
- `src/types/documentOptions.ts`, `src/types/invoice.ts`, `src/types/index.ts` (optional BusinessConfig fields only)
- `src/components/documents/**`
- `src/app/company/settings/page.tsx` (new "Documents" section only), `src/app/api/company/settings/route.ts`
- `jobs/[jobId]/page.tsx`: Report and Invoice tabs only
- tests

1. **Invoice: better than the reference, same voice.**
   - Default opening, editable per invoice, prefilled: "Pursuant to your request and approval, {businessName} dispatched our service team to {address} on {visit date}. Upon inspection, our technicians identified the following:". Then the findings as **Problem / Corrective action**.
   - Default closing: "All work-related debris was removed from the site. Please refer to the enclosed photos. We are requesting payment for services rendered." Plus "Thank you for allowing {businessName} to take care of your {industry noun} needs."
   - Industry-neutral via `useBusinessModules().vocab` / the template; no hardcoded roofing words.
   - Columns: Item | Description | Qty | Unit price | Amount. Hidden materials/labor still collapse to one line (`groups.ts` `collapse`).
   - Letterhead "License #{n}"; "Work order: {jobId}"; optional PO number field.
   - **Terms:** a Settings default ("Due upon completion") saved to `invoice.terms` and `dueAt` on create/patch. The preview and the email read the same fields (fixes the mismatch).
   - Business defaults for opening/closing/thank-you/terms live in Settings → Documents.
2. **Report:**
   - `draftReportNotes` stops writing the "Site visit:" and "Materials used:" sentences (the sections already carry them).
   - New `stripHiddenFacts(notes, flags)` removes those generated sentences from existing notes when hide labor/materials is on. It runs on toggle (the textarea updates and saves) and at render/email time.
   - The report's party label becomes "Prepared for"; the invoice keeps "Bill to".
   - Fix the misleading hint in `optionsCopy.ts:11`.
3. **Include quote on report** (opt-in).
   - Add `includeQuote` to `DocumentOptions` and the job PATCH validator, plus a checkbox on the Report tab.
   - Enabled only when the quote is sent or accepted; otherwise the hint "Send the quote first".
   - Renders "Quote {id} · Accepted {date}" through `quoteGroups()`. Hide flags are OR'd between report and quote; hidden rows collapse to "Materials $x". Ends with "Quoted total".
   - The email route loads `quotes/{job.quoteId}` server-side.
   - Tests: box off → the report HTML has no "$"; box on + hide materials → one "Materials" row.
4. **Terms & notices** (Settings → Documents).
   - Import `FLORIDA_NOTICE_DEFAULTS`. Per notice: on/off, "show on" (quote/invoice), and editable text.
   - One **"I have had these reviewed" approval** stores `noticesApprovedAt` and `noticesApprovedBy`. **Nothing renders on any document until approved.**
   - **Approval is refused (button disabled, server refuses too) while any enabled notice text still contains a `[DRAFT` marker.** The statutory defaults in `legalNotices.ts` ship with "[DRAFT — replace with the current statutory wording…]" placeholders; they must be replaced by the attorney's wording (or the notice switched off) first, so a draft marker can never print on a customer document. Add a test.
   - Decided 2026-09-26 (E4's question): the nine notice ids stay as-is. §489.119(5)(b) (license number) is met by the letterhead "License #" (step 1), and §489.126 (deposits) lives inside `payment-terms`. No tenth id.
   - Statutory notices render only when total > `thresholdUsd` and the job is not marked **Commercial property** (a new job checkbox; default residential).
   - Rendered as a "Terms & notices" block at the end of the quote/invoice, in the preview, print and email.
5. **Gates:** same as E1. Also re-run `src/e2e/demo-path.test.ts`; its "no $ in the report" assertion must still hold with the box off.

## E6: Photos on documents + drag-and-drop (Codex B, GPT-5.5 Terra, medium, after E5 merges)
**Owns:**
- `src/lib/photos/**`, `src/app/api/jobs/[jobId]/photos/**`, `src/types/jobs.ts` (photo fields only)
- `src/components/field/PhotoEditSheet.tsx`
- new `src/components/photos/**`
- `src/lib/documents/photoPages.ts` (new) + the photo parts of `DocumentPreview.tsx`/`emailBlocks.ts`
- the three send routes (photo loading only)
- `jobs/[jobId]/page.tsx` (Photos tab + photo wiring)

**New dependency approved by the owner:** `@dnd-kit/sortable` (same family as the installed `@dnd-kit/core`).

1. **Pairs, not positions.** Add optional `pairId` to `JobPhotoMeta`: an After points at its Before. PhotoEditSheet gets a "Pairs with…" picker. Fallback for legacy photos: position pairing as today.
2. **Drag-and-drop.**
   - The Photos tab becomes a sortable grid (mouse, touch, keyboard). Sections: **Before / After pairs**, then Other.
   - Dragging an After onto a Before pairs them.
   - Order persists through a new `PATCH /api/jobs/[id]/photos/order` (tenant-scoped, staff/owner, validates finite numbers, max 24 ids).
3. **One layout for all three documents.**
   - `photoPages(photos, {pairsPerPage: 4})`: rows of **Before | After**, each photo with its caption underneath, 4 pairs per page, and a page break between pages. Unpaired photos go 2 per row after the pairs.
   - Used by `DocumentPreview` (a new `photos` prop) and `emailBlocks` (`photosBlock`). Print CSS: `break-inside: avoid`, page break per 4 rows.
4. **Per-document selection.**
   - The report keeps `includeInReport`.
   - Quote and invoice get `photoIds?: string[]` plus the existing `showPhotos` option exposed as a toggle ("Include photos"). The default is the report-selected photos.
5. **Email size.**
   - The send routes load blobs server-side with `getPhotoBlobs(ids)` (`store.ts:49`). The report stops posting base64 in the request body; this fixes the 4.5 MB limit.
   - Cap 16 photos per email (4 pages of pairs), with a clear message if more are selected.
6. **Gates:** same as E3, including Playwright on the Photos tab (drag works with mouse and keyboard) and a print preview of each document.

---

## Integrator (Claude) after each wave
- Review each diff against its section, merge to `main`, run the full gates plus `npx next build`, and update `TODO.md` Phase 25.
- Before creating the E6 worktree: `npm install @dnd-kit/sortable` on `main` (owner-approved), run the gates, commit, then create the worktree.
- If a worker returns partial work once, merge the good part and **finish it myself**; no second resume prompt (owner rule).
- After E4: save the AI-provider facts (what bills what, where to recharge) to project memory as a reference.
- After wave 2: refresh `public/guides/onboarding-guide.html`: new tabs, the Next button, the crew no longer completes jobs, Team page, Terms & notices.
- **Push/deploy only when the owner says "approve push".**

## Owner (NEEDS-HUMAN)
- Have an attorney review `docs/FLORIDA-DOCUMENT-NOTICES.md`; then Settings → Documents → edit if needed → tick "reviewed".
- Fill in account owners in `docs/AI-PROVIDERS.md`; check the OpenAI and DeepSeek balances now.
- After deploy: relaunch Demo Studio (new roofing rules and seeded transcripts), then run the live checks below.

## Verification (end to end, after all waves)
1. **Phone:**
   - "Tiny drip, not raining" → a booked inspection, no escalation.
   - "Water pouring through the ceiling" → Escalated, with an Urgent lead in the Pipeline and "This call produced" on the call.
   - Book over a time that has a Powerboard job → the AI offers another time.
   - Cancel, then rebook the same time → it works.
2. **QR field screen on a phone:**
   - The time clock works; no "Forbidden".
   - There is no "Work complete" button.
   - A name is required.
   - The "+ Finding" list is fully visible.
3. **Office:**
   - The job page shows the numbered tabs, newest-first Activity, "Reported by crew" in Findings, and the lock notes.
   - Next → Mark work complete → Create invoice → Send → the job is Invoiced → Mark paid.
4. **Documents:**
   - The invoice reads like the reference (opening, Problem/Corrective action, closing, thank-you, qty × rate, License #, terms).
   - The report has no prices unless "Include quote" is ticked; hide materials removes them from the text too.
   - Terms & notices don't appear until approved.
   - Photos show as Before | After pairs, 4 per page, on all three documents; drag order sticks; emails send with 12+ photos.
5. **Team:** invite → the user shows as Invited; they sign in → Active; Lock → their next request is refused and the app shows the locked message; Revoke QR links → an open QR screen stops working.
6. **Lists:** Pipeline Past, Activity and job history are newest first; the Dashboard's "today" shows today's appointments; the Jobs page loads older jobs and exports CSV.

---

## FIRST PROMPTS: written before step 0 (still valid)
> **Update 2026-09-26:** step 0 is done, so `main` equals `fix/demo-feedback-0925`. Either version of the E1/E4 prompts works: these (fix branch plus the plan's original path), or the `main`-based ones in the next section, which read `docs/DEMO-FEEDBACK-PLAN.md`. **E3 can start now.**

E1 (Codex A) and E4 (Deepseek) could start before step 0:
- They branch from **`fix/demo-feedback-0925`**, which already contains slices 1–2.
- They read this spec at its current path: `C:/Users/karee/.claude/plans/i-just-called-on-warm-beacon.md`.
- They touch none of the four uncommitted files (quote route, QuotePanel, history.ts, types/quote.ts).
- Their branches merge cleanly into `main` after step 0, because they share the same history.

E3 (Codex B) waits until the integrator has done step 0.

### E1 now: Codex A, GPT-6 Sol, medium
```
Work ONLY in a new worktree D:/Apps/air-wt-access on branch task/access-team. Create it first (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-access -b task/access-team fix/demo-feedback-0925; New-Item -ItemType Junction -Path "D:/Apps/air-wt-access/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Before your first edit, verify `git -C D:/Apps/air-wt-access rev-parse --show-toplevel` = D:/Apps/air-wt-access and `git -C D:/Apps/air-wt-access branch --show-current` = task/access-team. Never edit D:/Apps/6 - AI Receptionist.
Your spec is the file C:/Users/karee/.claude/plans/i-just-called-on-warm-beacon.md (outside the repo — read it, do not copy it into the repo). Read its "Owner decisions", "Answers" and "E1" sections in full; E1 steps 1-7 are your spec, in order. Also read AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", and CLAUDE.md (Cache-Control, Navigation Completeness, design-system rules). If you cannot read the spec file, STOP and say so.
Stay inside the E1 "Owns" list; if you need any other file, stop and ask. Auth is protected context: write NEGATIVE tests first (grant for job A punching job B, wrong business, expired grant, logged-in viewer posting a field note, locked member) and never add a bypass. Mock the Firebase Admin SDK — no live Firebase/Auth calls, no keys in any file.
Commit after every step (prefix "E1:"). Gates at the end: npx tsc --noEmit; eslint on changed files; your tests; the full npx vitest run (send.test and company/team are load-flaky — re-run them alone before believing a failure). No next build. Never push, merge, rebase or touch main or fix/demo-feedback-0925.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: a step 1-7 done/not-done table with commit hashes, gates output, "Noticed, not done".
```

### E4 now: Deepseek V4.1 Flash, Thinking: Hard
```
Work ONLY in a new worktree D:/Apps/air-wt-docs-legal on branch task/docs-legal. Create it first (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-docs-legal -b task/docs-legal fix/demo-feedback-0925; New-Item -ItemType Junction -Path "D:/Apps/air-wt-docs-legal/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Before your first edit, verify `git -C D:/Apps/air-wt-docs-legal rev-parse --show-toplevel` = D:/Apps/air-wt-docs-legal and `git -C D:/Apps/air-wt-docs-legal branch --show-current` = task/docs-legal. Never edit D:/Apps/6 - AI Receptionist.
Your spec is the file C:/Users/karee/.claude/plans/i-just-called-on-warm-beacon.md (outside the repo — read it, do not copy it into the repo). Read its "Answers" and "E4" sections in full; E4 steps 1-6 are your spec. Also read AGENTS.md and docs/WORKER_QUEUE.md "Worker etiquette". If you cannot read the spec file, STOP and say so.
You may edit ONLY the files in the E4 "Owns" list. src/lib/documents/legalNotices.ts must match the TypeScript contract in E4 step 3 EXACTLY (another task imports it).
The legal memo docs/FLORIDA-DOCUMENT-NOTICES.md is a DRAFT for an attorney: head it "DRAFT — not legal advice — attorney must review", cite the statute for each notice, and mark every quoted statutory text "verify verbatim against the current Florida Statutes" — never claim any text is exact. docs/AI-PROVIDERS.md: env var NAMES only, never values; mark every dashboard URL "verify"; leave account owners as "owner to fill".
Seeded call transcripts: 3-5 realistic turns each, consistent with the seeded lead/appointment the call produced, and industry-neutral (use each vertical's own services — no roofing words in other industries).
Commit after each step (prefix "E4:"). Gates: npx tsc --noEmit; eslint on changed files; npx vitest run src/lib/verticals src/lib/documents; then the full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build. Never push, merge, rebase or touch main or fix/demo-feedback-0925.
Final message: what changed per step with commit hashes, gates output, "Noticed, not done", and "QUESTION FOR INTEGRATOR: ..." if any.
```

## Paste-ready prompts (the integrator copies these into `docs/WORKER_QUEUE.md` section E)

Common header for every prompt (PowerShell, run from anywhere):
`cd "D:/Apps/6 - AI Receptionist"; git worktree add ../<wt> -b <branch> main; New-Item -ItemType Junction -Path "D:/Apps/<wt>/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"`
Then verify `git -C D:/Apps/<wt> rev-parse --show-toplevel` and `git -C D:/Apps/<wt> branch --show-current` before the first edit.

### E1: Codex A, GPT-6 Sol, medium
```
Work ONLY in a new worktree D:/Apps/air-wt-access on branch task/access-team. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-access -b task/access-team main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-access/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify `git rev-parse --show-toplevel` = D:/Apps/air-wt-access and branch = task/access-team before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md (Cache-Control, Navigation Completeness, design-system rules), then docs/DEMO-FEEDBACK-PLAN.md sections "Answers" and "E1" in full. E1 steps 1-7 are your spec, in order.
Stay inside the E1 "Owns" list. Auth is protected context: write NEGATIVE tests first (wrong job, wrong business, expired grant, viewer write, locked member) and never add a bypass. No live Firebase/Auth calls in tests — mock the Admin SDK.
Commit after every step (prefix "E1:"). Gates at the end: npx tsc --noEmit; eslint on changed files; your tests; full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build. Never push, merge or touch main.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, gates output, "Noticed, not done".
```

### E3: Codex B, GPT-5.5 Terra, medium (paste only after the integrator confirms step 0 is done)
```
Work ONLY in a new worktree D:/Apps/air-wt-job-page on branch task/job-page. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-job-page -b task/job-page main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-job-page/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify toplevel + branch before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md (Industry-Applicability + design-system rules), then docs/DEMO-FEEDBACK-PLAN.md "Owner decisions" and "E3" in full. E3 steps 1-9 are your spec, in order.
src/app/company/jobs/[jobId]/page.tsx is ~2,450 lines: grep for the line anchors in the spec, never read it whole. When you rework a tab, extract it into its own sibling component (like QuotePanel.tsx) with no behavior change beyond the spec. Do NOT change the Report/Invoice document rendering (another task owns it next) — only move their error banners.
Commit after every step (prefix "E3:"). Gates: npx tsc --noEmit; eslint on changed files; focused tests; full npx vitest run (send.test/company/team flaky — re-run alone); a Playwright check at 1280px and 375px. No next build. No new dependencies. Never push, merge or touch main.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, gates output, screenshots paths, "Noticed, not done".
```

### E4: Deepseek V4.1 Flash, Thinking: Hard
```
Work ONLY in a new worktree D:/Apps/air-wt-docs-legal on branch task/docs-legal. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-docs-legal -b task/docs-legal main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-docs-legal/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify toplevel + branch before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", then docs/DEMO-FEEDBACK-PLAN.md "Answers" and "E4" in full. E4 steps 1-6 are your spec. You may edit ONLY the files in the E4 "Owns" list.
legalNotices.ts must match the TypeScript contract in E4 step 3 EXACTLY (another task imports it). The legal memo is a DRAFT for an attorney: head it "DRAFT — not legal advice", cite the statute for each notice, and mark every quoted statutory text "verify verbatim against the current Florida Statutes" — never claim it is exact. AI-PROVIDERS.md: env var NAMES only, never values; mark every URL "verify".
Seed transcripts: realistic, 3-5 turns, industry-neutral (use each vertical's own services), consistent with the seeded lead/appointment they produced.
Commit after each step (prefix "E4:"). Gates: npx tsc --noEmit; eslint on changed files; npx vitest run src/lib/verticals src/lib/documents; then the full run (send.test/company/team flaky). No next build. Never push, merge or touch main.
Final message: what changed, gates output, "Noticed, not done", "QUESTION FOR INTEGRATOR: ..." if any.
```

### E2: Codex A, GPT-6 Sol, medium (after E1 is merged; the integrator confirms)
```
Work ONLY in a new worktree D:/Apps/air-wt-schedule-lists on branch task/schedule-lists. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-schedule-lists -b task/schedule-lists main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-schedule-lists/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify toplevel + branch before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md, then docs/DEMO-FEEDBACK-PLAN.md "Answers" and "E2" in full. E2 steps 1-7 are your spec, in order.
bookAppointment/checkAvailability run on LIVE phone calls: keep the tool names, arguments and result shapes exactly as they are (the live ElevenLabs agent depends on them); only the conflict logic changes. Tests with mocked Firestore (src/test-utils/fakeFirestore.ts) — no network.
Commit after every step (prefix "E2:"). Gates: npx tsc --noEmit; eslint on changed files; npx vitest run src/lib/tools src/lib/vapi src/app/api/webhooks src/e2e; then the full run (send.test/company/team flaky). No next build. Never push, merge or touch main.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, gates output, "Noticed, not done".
```

### E5: Codex B, GPT-6 Sol, medium (after E3 and E4 are merged)
```
Work ONLY in a new worktree D:/Apps/air-wt-documents-2 on branch task/documents-2. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-documents-2 -b task/documents-2 main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-documents-2/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify toplevel + branch before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md, docs/DEMO-FEEDBACK-PLAN.md "Owner decisions", "Answers" and "E5" in full, HANDOFF.md lines 160-194 (the reference invoice), docs/FLORIDA-DOCUMENT-NOTICES.md and src/lib/documents/legalNotices.ts. E5 steps 1-5 are your spec, in order.
Owner rules: reports stay price-free unless "Include quote" is ticked; NO legal notice may render on any document until the owner's approval flag is set; no new money math (totals stay on computeTotals/quoteTotal/quoteGroups); industry-neutral wording through the vertical template/vocab; one-teal .button, 375px; jsonWithCache private only.
page.tsx: touch only the Report and Invoice tab code (grep, don't read it whole).
Commit after every step (prefix "E5:"). Gates: npx tsc --noEmit; eslint on changed files; focused tests; npx vitest run src/e2e; full run (send.test/company/team flaky). No next build. Never push, merge or touch main.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, gates output, "Noticed, not done".
```

### E6: Codex B, GPT-5.5 Terra, medium (after E5 is merged)
```
Work ONLY in a new worktree D:/Apps/air-wt-photos on branch task/doc-photos. Create it first:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-photos -b task/doc-photos main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-photos/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Verify toplevel + branch before your first edit. Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md (Known Limitations: photos are base64-in-Firestore on the Spark plan), docs/DEMO-FEEDBACK-PLAN.md "Owner decisions" and "E6" in full. E6 steps 1-6 are your spec, in order.
@dnd-kit/sortable is already in package.json on main (the integrator installed it before creating this worktree, owner-approved). Do not add any other dependency and never run npm install in the worktree (node_modules is a junction to main). Keep the photo storage format backward compatible (existing photos without pairId must still render, paired by position).
Commit after every step (prefix "E6:"). Gates: npx tsc --noEmit; eslint on changed files; focused tests; full npx vitest run; Playwright on the Photos tab (mouse + keyboard drag) and a print preview of quote, invoice and report. No next build. Never push, merge or touch main.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, gates output, "Noticed, not done".
```
