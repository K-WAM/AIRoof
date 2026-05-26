# AI Receptionist Platform — Handoff

Date: 2026-05-25

## Current Status: Field operations layer complete — 80% done

Vapi live end-to-end. Admin panel complete. Field job tracking, voice updates, AI parsing, report and invoice generation all shipped. Demo-ready for roofing vertical.

**Demo number**: +1 (754) 283-7658 (Vapi number)
**Demo business**: `demo-roofing` → Apex Roofing South Florida

---

## What Was Built This Session (2026-05-25)

### Field Job Updates (full feature)
- Short human-friendly job IDs (`J-1042`) via atomic Firestore counter (`runTransaction` on `jobCounter` field)
- `src/types/jobs.ts` — `Job`, `FieldUpdate`, `ParsedUpdate`, `InvoiceLineItem` types
- `src/app/api/jobs/route.ts` — GET list + POST create (with counter transaction)
- `src/app/api/jobs/[jobId]/updates/route.ts` — POST submit update + trigger DeepSeek parse
- `src/app/api/jobs/[jobId]/report/route.ts` — POST generate plain-text report
- `src/app/api/jobs/[jobId]/invoice/route.ts` — POST generate editable draft invoice
- `src/app/company/jobs/page.tsx` — admin job list with status badges, create form
- `src/app/company/jobs/[jobId]/page.tsx` — job detail: 6 tabs (timeline / materials / labor / issues / invoice / report), editable invoice
- `src/app/company/field/page.tsx` — mobile-first field screen: auto-detects browser language, voice via Web Speech API, text fallback, submit → green confirmation
- `company-nav.tsx` — added "Jobs" and "Field" links
- `appointments/page.tsx` — added "Create Job →" button that prefills job form from appointment data
- `firestore.rules` — added `jobs/{jobId}` and `jobs/{jobId}/updates/{updateId}` rules

### DeepSeek Field Update Parser
- `parseFieldUpdate()` added to `src/lib/ai/deepseekClient.ts`
- Roofing-specific extraction rules: time phrases → timeline, crew names → labor, quantities → materials, leak/damage → high severity issues
- Accepts `jobContext` (address, serviceType, clientName, title) for smarter contextual extraction
- Job context passed from field page through updates API to parser
- Never invents prices — `unitPrice: null` if not stated
- Raw text always preserved even if parse fails

### Language auto-detection
- Removed language picker from field screen — uses `navigator.language` automatically
- Spanish phone → `es-MX`, English → `en-US`, etc. — correct accent/dialect matching
- Language code forwarded to DeepSeek as context hint

### Config page cleanup
- Removed `liveModel`, `backOfficeModel`, `agentTone`, `temperature`, `maxTokens` from admin config edit page — these are Vapi dashboard settings, not ours to manage

### Field Operations Guide
- `public/guides/field-operations-guide.html` — 4-section printable HTML guide (How It Works, Field Worker Guide, Office Admin Guide, Quick Reference)
- Luxor logo, Luxor dark theme, matches onboarding guide style
- `src/app/admin/guide/page.tsx` — added "Field Operations" tab (3 tabs now: Demo Playbook / Client Onboarding / Field Operations)

---

## What Was Built Previously (2026-05-24 and earlier)

See git log for full history. Summary of major milestones:
- Vapi migration: custom Twilio pipeline replaced by Vapi — Alice answers calls end-to-end with tool use
- 5 tools wired: bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment
- Branded HTML emails via Resend — client logo/color in every notification
- All 5 company dashboard pages wired to live Firestore
- Auth guards: Next.js middleware + layout redirects + Firestore rules
- Admin onboarding wizard (5 steps) + config edit page (live Firestore load)
- Demo customizer: /admin/demo + CLI + per-prospect personalization
- Per-business timezone: IANA field, dropdown in config, all timestamps rendered in business local time
- Usage monitoring across all tenants
- Preview-as-client for superadmin

---

## Pending Items

| Item | Status | Notes |
|------|--------|-------|
| VAPI_WEBHOOK_SECRET mismatch | Bypassed with `VAPI_AUTH_BYPASS=true` | Fix: delete Vercel secret, generate new one, set in both Vercel + Vapi UI |
| lookupAppointment in Vapi UI | Needs Vapi UI step | Add as 5th tool in Vapi dashboard (walkthrough below) |
| businessUsers provisioning on onboarding | Not automated | Must manually create `businessUsers/{uid}` for new clients so they can log in |
| Google Calendar | Not built | Post-MVP, requires per-business OAuth |
| API route auth guards | Not built | API routes trust businessId from request body — Firestore rules are the gate |
| RESEND_FROM verified domain | Not set | Needs verified domain before "From" name shows correctly |
| Job status "Complete" UI | Not built | No button to mark a job complete — status is set manually via Firestore or future update |

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
  Field screen → POST /api/jobs/{jobId}/updates
    → saves rawText to Firestore immediately
    → calls DeepSeek parseFieldUpdate() with job context
    → writes structured ParsedUpdate back to the update doc
    → admin sees parsed data in Jobs → job detail tabs
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
3. Open `/company/field` on a phone (or Chrome mobile simulator)
4. Select the job, tap mic, speak (any language — try Spanish for impact)
5. Submit → go back to job detail on admin to show parsed timeline/materials/issues
6. Click "Generate Invoice" to show draft invoice with editable line items

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/vapi/route.ts` | Single Vapi webhook — all message types |
| `src/lib/vapi/verify.ts` | Webhook secret verification (bypass active) |
| `src/lib/vapi/businessLookup.ts` | Maps vapiAssistantId → businessId |
| `src/lib/tools/agentTools.ts` | All tools + BizBranding email templates |
| `src/lib/ai/deepseekClient.ts` | DeepSeek: summaries, classification, FAQ suggestions, field update parser |
| `src/types/jobs.ts` | Job, FieldUpdate, ParsedUpdate, InvoiceLineItem types |
| `src/app/api/jobs/route.ts` | GET list + POST create (atomic short ID) |
| `src/app/api/jobs/[jobId]/updates/route.ts` | Submit update + DeepSeek parse |
| `src/app/api/jobs/[jobId]/report/route.ts` | Generate text report |
| `src/app/api/jobs/[jobId]/invoice/route.ts` | Generate draft invoice |
| `src/app/company/jobs/page.tsx` | Job list admin view |
| `src/app/company/jobs/[jobId]/page.tsx` | Job detail (6 tabs + invoice editor) |
| `src/app/company/field/page.tsx` | Mobile field screen (voice + text) |
| `src/middleware.ts` | Route protection — checks __session cookie |
| `src/contexts/AuthContext.tsx` | Sets/clears __session cookie |
| `src/hooks/useBusinessId.ts` | Returns ?preview= for superadmin, user.businessId otherwise |
| `src/hooks/useBusinessTimezone.ts` | US_TIMEZONES array + hook for per-business tz |
| `src/app/admin/admin-nav.tsx` | Sidebar nav (Platform / Tools sections) |
| `src/app/admin/guide/page.tsx` | Playbooks — 3 tabs: Demo / Onboarding / Field Ops |
| `src/app/admin/usage/page.tsx` | Platform-wide usage monitoring |
| `src/app/admin/onboarding/page.tsx` | Onboarding wizard (5 steps) |
| `src/app/admin/businesses/[businessId]/config/page.tsx` | Live config edit |
| `src/app/admin/demo/page.tsx` | Demo customizer UI |
| `public/guides/field-operations-guide.html` | Printable field ops guide |
| `public/guides/onboarding-guide.html` | Printable demo + onboarding guide |
| `scripts/seed-demo-business.mjs` | Demo data init (run once) |
| `scripts/provision-superadmin.mjs` | Set custom claim + businessUsers doc |
| `firestore.rules` | Tenant isolation + jobs subcollection rules |

---

## Next Engineering Actions

1. **Fix VAPI_WEBHOOK_SECRET** — remove VAPI_AUTH_BYPASS, set new secret in Vercel + Vapi UI
2. **Add lookupAppointment to Vapi dashboard** — see walkthrough above
3. **businessUsers auto-provisioning** — wire onboarding POST to create `businessUsers/{uid}` from owner email
4. **Job "Complete" button** — add status toggle on job detail header
5. **Phase 3** — after-hours logic, call outcome tagging (DeepSeek), FAQ suggestions cron

---

## Environment Variables (Vercel, Production)

| Var | Status | Purpose |
|-----|--------|---------|
| `VAPI_API_KEY` | ✓ Set | Vapi REST API |
| `VAPI_AUTH_BYPASS` | ✓ Set (true) | Bypasses webhook sig check — remove after secret fix |
| `VAPI_WEBHOOK_SECRET` | ✓ Set (mismatched) | Fix by resetting in both places |
| `OPENAI_API_KEY` | ✓ Set | LLM responses |
| `DEEPSEEK_API_KEY` | ✓ Set | Back-office AI (summaries, parsing) — already working |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✓ Set | Firestore Admin SDK |
| `RESEND_API_KEY` | ✓ Set | Email notifications |
| `RESEND_FROM` | ✓ Set | Needs verified sending domain for correct "From" name |
