# Backlog — AI Receptionist Platform

Parked features worth building later. Not the active sprint (see TODO.md), not current state (see HANDOFF.md).
Each entry has enough context to pick up in 5 minutes. Build when the trigger condition is true.

## Priority Ranking

Scored on **value × ease** (higher = build sooner). Ease weighted heavily — fast wins compound.

| # | Feature | Value | Ease | Score | Trigger |
|---|---------|-------|------|-------|---------|
| 1 | **Multi-Vertical Demo Wizard** | High | Easy — templates already built | ★★★★★ | First non-roofing demo |
| 2 | **After-Hours Logic** | High | Easy — one flag in prompt builder | ★★★★★ | Client complains about 2am bookings |
| 3 | **Job "Complete" Button** | Medium | Easy — one status update call | ★★★★☆ | First field client using jobs feature |
| 4 | **Follow-up Cadence Cron** | High | Medium — daily cron, days [3,7] config | ★★★★☆ | Business wants automated re-engagement |
| 5 | **Call Outcome Tagging** | High | Medium — DeepSeek classify in webhook | ★★★★☆ | Client asks "how many calls convert?" |
| 6 | **Client Login Auto-Provisioning** | Medium | Medium — getUserByEmail + write doc | ★★★☆☆ | First paying client signed |
| 7 | **CRM Webhook Receiver** | High | Medium — generic POST /api/integrations/leads | ★★★☆☆ | Client uses Bonzo/JobNimbus |
| 8 | **Stripe Billing** | High | Hard — billing portal, webhooks, plan gates | ★★★☆☆ | First paying client |

## ✅ Completed
- **Field Job Updates** — short IDs, mobile voice screen, DeepSeek parsing, report + invoice generation
- **Outbound Callbacks** — vapiClient, /api/calls/outbound, auto-callback on lead creation, Call Back buttons on leads + appointments, inbound/outbound filter on calls page
- **UI Modernization** — Inter font, card shadows, logo in nav, job progress bar, company nav icons + pill active state

---

## Multi-Vertical Demo Wizard

**Trigger**: First non-roofing prospect meeting booked (dental, HVAC, landscaping, etc.)

**Value**: Run a live AI demo for any industry, not just roofing. Same phone number, same dashboard — the AI adapts to the vertical on the fly.

**What changes vs. today**: Currently the demo wizard only changes the prospect's company *name*. The AI still talks roofing. This adds an industry dropdown so Alice's entire knowledge base (services, FAQs, emergency rules, greeting) swaps to match the vertical.

**How to build** (half-day):
1. Add industry dropdown to `/admin/demo/page.tsx` (roofing / dental / hvac / landscaping)
2. In `POST /api/admin/demo-customize`, accept `industry` param → load vertical template from `src/lib/verticals/templates.ts` → write those services/FAQs/rules to `businesses/demo-roofing`
3. Call Vapi `PATCH /assistant/{id}` with the new system prompt built from the vertical template
4. That's it — same phone number, same webhook, same dashboard

**Supported verticals already built**: roofing, hvac, dental, landscaping, property-management (all in `src/lib/verticals/templates.ts`)

---

## Client Login Auto-Provisioning

**Trigger**: First paying client signed (currently requires manual Firebase CLI step)

**Value**: When you onboard a new business through Add Company, the client can log in to their dashboard immediately — no manual step from you.

**What's missing**: `POST /api/admin/businesses` creates the Firestore business doc but does NOT create the `businessUsers/{uid}` doc that AuthContext reads for role/businessId. Currently you run `scripts/provision-superadmin.mjs` manually.

**How to build**:
- Accept `ownerEmail` in the onboarding form (already collected)
- In the POST route, look up the Firebase Auth UID for that email via `getAdminAuth().getUserByEmail(email)`
- Write `businessUsers/{uid}: { businessId, role: "admin", businessName }` in the same transaction
- If user doesn't have a Firebase account yet, send a password reset email via Resend so they can set one

---

## After-Hours Logic

**Trigger**: First client complains Alice books appointments at 2am

**Value**: Alice behaves differently outside business hours — softer booking language, no same-day slots, different greeting.

**What's missing**: Alice reads `businessHours` from the config but doesn't check current time before responding.

**How to build**:
- In `agentPromptBuilder.ts`, inject a `IS_AFTER_HOURS: true/false` flag into the system prompt based on `new Date()` vs `businessHours`
- Alice's prompt already has `afterHoursGreeting` — just use it conditionally

---

## Call Outcome Tagging

**Trigger**: First client asks "how many calls turned into leads?"

**Value**: Each call gets tagged (booked / lead-captured / info-only / escalated / missed) so the dashboard shows conversion rate, not just call volume.

**What's missing**: `end-of-call-report` webhook hits Firestore but doesn't run DeepSeek classification.

**How to build**: In the `end-of-call-report` handler in `webhooks/vapi/route.ts`, after saving the transcript, call `classifyCallOutcome()` from DeepSeek and write the `outcome` field to the call doc. Surface it as a tag in `/company/calls`.

---

## Follow-up Cadence Cron

**Trigger**: Business wants automated re-engagement on cold leads.

**Value**: Alice calls leads back on day 3 and day 7 if no appointment was booked, without any staff action.

**What's missing**: `/api/cron/follow-up-calls` route (stub exists). Vercel cron entry. Lead `callAttempts` + `lastCallAttemptAt` fields already on Lead type.

**How to build** (half-day):
1. Implement `src/app/api/cron/follow-up-calls/route.ts` — query leads per business where `status !== "booked"` + `callAttempts < maxCallAttempts` + `daysSinceLastCall` in `followUpDays[]`
2. Call `initiateVapiCall()` for each eligible lead (client already built)
3. Add to `vercel.json` crons: `{ "path": "/api/cron/follow-up-calls", "schedule": "0 14 * * *" }` (2pm UTC daily)
4. Authenticate with `CRON_SECRET` header (already the pattern)

---

## CRM Webhook Receiver

**Trigger**: Client uses Bonzo, JobNimbus, or HubSpot and wants AI follow-up on those leads too.

**Value**: Any CRM can send leads to Alice for immediate callback — one integration, all CRMs.

**How to build**:
1. `POST /api/integrations/leads` — generic receiver (validated via HMAC or shared secret)
2. Normalize to Lead shape → call `createLead()` → auto-callback triggers automatically
3. Per-CRM adapters are just field-mapping wrappers

---

## Stripe Billing

**Trigger**: First client paying (obviously)

**Value**: Subscription management, plan tier enforcement (Standard vs Professional feature gates).

**Notes**: Stripe account already connected (`acct_1Sf8lp0CMYfTqgSy`). Plan tier field (`planTier`) already exists on `BusinessConfig`. Just needs the billing portal wired.
