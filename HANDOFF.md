# AI Receptionist Platform — Handoff

Date: 2026-05-24

## Current Status: Admin UI complete, Preview-as-client wired, Usage monitoring live

The platform is 75% complete. Vapi is live end-to-end. Admin panel has dark sidebar with usage monitoring, preview-as-client, and playbooks tabs. Demo seed is populated in Firestore.

**Demo number**: +1 (754) 283-7658 (Vapi number)
**Demo business**: `demo-roofing` → Apex Roofing South Florida (seeded 2026-05-24)

---

## What Was Built This Session (2026-05-24)

### Admin UI redesign
- Dark sidebar (`#0d1117`) with CSS class system: `.nav-link`, `.nav-section`, `.nav-section-label`, `.admin-brand`, `.admin-sidebar-footer`
- Navigation sections: Platform (Businesses, Add Company, Usage) / Tools (Demo, Playbooks)
- Active nav item highlighted with blue left border + tinted background
- "Client view ↗" link at bottom of sidebar

### Usage monitoring (`/admin/usage`)
- `src/app/admin/usage/page.tsx` — platform-wide totals + per-tenant call/lead/appointment counts
- `src/app/api/admin/usage/route.ts` — Firestore aggregation with Admin SDK `.count()` queries

### Preview-as-client
- `src/hooks/useBusinessId.ts` — returns `?preview=businessId` for superadmin, falls back to `user.businessId`
- All 5 company pages updated to use `useBusinessId()` hook
- Company layout allows superadmin through when `?preview=` param present
- "Preview ↗" button on businesses table → opens `/company/dashboard?preview=businessId` in new tab
- Use this to QA any client's view without creating a separate login

### Concurrent call handling
- Vapi runs in the cloud; every inbound call spawns its own independent session — no queue, no bottleneck from our code. Concurrency limits are set by the Vapi plan (Standard = 10 concurrent, scale on request).

### Playbooks tabs
- `src/app/admin/guide/page.tsx` — two tabs: "Demo Playbook" and "Client Onboarding" switch the iframe src; no more scrolling through both sections
- HTML guide anchors: `#part-1` / `#part-2` added to guide HTML

### Demo data seeded
- `node scripts/seed-demo-business.mjs` run against production Firestore — `demo-roofing` (Apex Roofing South Florida) now live
- To see it in the admin: /admin/businesses → shows the demo tenant with Preview button
- To customize for a prospect: /admin/demo → enter company name + email → click Apply

---

## What Was Built Previously (2026-05-23)

### lookupAppointment tool (new 5th Vapi tool)
- `src/lib/tools/agentTools.ts` — `lookupAppointment()` searches appointments by phone → name → address, returns human-readable summary so Alice can tell callers their upcoming appointment details
- `src/app/api/webhooks/vapi/route.ts` — wired as `case "lookupAppointment"`
- **Still needs**: Add as 5th tool in Vapi dashboard (see walkthrough below)

### Email branding — now client-branded, not Luxor-branded
- `agentTools.ts` — `BizBranding` interface reads `brandColor`, `logoUrl`, `contactPhone`, `contactEmail` from Firestore doc
- `brandHeader()` / `emailShell()` render client logo/colors in notification + escalation emails
- "Powered by Luxor AI" appears only as near-invisible footer text (`color: #e2e8f0`)

### Send Confirmation button on appointments page
- `src/app/company/appointments/page.tsx` — "Send Confirmation" button calls `POST /api/appointments/send-confirmation`
- `src/app/api/appointments/send-confirmation/route.ts` — reads business branding, sends branded HTML email, marks appointment confirmed in Firestore
- After click: button collapses, shows green "✓ Confirmation sent"

### Admin onboarding — now accepts Vapi IDs + branding
- `src/app/admin/onboarding/page.tsx` — added step 5 "Vapi and Branding": vapiAssistantId, vapiPhoneNumberId, brandColor, contactPhone, logoUrl
- `src/app/api/admin/businesses/route.ts` POST — stores those fields in the Firestore business doc

### Business config edit — loads live data
- `src/app/admin/businesses/[businessId]/config/page.tsx` — rewrote to `GET /api/admin/businesses/{id}/config` on load; all fields show real Firestore values (no more hardcoded defaults)
- `src/app/api/admin/businesses/[businessId]/config/route.ts` — added GET handler; PUT now accepts vapiAssistantId, vapiPhoneNumberId, and all branding fields

### Admin businesses list — live data
- `src/app/admin/businesses/page.tsx` — fetches from `GET /api/admin/businesses`; shows live table with Vapi status, Edit link per row

### Route protection — Next.js middleware
- `src/middleware.ts` — checks `__session` cookie on `/admin/*` and `/company/*`; redirects to `/login?next=<path>` if missing
- `src/contexts/AuthContext.tsx` — sets cookie on login, clears on logout
- Layout redirects remain for role-split (company user hitting /admin → /company/dashboard)

### Calls page cleanup
- System prompt filtered from transcript (role-filter: only "caller" | "agent")
- "Roofus" references replaced with "Alice"
- AI summary block shown above transcript when available
- Duration and formatted timestamp shown per call

### Firestore rules + superadmin provisioning
- `firestore.rules` — `isSuperadmin()` checks Firebase custom claim OR `businessUsers/{uid}.superadmin == true` (dual-path)
- `scripts/provision-superadmin.mjs` — sets custom claim + creates `businessUsers` doc for connect@luxordev.com (already run)

---

## Pending Items

| Item | Status | Notes |
|------|--------|-------|
| VAPI_WEBHOOK_SECRET mismatch | Bypassed with `VAPI_AUTH_BYPASS=true` | Fix: delete Vercel secret, generate new one, set in Vercel + Vapi UI (assistant Advanced + each tool) |
| lookupAppointment in Vapi UI | Needs Vapi UI step | See walkthrough below — add as 5th tool in Vapi dashboard |
| businessUsers provisioning on onboarding | Not automated | When onboarding a new client, their `businessUsers/{uid}` doc must be created manually so they can log in and see their data. Script: `scripts/provision-superadmin.mjs` pattern |
| Voice upgrade | User task in Vapi UI | Switch to `eleven_turbo_v2_5` + Rachel voice ID `21m00Tcm4TlvDq8ikWAM`; tighten endpointing to 300ms; cap responses to 2 sentences |
| Google Calendar integration | Not built | Post-MVP; requires per-business OAuth |
| API route auth guards | Not built | API routes don't verify Firebase tokens yet — Firestore rules are the gate |
| RESEND_FROM verified domain | Not set | Needs verified Resend domain before "From" name shows correctly |

---

## Vapi walkthrough — Adding lookupAppointment as 5th tool

1. Go to **dashboard.vapi.ai** → **Tools** → **+ Create Tool**
2. Select **Function**
3. Fill in:
   - **Name**: `lookupAppointment`
   - **Description**: `Look up an existing appointment for the caller. Call this when the caller asks about their upcoming appointment, wants to check a booking, or mentions they have an appointment scheduled.`
   - **Server URL**: `https://ai-roof.vercel.app/api/webhooks/vapi`
   - Add header: `x-vapi-secret` → paste your webhook secret (or leave blank while VAPI_AUTH_BYPASS is active)
4. Add these parameters (type: string, not required unless noted):
   - `callerPhone` — "The caller's phone number as provided or detected"
   - `callerName` — "The caller's name if they provided it"
   - `address` — "The service address if the caller mentioned it"
5. Save the tool
6. Go to **Assistants** → select **Alice** (9267a84a-...) → **Tools** tab → **+ Add Tool** → select `lookupAppointment`
7. Save the assistant

Test: call the demo number, say "I'd like to check my appointment" — Alice should call the tool and read back the appointment details.

---

## Architecture (Current)

```
Inbound call → Vapi phone number → Vapi assistant (Alice, 9267a84a)
  → Deepgram nova-3 STT (~100ms)
  → Claude Haiku 4.5 via Vapi LLM config
  → ElevenLabs TTS (~612ms)
  → Vapi posts webhook to: https://ai-roof.vercel.app/api/webhooks/vapi

Vapi webhook types handled:
  function-call / tool-calls  → routes to agentTools.ts
    bookAppointment           → writes Firestore appt doc + sends branded Resend email
    createLead                → writes Firestore lead doc
    escalateCall              → sends escalation email
    checkAvailability         → returns mock availability slots
    lookupAppointment         → queries Firestore, returns human-readable appt summary
  status-update               → creates/updates call record in Firestore calls/{callId}
  end-of-call-report          → saves transcript, recording URL, summary to Firestore
```

Business lookup: `src/lib/vapi/businessLookup.ts` maps `vapiAssistantId → businessId` via Firestore query.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/vapi/route.ts` | Single Vapi webhook — handles all message types |
| `src/lib/vapi/verify.ts` | Webhook secret verification (bypass active) |
| `src/lib/vapi/businessLookup.ts` | Maps vapiAssistantId → businessId |
| `src/lib/tools/agentTools.ts` | All tools + BizBranding email templates |
| `src/middleware.ts` | Route protection — checks __session cookie |
| `src/contexts/AuthContext.tsx` | Sets/clears __session cookie on auth state change |
| `src/hooks/useBusinessId.ts` | Returns `?preview=businessId` for superadmin, user.businessId otherwise |
| `src/app/admin/admin-nav.tsx` | Sidebar nav (sections: Platform / Tools) |
| `src/app/admin/usage/page.tsx` | Platform-wide usage monitoring |
| `src/app/api/admin/usage/route.ts` | Firestore aggregation per tenant |
| `src/app/admin/onboarding/page.tsx` | Onboarding form (5 steps, includes Vapi IDs) |
| `src/app/admin/businesses/page.tsx` | Live business list + Edit + Preview buttons |
| `src/app/admin/businesses/[businessId]/config/page.tsx` | Live config edit |
| `src/app/admin/guide/page.tsx` | Playbooks page with Demo/Onboarding tabs |
| `src/app/api/admin/businesses/route.ts` | GET list + POST create |
| `src/app/api/admin/businesses/[businessId]/config/route.ts` | GET + PUT config |
| `src/app/api/appointments/send-confirmation/route.ts` | Branded confirmation email |
| `src/app/admin/demo/page.tsx` | Demo customizer UI |
| `scripts/demo-customize.mjs` | CLI demo customizer |
| `scripts/provision-superadmin.mjs` | Set custom claim + businessUsers doc |
| `scripts/seed-demo-business.mjs` | Demo data init (run once against prod Firestore) |

---

## How to Run a Demo

1. Go to `/admin/demo`
2. Enter prospect company name + email → click **Apply demo config**
3. Have the prospect call **+1 (754) 283-7658**
4. Alice greets them as their company
5. They can book — email arrives in prospect inbox in real time
6. Open `/company/dashboard` to show the captured data live
7. Click **Reset to defaults** when done

---

## Next Engineering Actions

1. **Fix VAPI_WEBHOOK_SECRET** — remove VAPI_AUTH_BYPASS, set new secret in Vercel + Vapi
2. **Add lookupAppointment to Vapi dashboard** — see walkthrough above
3. **businessUsers provisioning** — wire the POST `/api/admin/businesses` to create `businessUsers/{uid}` when owner email matches a Firebase Auth UID
4. **Phase 3** — after-hours logic, call outcome tagging (DeepSeek), FAQ suggestions cron

---

## Environment Variables (Vercel, Production)

| Var | Purpose |
|-----|---------|
| `VAPI_API_KEY` | Vapi REST API for demo-customize + assistant management |
| `VAPI_AUTH_BYPASS` | `true` — bypasses webhook signature check (remove after secret fix) |
| `VAPI_WEBHOOK_SECRET` | Currently mismatched; bypass active |
| `OPENAI_API_KEY` | LLM responses |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firestore Admin SDK |
| `RESEND_API_KEY` | Email notifications |
| `RESEND_FROM` | Needs a verified Resend sending domain |
