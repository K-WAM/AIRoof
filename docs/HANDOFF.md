# AI Receptionist Platform — Handoff

> **⚠️ SUPERSEDED (2026-07-25)** — This doc is from 2026-05-28, well before the release plan (`MASTER_PLAN.md`) was written. Phases 0–4 are fully merged; see `MASTER_PLAN.md`, `TODO.md`, and `docs/IMPLEMENTATION_LOG.md` for the current shipped state. This file is retained for historical architecture reference only.

Date: 2026-05-28 (latest session)

## Current Status: Invoice plan shipped, UI modernized — ~85% done

Vapi live end-to-end. Admin panel complete. Field job tracking, voice updates (push-to-hold, no duplication), GPT-4o parsing, professional invoice editor, styled report renderer all shipped. Demo-ready for roofing vertical.

**Demo number**: +1 (754) 283-7658 (Vapi number)
**Demo business**: `demo-roofing` → Apex Roofing South Florida

---

## What Was Built This Session (2026-05-29)

### Field Log — Dark Mobile UI + Whisper Audio (full overhaul)
- **Dark mobile UI**: slate-900 background, orange accents
- **Job selector**: tappable card with prominent orange job ID (`J-XXXX`), dropdown overlay, no `<select>`
- **Hold-to-speak mic**: animated orange pulse rings while recording, status cycles: HOLD TO SPEAK → Listening… → Transcribing… → ✓ Logged
- **No submit button**: release the button → auto-submit. Zero extra taps for gloved hands.
- **Audio pipeline**: MediaRecorder → base64 → Whisper (`whisper-1`) → GPT-4o extraction → Firestore merge
  - iOS: `audio/mp4`, Android: `audio/webm;codecs=opus` — detected via `MediaRecorder.isTypeSupported()`
  - `toFile()` from `openai/uploads` avoids writing to disk in Vercel serverless
- **New API route**: `POST /api/jobs/[jobId]/field-audio` — accepts base64 audio, transcribes, parses, merges into job doc arrays AND writes to updates subcollection (backward compat with job detail tabs)
- **Structured job arrays on job doc** (`materials[]`, `laborEntries[]`, `timelineEvents[]`, `fieldNotes[]`, `auditLog[]`, `totalLaborHours`) — shown in collapsible sections in the field page job log card
- **Job type extended**: `FieldMaterial`, `FieldLaborEntry`, `FieldTimelineEvent`, `FieldAuditEntry` interfaces added to `src/types/jobs.ts`
- **`useFieldAudio` hook** (`src/hooks/useFieldAudio.ts`): replaces Web Speech API for field input; returns `status`, `transcript`, `lastResult`, `startRecording`, `stopRecording`

### Why Whisper over Web Speech API
- Web Speech API (Google/Apple native) fails on construction vocabulary (shingles, fascia, flashing), job-site noise, and iOS reliability. Whisper handles all of these at $0.003/update. See Lesson 105.

---

## What Was Built This Session (2026-05-28)

### Plan
Full implementation plan written and approved: `docs/plans/invoice-from-field-updates-and-ui-facelift.md`

### Job Status Stepper — 5 roofing-native steps
- Replaced `open → in_progress → complete` with `Inspection → Quoted → Working → Invoiced → Complete`
- Type union updated: `Job.status` now includes all 5 + `"open"` kept for backward compat (maps to Inspection in UI)
- `statusToStepIdx()` helper handles old + new status strings gracefully

### Field Updates — Parsed Summary Cards
- Replaced raw transcript display with clean AI-extracted info: timeline chips, material chips, labor chips, issues with severity colors
- Raw text hidden behind "View original" disclosure (collapsed by default)
- "Parsing…" state shown while `parsed` is null and no `parseError`
- "No extracted items" shown when parsed returned empty
- `ParsedUpdateCard` component added to job detail page

### Invoice UI
- Removed hardcoded `$65/hr` — now reads `BusinessConfig.laborRate.defaultHourlyRate` (falls back to `65` if unset)
- Removed hardcoded "Apex Roofing South Florida" from invoice header — now uses job title + address
- `laborRate` field added to `BusinessConfig` type (with `defaultHourlyRate`, `lunchDeductionHours`, `roleRates`)
- `Job` type extended with `clientEmail?` and `invoiceId?` fields

### Auth Security Fix
- Added `src/lib/auth/verifyRole.ts` — `verifyAuthAndRole(req, businessId, allowedRoles)` helper
- Reads `__session` cookie → `verifyIdToken()` → looks up `businessUsers` doc → checks role
- Applied to `POST /api/jobs/[jobId]/updates` — was previously unauthenticated (Admin SDK bypasses Firestore rules)

### UI Modernization
- Logo: admin 30px → 48px, company 28px → 36px
- Admin sidebar: darker bg (`#080e1a`), gradient brand area, deeper nav link hover
- Active nav item: teal glow + border-left highlight
- "Voice Update ↗" (opened new tab, broke mobile) → "Send to foreman ↗" (copies field URL to clipboard)

---

## What Was Built Previously (2026-05-26)

### Voice Input — Foolproof Push-to-Hold (field/page.tsx)
- Switched from toggle-mic to **push-to-hold**: `onPointerDown` starts, `onPointerUp/Leave/Cancel` stops
- `pressingRef` mirrors pressing state so `onend`/`onerror` callbacks always see current hold state
- **Android Chrome buffer-bleed fix**: `lastCommittedIndex` closure variable per session — prevents re-committing buffered results when session auto-restarts after ~20s silence
- `continuous: true` so natural fast speech flows without forced pauses
- 400ms restart delay before new session to flush audio buffer
- `interimText` live preview shown in yellow "Hearing: …" box below textarea

### Parser — Switched to GPT-4o (deepseekClient.ts)
- `parseFieldUpdate()` now uses GPT-4o when `OPENAI_API_KEY` is set, falls back to DeepSeek
- Improved system prompt: each crew member = separate labor entry; extract `arrivalTime`/`departureTime` per person; calculate hours (−0.5 for lunch if >5h); materials with quantity + unit; timeline with departure-from-shop event
- `arrivalTime` and `departureTime` added to `ParsedUpdate.labor[]` type

### Professional Invoice (jobs/[jobId]/page.tsx)
- **No API call**: invoice builds entirely from client-side parsed data — no crash possible
- Editable labor table: Technician | Arrival | Departure | Hours | Rate/hr | Total
- Editable materials table: Item | Qty | Unit | Unit Price | Total
- "+ Add other charge" section for extras
- Tax rate input → calculated tax + grand total
- Notes/payment terms textarea
- Print button → `window.print()` with `@media print { .no-print { display: none } }`
- `InlineInput` component: borderless dashed-bottom inputs for clean inline editing

### Styled Report Renderer (jobs/[jobId]/page.tsx)
- `ReportRenderer` component parses `## Section` and `- item` markdown patterns into styled HTML cards
- Professional header with job metadata (ID, address, date)
- Print button

### PWA — Add to Home Screen (manifest.json + layout.tsx)
- `public/manifest.json`: `display: standalone`, `start_url: /company/field?preview=demo-roofing`
- `layout.tsx`: `<link rel="manifest">`, `apple-touch-icon`, `mobile-web-app-capable`, `Viewport` with no user scaling
- Field crew can install "Luxor Field" as a home screen app — opens directly to field screen

---

## What Was Built Previously (2026-05-25)

### Field Job Updates (full feature — shipped last session)
- Short human-friendly job IDs (`J-1042`) via atomic Firestore counter
- `src/types/jobs.ts` — `Job`, `FieldUpdate`, `ParsedUpdate`, `InvoiceLineItem` types
- `src/app/api/jobs/route.ts` — GET list + POST create (counter transaction)
- `src/app/api/jobs/[jobId]/updates/route.ts` — POST submit update + parse
- `src/app/api/jobs/[jobId]/report/route.ts` — POST generate plain-text report
- `src/app/api/jobs/[jobId]/invoice/route.ts` — POST generate draft invoice (still in place but invoice UI no longer calls it)
- `src/app/company/jobs/page.tsx` — job list with status badges + create form
- `src/app/company/field/page.tsx` — mobile-first field screen
- `company-nav.tsx` — Jobs and Field links
- `appointments/page.tsx` — "Create Job →" button prefills from appointment

### Demo & Pitch Assets (2026-05-26)
- `public/guides/pitch-deck.html` — HTML pitch deck (no personal email, luxordev.com/contact)
- `public/Luxor-AI-Pitch.pptx` — 3-slide PPTX (problem/stats, ChatGPT-esque chat mockup, contact)
- `src/app/admin/guide/page.tsx` — Pitch Deck tab added (4 tabs now: Demo / Onboarding / Field Ops / Pitch Deck)
- `public/guides/onboarding-guide.html` — full 15-min demo script rewritten with exact call scripts and field voice walkthrough

### Other Previous Milestones
- Vapi migration: Alice answers calls end-to-end with tool use
- 5 tools: bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment
- Branded HTML emails via Resend
- All 5 company dashboard pages wired to live Firestore
- Auth guards: Next.js middleware + layout redirects + Firestore rules
- Admin onboarding wizard (5 steps) + config edit page
- Demo customizer: /admin/demo + CLI
- Per-business timezone
- Usage monitoring across all tenants

---

## Pending Items

| Item | Status | Notes |
|------|--------|-------|
| VAPI_WEBHOOK_SECRET mismatch | Bypassed with `VAPI_AUTH_BYPASS=true` | Fix: delete Vercel secret, generate new one, set in both Vercel + Vapi UI |
| lookupAppointment in Vapi UI | Needs Vapi UI step | Add as 5th tool in Vapi dashboard (walkthrough below) |
| businessUsers provisioning on onboarding | Not automated | Must manually create `businessUsers/{uid}` for new clients so they can log in |
| Job "Complete" button | Not built | No UI to mark a job done — removes from field crew dropdown |
| Google Calendar | Not built | Post-MVP, requires per-business OAuth |
| RESEND_FROM verified domain | Not set | Needs verified domain before "From" name shows correctly |
| Outbound calling (manual) | Not built | See spec below |

---

## Outbound Calling (Future — Phase 3)

Manual callback/follow-up trigger from the company dashboard. Do not implement cold calling in v1.

**Types**
- `OutboundCall`: `{ id, businessId, vapiCallId?, toPhone, toName?, type: "callback"|"follow-up", status: OutboundCallStatus, notes?, summary?, recordingUrl?, createdAt, updatedAt }`
- `OutboundCallStatus`: `"queued" | "dialing" | "completed" | "no-answer" | "busy" | "failed" | "voicemail"`

**API routes**
- `POST /api/calls/outbound` — create + initiate immediately; auth via `verifyAuthAndRole`; `businessId` from auth only, never body
- `GET /api/calls/outbound?businessId=xxx` — list for business
- `GET /api/calls/outbound/[id]` — detail

**Vapi integration**
- Use `vapiAssistantId` + `vapiPhoneNumberId` from `BusinessConfig`
- POST to Vapi `/call` with `assistantId`, `phoneNumberId`, `customer.number`; store returned `vapiCallId`
- Do not claim initiated until Vapi returns 2xx
- Webhook (`/api/webhooks/vapi`): detect outbound via `call.type === "outboundPhoneCall"` → look up outbound record by `vapiCallId` → update status; do **not** create inbound-style call record

**Webhook status mapping**
- `status-update: ringing` → `dialing`
- `end-of-call-report: ended-reason: customer-did-not-answer` → `no-answer`
- `end-of-call-report: ended-reason: busy` → `busy`
- `end-of-call-report: ended-reason: voicemail` → `voicemail`
- `end-of-call-report: completed` → `completed` (save summary + recordingUrl)
- fallback → `failed`

**Firestore**
- `businesses/{bid}/outboundCalls/{id}` — same subcollection pattern as calls/leads/appointments
- Security rules: mirror existing `calls` rules (staff/owner read-write, no cross-tenant)

**UI**
- `/company/outbound` page — list with status badges, target name/phone, type, timestamps, summary, recording link
- "New call" form: name, phone, type (callback | follow-up), optional notes; no cold calling option
- Nav entry in `company-nav.tsx`
- Optional: dashboard metric tile (outbound calls this week)

**Env**
- `VAPI_API_KEY` — already required for auto-callback, must be set in Vercel first (current blocker)
- `VAPI_BASE_URL` — optional override (default `https://api.vapi.ai`)

**Constraints**
- `businessId` always from verified auth token, never request body
- No cold calling in v1 UI (type field reserved, not exposed)
- Do not duplicate inbound call records for outbound calls
- Map voicemail/busy/no-answer from Vapi `endedReason`, not generic status

---

## Vapi Walkthrough — Adding lookupAppointment as 5th Tool

1. Go to **dashboard.vapi.ai** → **Tools** → **+ Create Tool**
2. Select **Function**
3. Fill:
   - **Name**: `lookupAppointment`
   - **Description**: `Look up an existing appointment for the caller when they ask about their booking.`
   - **Server URL**: `https://ai-roof.vercel.app/api/webhooks/vapi`
   - Header: `x-vapi-secret` → paste webhook secret (or leave blank while VAPI_AUTH_BYPASS active)
4. Parameters: `callerPhone` (string), `callerName` (string), `address` (string) — all not required
5. Save → **Assistants** → Alice → **Tools** tab → **+ Add Tool** → `lookupAppointment` → Save

---

## Architecture (Current)

```
Inbound call → Vapi phone number → Vapi assistant (Alice, 9267a84a)
  → Deepgram nova-3 STT
  → Claude Haiku 4.5 (via Vapi LLM config)
  → ElevenLabs TTS
  → Vapi posts webhook to: https://ai-roof.vercel.app/api/webhooks/vapi

Webhook types handled:
  function-call / tool-calls  → routes to agentTools.ts
    bookAppointment           → Firestore appt doc + branded Resend email
    createLead                → Firestore lead doc
    escalateCall              → escalation email
    checkAvailability         → mock availability slots
    lookupAppointment         → queries Firestore, returns appt summary
  status-update               → creates/updates call record
  end-of-call-report          → saves transcript, recording URL, summary

Field update flow:
  Field screen (PWA, push-to-hold mic) → POST /api/jobs/{jobId}/updates
    → saves rawText to Firestore immediately
    → calls GPT-4o parseFieldUpdate() with job context (falls back to DeepSeek)
    → writes structured ParsedUpdate (timeline/materials/labor/issues) back to Firestore
    → admin sees parsed data in Jobs → job detail tabs
    → "Generate Invoice" builds editable invoice from parsed data (client-side, no API call)
    → "Generate Report" calls /api/jobs/{jobId}/report → renders as styled section cards
```

---

## How to Run a Demo

### AI Receptionist Demo
1. `/admin/demo` → enter prospect name + email → Apply
2. Call **+1 (754) 283-7658** — Alice greets as their company
3. Book an appointment — email arrives in prospect inbox
4. Open `/company/dashboard?preview=demo-roofing` to show live data
5. Reset when done

### Field Operations Demo
1. From Appointments, click "Create Job →" on any appointment — form prefills
2. Create the job → note the `J-XXXX` ID assigned
3. Open `/company/field` on a phone (or Chrome mobile DevTools)
4. Select the job, hold the mic button, speak naturally:
   > "We replaced 14 squares of shingles on the north face. Crew was Marco and Dani. We left the shop at 7:30, got there at 8. Found rotted decking near the chimney — about 6 square feet. Job took 3 hours. Need to come back for the flashing."
5. Release, tap Submit → show green confirmation screen
6. Go back to job detail on admin → show parsed timeline/materials/labor/issues
7. Click "Generate Invoice" → professional editable invoice with crew rows, material rows, tax, grand total
8. Click "Generate Report" → styled section cards, print to PDF

### PWA Install (for field crew)
- Android: Chrome menu → "Add to Home Screen" → opens fullscreen as "Luxor Field"
- iOS: Safari → Share → "Add to Home Screen"
- Pre-set `start_url`: `/company/field?preview=demo-roofing`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/vapi/route.ts` | Single Vapi webhook — all message types |
| `src/lib/vapi/verify.ts` | Webhook secret verification (bypass active) |
| `src/lib/vapi/businessLookup.ts` | Maps vapiAssistantId → businessId |
| `src/lib/tools/agentTools.ts` | All tools + BizBranding email templates |
| `src/lib/ai/deepseekClient.ts` | GPT-4o field update parser + DeepSeek summaries/classification |
| `src/types/jobs.ts` | Job, FieldUpdate, ParsedUpdate, InvoiceLineItem types (arrivalTime/departureTime in labor) |
| `src/app/api/jobs/route.ts` | GET list + POST create (atomic short ID) |
| `src/app/api/jobs/[jobId]/updates/route.ts` | Submit update + GPT-4o parse |
| `src/app/api/jobs/[jobId]/report/route.ts` | Generate text report |
| `src/app/company/jobs/page.tsx` | Job list admin view |
| `src/app/company/jobs/[jobId]/page.tsx` | Job detail (6 tabs, invoice editor, report renderer, print) |
| `src/app/company/field/page.tsx` | Mobile PWA field screen (push-to-hold, continuous, dedup) |
| `src/middleware.ts` | Route protection — checks __session cookie |
| `src/contexts/AuthContext.tsx` | Sets/clears __session cookie |
| `src/hooks/useBusinessId.ts` | Returns ?preview= for superadmin, user.businessId otherwise |
| `src/hooks/useBusinessTimezone.ts` | US_TIMEZONES array + hook for per-business tz |
| `src/app/admin/admin-nav.tsx` | Sidebar nav (Platform / Tools sections) |
| `src/app/admin/guide/page.tsx` | Playbooks — 4 tabs: Demo / Onboarding / Field Ops / Pitch Deck |
| `src/app/admin/usage/page.tsx` | Platform-wide usage monitoring |
| `src/app/admin/onboarding/page.tsx` | Onboarding wizard (5 steps) |
| `src/app/admin/businesses/[businessId]/config/page.tsx` | Live config edit |
| `src/app/admin/demo/page.tsx` | Demo customizer UI |
| `public/manifest.json` | PWA manifest (standalone, start_url = field screen) |
| `public/guides/field-operations-guide.html` | Printable field ops guide |
| `public/guides/onboarding-guide.html` | Printable demo + onboarding guide (15-min script) |
| `public/guides/pitch-deck.html` | HTML pitch deck |
| `public/Luxor-AI-Pitch.pptx` | 3-slide PPTX pitch deck |
| `scripts/seed-demo-business.mjs` | Demo data init (run once) |
| `scripts/provision-superadmin.mjs` | Set custom claim + businessUsers doc |
| `firestore.rules` | Tenant isolation + jobs subcollection rules |

---

## Next Engineering Actions (Phase 2 of invoice plan)

See full plan: `docs/plans/invoice-from-field-updates-and-ui-facelift.md`

### Invoice / Pricing (Phase 2)
1. **Material price catalog** — `businesses/{bid}/priceList/{itemId}` collection + CRUD API + admin pricing UI page
2. **Parser v2** — extend `ParsedUpdate` with `confidence`, `unresolved`, `assumptions`; update AI prompt + zod validation
3. **Material matcher** — `src/lib/pricing/matchMaterial.ts`: exact → alias → fuzzy match against price catalog
4. **Labor calc** — `src/lib/pricing/calcLabor.ts`: apply `BusinessConfig.laborRate`, preserve lunch deduction
5. **Persisted invoice draft** — `POST /api/jobs/[jobId]/invoice/draft` → `invoices/{invoiceId}` Firestore doc
6. **Invoice tab loads from persisted draft** — replaces current transient client-side generation

### Vapi / Security
7. **Fix VAPI_WEBHOOK_SECRET** — remove VAPI_AUTH_BYPASS, set new secret in Vercel + Vapi UI
8. **Add lookupAppointment to Vapi dashboard** — see walkthrough below
9. **businessUsers auto-provisioning** — wire onboarding POST to create `businessUsers/{uid}` from owner email

### Backlog (build when trigger is true)
- **After-hours logic** — inject `IS_AFTER_HOURS` flag into system prompt based on businessHours. Trigger: first client complaint.
- **Call outcome tagging** — DeepSeek classify in end-of-call-report webhook. Trigger: client asks about conversion rate.
- **Job "Complete" button** — status toggle; removes job from field crew dropdown. Trigger: first field client.
- **Follow-up cadence cron** — leads on days [3,7]. Trigger: client wants re-engagement.
- **Multi-vertical demo wizard** — industry dropdown swaps Alice's full knowledge base. Trigger: first non-roofing demo.
- **Client login auto-provisioning** — getUserByEmail → create businessUsers doc. Trigger: first paying client.
- **Stripe billing** — plan tier gates. Account: `acct_1Sf8lp0CMYfTqgSy`. Trigger: first paying client.

---

## Environment Variables (Vercel, Production)

| Var | Status | Purpose |
|-----|--------|---------|
| `VAPI_API_KEY` | ✓ Set | Vapi REST API |
| `VAPI_AUTH_BYPASS` | ✓ Set (true) | Bypasses webhook sig check — remove after secret fix |
| `VAPI_WEBHOOK_SECRET` | ✓ Set (mismatched) | Fix by resetting in both places |
| `OPENAI_API_KEY` | ✓ Set | GPT-4o for field update parsing + LLM responses |
| `DEEPSEEK_API_KEY` | ✓ Set | Back-office AI (summaries, classification) — fallback for parsing |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✓ Set | Firestore Admin SDK |
| `RESEND_API_KEY` | ✓ Set | Email notifications |
| `RESEND_FROM` | ✓ Set | Needs verified sending domain for correct "From" name |
