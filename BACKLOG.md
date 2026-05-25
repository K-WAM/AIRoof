# Backlog — AI Receptionist Platform

Parked features worth building later. Not the active sprint (see TODO.md), not current state (see HANDOFF.md).
Each entry has enough context to pick up in 5 minutes. Build when the trigger condition is true.

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

## Stripe Billing

**Trigger**: First client paying (obviously)

**Value**: Subscription management, plan tier enforcement (Standard vs Professional feature gates).

**Notes**: Stripe account already connected (`acct_1Sf8lp0CMYfTqgSy`). Plan tier field (`planTier`) already exists on `BusinessConfig`. Just needs the billing portal wired.
