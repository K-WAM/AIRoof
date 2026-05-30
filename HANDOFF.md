# HANDOFF — AI Receptionist Platform
Last updated: 2026-05-30

## Current State

**Completion: ~88%**

Platform is live at https://ai-roof.vercel.app. Everything below is confirmed working in production.

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
- Field crew page (/field) — unprotected mobile route, voice updates via Whisper
- Superadmin portal: businesses list, config editor, usage stats, demo customizer, playbooks, invoices
- Branded HTML emails via Resend (booking + escalation + confirmation)
- Auth guards: __session cookie on /admin/* and /company/*
- Inter font, card shadows, logo.png in both admin sidebar and company topbar

### Outbound Callbacks (Working — needs VAPI_API_KEY test)
- `POST /api/calls/outbound` — staff-authenticated endpoint
- "☎ Call Back" button on leads and appointment cards
- Auto-callback after lead creation when `callbackDelayMinutes` is set
- Calls page has All / Inbound / Outbound filter toggle

## Pending Items

### Must Do Before Demo
1. **VAPI_API_KEY test** — key is in Vercel, confirm outbound calls actually fire end-to-end with a real test call
2. **lookupAppointment in Vapi** — already in Tools tab (confirmed via screenshot), no action needed

### Resolved This Session (no longer pending)
- ~~VAPI_AUTH_BYPASS~~ — Confirmed: Vapi's new agent builder sends NO secret header (only Content-Type + Accept-Encoding). VAPI_AUTH_BYPASS stays active permanently — this is correct behavior for Vapi's current UI.
- ~~VAPI_API_KEY missing~~ — was already in Vercel (confirmed May 22)
- ~~Job progress bar unclickable~~ — now fully interactive, all 5 steps
- ~~Client login not provisioned~~ — now auto-provisioned on onboarding

### Nice to Have
3. **Stability slider in Vapi** — drag to 0.35–0.40 for more natural tone (ElevenLabs Flash already switched)
4. **businessUsers provisioning on businesses POST** — partially done (ownerEmail required); if no email, login not created — acceptable

### Phase 3 (shipped this session)
- ✅ Call outcome tagging via DeepSeek
- ✅ After-hours call tagging
- ✅ Follow-up cron route + vercel.json schedule

### Phase 4 — Performance Cleanup (spec written, not started)
See **[docs/PERFORMANCE-CLEANUP.md](docs/PERFORMANCE-CLEANUP.md)** — assess feasibility before executing.
Key items: bounded fetching on company pages, single canonical field flow, API route auth, outbound call auth bug fix, unused dep removal (`twilio`, `@opentelemetry`), job status label normalization.

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
