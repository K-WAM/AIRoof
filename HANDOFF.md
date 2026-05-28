# HANDOFF — AI Receptionist Platform
Last updated: 2026-05-28

## Current State

**Completion: ~82%**

Platform is live at https://ai-roof.vercel.app. Alice answers inbound calls end-to-end. Outbound callback infrastructure shipped this session. UI modernized with Inter font + card shadows + logo.

### What's Working (Confirmed Live)
- Alice answers inbound calls, runs tools, books appointments, captures leads
- Vapi webhook handler: function-call, status-update, end-of-call-report
- 7 tools wired: bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment, cancelAppointment, getCurrentDate
- Company dashboard: calls, leads, appointments, jobs, calendar, field all wired to live Firestore
- Job detail: 6 tabs (timeline/materials/labor/issues/invoice/report) + 3-step progress bar
- Field crew page (/field) — unprotected mobile route, voice updates via Web Speech API
- Superadmin portal: businesses list, config editor, usage stats, demo customizer, playbooks
- Branded HTML emails via Resend (booking + escalation + confirmation)
- Auth guards: __session cookie on /admin/* and /company/*
- Inter font, card shadows, logo.png in both admin sidebar and company topbar

### Outbound Callbacks (Shipped This Session — Needs Env Var)
- `POST /api/calls/outbound` — staff-authenticated endpoint (reads __session cookie)
- "☎ Call Back" button on leads detail panel and each appointment card
- Auto-callback after lead creation when `callbackDelayMinutes` is set in business config
- Calls page has All / Inbound / Outbound filter toggle
- Business config page has auto-callback settings panel (delay, max attempts, calling window)
- **BLOCKER**: `VAPI_API_KEY` must be added to Vercel env vars before outbound calls work

## Pending Items

### Must Do Before Demo
1. **VAPI_API_KEY in Vercel** — add to env vars so outbound calls can fire
2. **VAPI_WEBHOOK_SECRET** — currently bypassed (`VAPI_AUTH_BYPASS=true`). Fix: generate new secret in Vapi dashboard, set `VAPI_WEBHOOK_SECRET` in Vercel, remove `VAPI_AUTH_BYPASS` env var
3. **lookupAppointment in Vapi UI** — tool exists in code but needs to be added as a tool in the Vapi assistant dashboard (see walkthrough below)

### Nice to Have Soon
4. **Job "Complete" button** — staff can mark job done (status → "complete"), removes from field crew dropdown
5. **Client login auto-provisioning** — POST /api/admin/businesses should write businessUsers/{uid} automatically
6. **ElevenLabs Flash voice** — in Vapi dashboard, change voice model from `eleven_v3` to `eleven_flash_v2_5` to cut latency from 1200ms to ~250ms
7. **Stability slider** — in Vapi voice settings, drag Stability to 0.35–0.40 for more natural tone

### Phase 3 (Post-Launch)
- After-hours logic (inject IS_AFTER_HOURS into system prompt)
- Call outcome tagging via DeepSeek (classify each call as booked/lead/info-only/escalated)
- Follow-up cadence cron (`/api/cron/follow-up-calls`) — already stubbed, runs daily

## Vapi Architecture

**Assistant ID**: `9267a84a-0f4f-416b-a328-1dc539f5265e` (Apex Roofing / demo-roofing)
**Phone**: +1 (754) 283-7658
**Webhook**: `https://ai-roof.vercel.app/api/webhooks/vapi`
**Header**: `x-vapi-secret: <VAPI_WEBHOOK_SECRET>`

### Adding lookupAppointment to Vapi UI (one-time step)
1. Vapi dashboard → Assistants → Alice → Tools tab → Add Tool
2. Tool type: Function
3. Name: `lookupAppointment`
4. Server URL: leave blank (inherits from assistant)
5. Parameters: `callerPhone` (string), `callerName` (string, optional), `address` (string, optional)
6. Save → Publish assistant

### Outbound Call Config (Per Business)
In `/admin/businesses/{businessId}/config` → scroll to "Auto-callback settings":
- Initial callback delay: Immediate / 5 min / 30 min / 1 hour
- Max call attempts: 1 / 3 / 5
- Calling window: start hour + end hour (e.g. 8am–8pm)

When `callbackDelayMinutes` is set and `VAPI_API_KEY` is in Vercel env, Alice auto-calls back any new lead captured during a call.

## Demo Instructions

1. Call +1 (754) 283-7658 — say you need a roof inspection
2. Alice books the appointment and emails connect@luxordev.com
3. Log in at https://ai-roof.vercel.app/login → connect@luxordev.com
4. See call transcript in Calls, lead in Leads, appointment in Appointments
5. From the appointment, click "Create Job" → manage job in Jobs tab
6. Click "Call Back" on any lead/appointment to trigger an outbound call (requires VAPI_API_KEY)

**Demo customizer**: `/admin/demo` — change prospect name/company for demos. Or use CLI:
```
node scripts/demo-customize.mjs --name "ABC Roofing" --email client@abc.com
```

## Key Files Added This Session
- `src/lib/vapi/vapiClient.ts` — Vapi REST client (initiateVapiCall)
- `src/app/api/calls/outbound/route.ts` — outbound call initiation (staff-auth)
