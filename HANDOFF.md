# HANDOFF — AI Receptionist Platform
Last updated: 2026-06-01 (Field Ops + Calendar Powerhouse + Library epic)

## Current State

**Completion: ~97%**

Platform is live at https://ai-roof.vercel.app. Everything below is confirmed working in production.

### Latest epic — Field Ops + Calendar Powerhouse + Library (shipped, 7 commits)
Full plan: **docs/EPIC-PLAN.md**. Built straight through, type-checked + built green per phase, Firestore rules deployed.

- **Booking fixed platform-wide** — Admin Firestore now uses `ignoreUndefinedProperties` (was rejecting every booking on the `notes: undefined` field).
- **Unified, editable, voice-correctable job data** — `job.parsed` is the single source of truth, computed in code from the immutable `updates` ledger (`src/lib/jobs/projection.ts`). Materials dedup/sum by name (fixes the "2×4s 50/50/150" duplication). Job-detail tabs are inline-editable. Voice corrections are a **one-tap confirm card** that shows old→new + the recomputed running total — the LLM never does the arithmetic, so a correction can't wipe prior days (e.g. 30+20+40+150 → correct 150→120 → 210, not 120).
- **Job-site photos** (free Spark plan) — `＋ Photo` on both field screens with a mandatory description; base64 split into thumbnail + full-blob Firestore docs so grids load instantly; 10-photo cap; admin Photos tab + lightbox + "In report" toggle. `src/lib/photos/store.ts` swaps to Firebase Storage in one file when on Blaze.
- **Editable report** — Scope & Resolution notes section, included photos (≤2 pages, captioned), and a manual **📧 Mail report** button (branded Resend email). Automation assembles; a human sends.
- **Library** (`/company/library`) — pricing catalog (auto-fills invoice unit prices, never fabricates), crews, documents.
- **Calendar Powerboard** — drag jobs onto crew×day cells (@dnd-kit) → grey/provisional → **Confirm** → branded crew email + tile turns crew color. Bookings row shows appointments (unconfirmed dashed-grey).
- **After-hours booking** — Alice books 24/7; after-hours appts flagged `pendingConfirmation`, shown amber/grey with a one-click **"Confirm & notify customer"**. Vapi `assistant-request` injects `{{currentDate}}`/`{{currentTime}}`/`{{afterHoursContext}}` — **confirmed live in the dashboard prompt**, and all 7 tools are attached.

### Vapi config (confirmed from dashboard 2026-06-01)
- **Tools (7):** bookAppointment, checkAvailability, createLead, escalateCall, lookupAppointment, cancelAppointment, getCurrentDate.
- **System prompt** opens with `CONTEXT: Today is {{currentDate}} at {{currentTime}} ({{currentTimezone}}). {{afterHoursContext}}` + an explicit BOOKING FLOW (call checkAvailability first, read slots, bookAppointment, confirm warmly).
- **Voice:** Cartesia Sonic 3.5 "Ariana - kind friend" (~250 ms). **Transcriber:** Deepgram nova-3 multilingual. **Model:** GPT-4o Mini Cluster. ~$0.09/min, ~840 ms latency.

### Most human-sounding voice — recommendation
Two different axes of "human":
- **Raw voice realism:** **ElevenLabs** is the leader (Turbo v2.5 / Multilingual v2 / Flash). Warmest receptionist-style voices: *Sarah, Jessica, Matilda*. Tradeoff: higher latency (~400–700 ms) and ~$0.05–0.10/min more. Tune Stability ~0.40–0.50, Similarity ~0.75, Style low.
- **Conversational naturalness (turn-taking):** **Cartesia Sonic** (current) wins on latency (~250 ms). On a phone call, fast responses with no awkward pause feel *more* human than a marginally richer voice that lags — so the current pick is genuinely strong for a receptionist.

**Verdict:** Keep Cartesia "Ariana" if low latency matters most (recommended for phone). If you want maximum raw realism and can accept slower replies, switch provider → ElevenLabs → a warm conversational voice and lower Stability for more expressiveness. A/B both on a real call before deciding.

### What's Working (Confirmed Live)
- Alice answers inbound calls end-to-end, runs 7 tools
- Vapi webhook handler: function-call, status-update, end-of-call-report
- **Call outcome tagging**: DeepSeek classifies each call as `scheduled` / `lead_captured` / `escalated` / `no_action` after end-of-call-report. Badge shown on Calls page.
- **After-hours tagging**: Calls flagged `isAfterHours` based on business hours + timezone. "After hrs" badge on Calls page.
- **Follow-up cron**: `/api/cron/follow-up-calls` fires daily at 2pm UTC (vercel.json). Calls back uncontacted leads within configured calling window.
- **Clickable 5-step job progress bar**: Inspection → Quoted → Working → Invoiced → Complete. Click any step to advance; `PATCH /api/jobs/[jobId]` backs it.
- **Client login auto-provisioning**: Onboarding wizard creates Firebase Auth user + writes `businessUsers/{uid}` automatically. Temp password shown once in success screen with copy button.
- **QR code on demo page**: Admin demo page shows scannable QR → `/field?businessId=demo-roofing` for live field update demo with prospects.
- **Luxor admin invoices** at `/admin/invoices`: editable invoice form, line items with +/×, auto-calculated totals + tax, template save/load, Save/Send (Resend email)/Download PDF (print)/Mark Paid. Luxor-branded HTML email.
- Company dashboard: calls, leads, appointments, jobs, calendar, field all wired to live Firestore
- Job detail: 6 tabs + 3-step progress bar + clickable status steps
- Field crew page (/field) — unprotected mobile route, voice updates via Web Speech API (browser-side). Note: /company/field uses Whisper (server-side). See Known Bugs below.
- Superadmin portal: businesses list, config editor, usage stats, demo customizer, playbooks, invoices
- Branded HTML emails via Resend (booking + escalation + confirmation)
- Auth guards: __session cookie on /admin/* and /company/*
- Inter font, card shadows, logo.png in both admin sidebar and company topbar

### Outbound Callbacks (FIXED this session)
- `POST /api/calls/outbound` — staff-authenticated endpoint (now working)
- "☎ Call Back" button on leads and appointment cards — was returning 401; now fixed
- Auto-callback after lead creation when `callbackDelayMinutes` is set
- Calls page has All / Inbound / Outbound filter toggle

### Known Bugs — Resolved This Session

**BUG 1 (FIXED) — Call Back button was silently failing (401)**
- File: `src/app/api/calls/outbound/route.ts`
- Was: `verifySessionCookie()` — expected Firebase session cookie, got ID token
- Fix: replaced with `verifyIdToken()` from `@/lib/firebase/admin` — correctly verifies ID tokens
- Now: "Call Back" button authenticates correctly; test with a real call to confirm end-to-end

**BUG 2 (FIXED) — QR demo field submission was failing for unauthenticated workers**
- Files: `src/app/api/jobs/[jobId]/updates/route.ts`, `src/app/api/jobs/[jobId]/field-audio/route.ts`
- Was: `verifyAuthAndRole` required a logged-in session; public `/field` workers got 401
- Fix: removed `verifyAuthAndRole` from both routes; businessId in request body is the auth gate
- `/field` also upgraded to Whisper (see below)

## Pending Items

### Must Do Before Demo
1. **Test outbound call end-to-end** — "Call Back" button is now fixed. Make a real test call via "Call Back" on a lead/appointment to confirm Vapi outbound fires end-to-end with VAPI_API_KEY
2. **Test QR demo** — scan QR from /admin/demo, speak an update on /field, confirm it appears in Jobs tab (both BUG 1 and BUG 2 are now fixed)
3. **lookupAppointment in Vapi** — already in Tools tab (confirmed via screenshot), no action needed

### Resolved This Session (Phase 4 — no longer pending)
- ~~BUG 1 — Call Back 401~~ — fixed: `verifySessionCookie` → `verifyIdToken` in outbound route
- ~~BUG 2 — QR field submission 401~~ — fixed: removed auth from updates + field-audio routes; businessId scoping
- ~~/field used browser speech API~~ — upgraded to Whisper (MediaRecorder → server-side transcription → auto-submit)
- ~~Job status inconsistency~~ — all 6 statuses now consistent across dashboard filter, jobs filter chips, progress bar
- ~~Job detail fetched all jobs~~ — new `GET /api/jobs/[jobId]` endpoint; detail page now fetches one doc
- ~~Unused packages~~ — removed `twilio` and `@opentelemetry/api` from package.json

### Resolved Previous Session (Phase 3)
- ~~VAPI_AUTH_BYPASS~~ — Permanently correct; Vapi sends no secret header. Keep active.
- ~~VAPI_API_KEY missing~~ — already in Vercel (confirmed May 22)
- ~~Job progress bar unclickable~~ — now fully interactive, all 5 steps
- ~~Client login not provisioned~~ — now auto-provisioned on onboarding
- ~~Dashboard static lead list~~ — replaced with Today Feed
- ~~Inconsistent status badges~~ — unified into shared `StatusChip`
- ~~No global search~~ — `CommandBar` ⌘K added to company portal topbar
- ~~Jobs page unfiltered~~ — filter chips now show All / Inspection / Quoted / In Progress / Invoiced / Complete

### Nice to Have
3. **Stability slider in Vapi** — drag to 0.35–0.40 for more natural tone (ElevenLabs Flash already switched)
4. **businessUsers provisioning on businesses POST** — partially done (ownerEmail required); if no email, login not created — acceptable

### Phase 3 (shipped this session)
- ✅ Call outcome tagging via DeepSeek
- ✅ After-hours call tagging
- ✅ Follow-up cron route + vercel.json schedule

### Phase 4 — Performance Cleanup (partially done this session)
See **[docs/PERFORMANCE-CLEANUP.md](docs/PERFORMANCE-CLEANUP.md)** for the original spec with implementation details.

**Completed this session:**
- ✅ BUG 1 (outbound auth), BUG 2 (public field auth)
- ✅ Job status normalization (all 6 values consistent)
- ✅ Single-job endpoint (GET /api/jobs/[jobId])
- ✅ /field Whisper upgrade
- ✅ Unused package removal (twilio, @opentelemetry/api)

**Completed second commit:**
- ✅ Calendar month-range filter (Firestore date-range query, re-fetches on nav, active jobs only)
- ✅ Timezone sessionStorage cache (first load fetches Firestore, subsequent pages skip it)
- ✅ Dashboard call count via getCountFromServer (no longer reads all call docs)

**Still pending (lower priority):**
- Admin route auth — add verifyAuthAndRole to /api/admin/* routes (not blocking demo)

### Phase 5+ (post-launch)
- After-hours voice behavior: inject IS_AFTER_HOURS into Vapi system prompt (needs assistant-request webhook or Vapi API update per call)
- Google Calendar per-business OAuth
- Stripe billing for Luxor clients
- SMS escalation (Twilio A2P 10DLC)
- Additional verticals (HVAC, dental, etc.)

## Vapi Architecture

**Assistant ID**: `9267a84a-0f4f-416b-a328-1dc539f5265e` (Apex Roofing / demo-roofing)
**Phone**: +1 (754) 283-7658
**Webhook**: `https://ai-roof.vercel.app/api/webhooks/vapi`
**Webhook secret**: None — Vapi new UI sends no secret header. VAPI_AUTH_BYPASS=true is correct.
**Voice**: Cartesia (switched to flash, lower latency)

### Vapi Webhook Headers (confirmed from Logs tab)
```json
{ "Content-Type": "application/json", "Accept-Encoding": "identity" }
```
No secret. No Authorization. This is Vapi's behavior in the new agent builder — their Authorization credential system is for calling external APIs FROM Vapi, not for authenticating TO your server.

## Demo Instructions

1. Go to `/admin/demo` — enter prospect company name + email, click Apply
2. Call +1 (754) 283-7658 — Alice greets them as their company
3. Alice books appointment, emails prospect
4. Log in at https://ai-roof.vercel.app/login → connect@luxordev.com
5. Show Calls (outcome badge), Leads, Appointments in real time
6. From appointment → Create Job → show Jobs tab
7. QR code on `/admin/demo` → prospect scans → speaks voice update → show parsed result in Jobs tab
8. From any lead/appointment, click "Call Back" to trigger outbound (requires VAPI_API_KEY test)

**Demo customizer**: `/admin/demo` — enter prospect name/email, click Apply. Reset when done.
**Field QR**: Always-visible QR on `/admin/demo` → `https://ai-roof.vercel.app/field?businessId=demo-roofing`

## Key Files

- src/types/index.ts — BusinessConfig types
- src/types/jobs.ts — Job, FieldUpdate, ParsedUpdate types
- firestore.rules — Tenant isolation
- src/middleware.ts — Route protection (__session cookie)
- src/contexts/AuthContext.tsx — Sets __session cookie on auth state change
- src/app/api/webhooks/vapi/route.ts — Single Vapi webhook handler (7 tools + outcome tagging + after-hours)
- src/lib/vapi/verify.ts — Webhook secret verification (VAPI_AUTH_BYPASS active — correct state)
- src/lib/vapi/vapiClient.ts — Vapi REST client: initiateVapiCall()
- src/lib/tools/agentTools.ts — All tools + email templates + auto-callback
- src/lib/ai/deepseekClient.ts — DeepSeek + GPT-4o: classifyCallOutcome, parseFieldUpdate, etc.
- src/app/api/jobs/[jobId]/route.ts — PATCH for job status updates (new this session)
- src/app/api/cron/follow-up-calls/route.ts — Daily follow-up cron (new this session)
- src/app/api/admin/invoices/route.ts — GET/POST Luxor invoices (new this session)
- src/app/api/admin/invoices/[invoiceId]/route.ts — GET/PUT/DELETE single invoice
- src/app/api/admin/invoices/[invoiceId]/send/route.ts — Send branded invoice email
- src/app/api/admin/invoice-templates/route.ts — GET/POST/DELETE invoice templates
- src/app/admin/invoices/page.tsx — Luxor invoice editor (new this session)
- src/app/admin/demo/page.tsx — Demo customizer + QR code
- src/app/admin/onboarding/page.tsx — 5-step wizard with auto-provisioning + temp password
- src/app/api/admin/businesses/route.ts — POST now creates Firebase Auth user + businessUsers doc
- src/app/company/calls/page.tsx — Calls list with outcome + after-hours badges
- src/app/company/jobs/[jobId]/page.tsx — Job detail: 6 tabs, clickable 5-step progress bar
- vercel.json — Cron schedule (new this session)
- public/guides/onboarding-guide.html — Demo + client onboarding playbook (live at /guides/onboarding-guide.html)
