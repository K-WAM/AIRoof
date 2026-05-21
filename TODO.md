# TODO: AI Receptionist Platform — Production Roadmap

> **Stack**: Next.js 15 + TypeScript + Firebase (Auth + Firestore) + OpenAI + DeepSeek + Twilio + Resend
> **Hosting**: Vercel | **Firebase Project**: `business-expense-trackin-ef659`
> **Repo**: `https://github.com/K-WAM/AIRoof` | **Vercel Project ID**: `prj_Z7wLkNHfQUm8JsnDAWrfuOHPOmy2`
> **Completion**: ~60%

---

## WHAT'S DONE ✅

### Infrastructure
- Firebase Admin + Client SDKs wired (singleton pattern)
- Firestore rules deployed, phone number index deployed
- Firebase Auth enabled (Google provider)
- Vercel env vars configured (OpenAI, DeepSeek, Twilio, Firebase, Resend)
- Health endpoint green: `{ firestore: "connected", openai: "configured", deepseek: "configured" }`
- Seed script run — demo-roofing live in Firestore (Apex Roofing South Florida / Roofus)

### AI Receptionist Core
- Scope classifier — 16 OFF_TOPIC_PATTERNS, deterministic, before any OpenAI call
- Prompt builder — injects company name, services, FAQs, hours, area, rules into every call
- OpenAI client (gpt-4o-mini) — live call responses
- DeepSeek client — wired for summarizeTranscript, classifyCallOutcome, generateFaqSuggestions
- agentTools.ts — checkAvailability, bookAppointment, createLead, escalateCall, logAgentAction

### Twilio Webhooks
- `POST /api/webhooks/twilio/incoming` — real Firestore phone lookup, Twilio sig verification, greeting from BusinessConfig
- `POST /api/webhooks/twilio/transcribe` — reads businessId/callId from URL (no collection scan), classifies, calls OpenAI, logs transcript
- **Gap**: Twilio Voice webhook URL not yet set in Twilio console (manual step, 2 min)

### Notifications
- Resend wired in escalateCall() — urgent escalation email to notificationEmail
- Resend wired in bookAppointment() — booking confirmation to notificationEmail

### Auth
- Google login page at /login
- AuthContext — Firebase ID token, businessId, role from businessUsers collection
- Company layout guard — redirects to /login if not signed in
- Admin layout guard — redirects non-superadmins away from /admin
- authMiddleware.ts — requireAuth, requireSuperadmin, requireBusinessMember for API routes

### Company Dashboard (all 5 pages wired to live Firestore)
- /company/dashboard — call count, lead count, appointment count, recent leads, agent config
- /company/leads — live leads, click-to-select detail, Mark Contacted button
- /company/calls — call history, click to read full transcript
- /company/appointments — upcoming/past split, Confirm and Cancel buttons
- /company/agent — full BusinessConfig display (services, FAQs, rules, routing)

### Multi-tenant
- All data scoped by businessId
- businessPhoneNumbers collection maps Twilio numbers to businesses
- Firestore rules prevent cross-business reads

---

## WHAT'S MISSING — PRIORITY ORDER ❌

### P0 — Makes calls actually work end-to-end (do these first)

- [ ] **Twilio Voice webhook URL** — set in Twilio console → phone number → Voice webhook → `https://<vercel-domain>/api/webhooks/twilio/incoming` POST
- [ ] **RESEND_FROM env var** — add to Vercel: `Roofus <notify@yourdomain.com>` (needs a verified Resend sending domain)
- [ ] **Conversation memory** — Twilio transcribe webhook currently stateless; each turn Roofus sees only the current speech, not prior turns. Must load call's messages[] from Firestore and pass conversation history to OpenAI. Without this, Roofus can't collect name + address + service across multiple turns.
- [ ] **Tool use during calls** — Roofus never calls bookAppointment() or createLead() mid-call. Need to parse OpenAI's intent from the response and invoke tools when enough info is collected (name, phone, service, address).

### P1 — Makes the product sellable

- [ ] **Admin business list** — /admin/businesses shows static mock; wire to GET /api/admin/businesses
- [ ] **Admin onboarding UI** — test the wizard end-to-end; confirm it writes a valid BusinessConfig + businessPhoneNumbers doc
- [ ] **Voice picker** — agentVoice field in Firestore controls Twilio voice. Expose a selector in /company/agent or admin config. Twilio options: `alice`, `man`, `woman`. Polly options: `Polly.Joanna`, `Polly.Matthew`, etc.
- [ ] **Client onboarding guide** — internal doc: how to manually onboard a paying client (seed their config, map their Twilio number, create their businessUsers login)

### P2 — Makes it feel complete

- [ ] **After-hours logic** — currently Roofus uses the same greeting 24/7. Should check current time against businessHours and use afterHoursGreeting + different behavior after hours
- [ ] **Call outcome tagging** — after a call ends, run DeepSeek classifyCallOutcome() and write outcome field to the call doc; show in calls page
- [ ] **FAQ suggestions cron** — POST /api/cron/faq-suggestions already exists as a stub; wire DeepSeek generateFaqSuggestions() and surface pending suggestions in /company/agent
- [ ] **FAQ approve/reject in UI** — approve/reject buttons on /company/agent are not wired to the API endpoint

### P3 — Post-first-customer

- [ ] **Google Calendar integration** — replace mock checkAvailability() slots with real Google Calendar free/busy query; requires OAuth per business
- [ ] **SMS escalation** — requires Twilio A2P 10DLC registration (~2-4 weeks approval); email covers MVP
- [ ] **Stripe billing** — subscription management, plan tier enforcement
- [ ] **Additional verticals** — HVAC, dental, property management (templates already stubbed)
- [ ] **WebSocket streaming** — sub-1s response latency using Twilio Media Streams + OpenAI Realtime API; current TwiML Gather/Say latency is 3-4s which is acceptable for MVP

---

## ARCHITECTURE REMINDER

```
Inbound call → Twilio → /api/webhooks/twilio/incoming
  → looks up businessId from businessPhoneNumbers (Firestore)
  → creates call record
  → returns TwiML <Gather> with Roofus greeting

Caller speaks → Twilio transcribes → /api/webhooks/twilio/transcribe
  → reads businessId + callId from URL params (no collection scan)
  → loads BusinessConfig from Firestore
  → scope classifier (deterministic, no AI cost)
  → if allowed: buildAgentPrompt() → OpenAI gpt-4o-mini → response text
  → logs turn to call.messages[]
  → returns TwiML <Say> + <Gather> for next turn

Post-call (not yet built):
  → DeepSeek summarizeTranscript()
  → DeepSeek classifyCallOutcome()
  → Resend escalation email (already built for mid-call escalation)
```

## KEY FILES

| File | Purpose |
|------|---------|
| src/lib/ai/agentPromptBuilder.ts | Builds system prompt from BusinessConfig |
| src/lib/ai/scopeClassifier.ts | Deterministic off-topic defense |
| src/lib/ai/openaiClient.ts | OpenAI wrapper |
| src/lib/ai/deepseekClient.ts | DeepSeek back-office (summarize, classify, FAQ) |
| src/lib/tools/agentTools.ts | bookAppointment, createLead, escalateCall (Resend wired) |
| src/app/api/webhooks/twilio/incoming/route.ts | Twilio inbound call handler |
| src/app/api/webhooks/twilio/transcribe/route.ts | Speech → AI → TwiML response |
| src/app/api/agent/respond/route.ts | Non-Twilio agent endpoint (testing) |
| src/lib/verticals/templates.ts | Per-industry config templates |
| scripts/seed-demo-business.mjs | Seed demo-roofing (run with node, not ts-node) |
| firestore.rules | Tenant isolation rules (deployed) |

## DEMO BUSINESS

- **businessId**: demo-roofing
- **Name**: Apex Roofing South Florida
- **Agent**: Roofus
- **Phone**: +16892042643
- **Login**: sign in with Google → must have businessUsers doc with businessId: "demo-roofing"
