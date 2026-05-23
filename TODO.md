# TODO: AI Receptionist Platform — Production Roadmap

> **Stack**: Next.js 15 + TypeScript + Firebase (Auth + Firestore) + OpenAI + DeepSeek + Vapi + ElevenLabs + Resend
> **Hosting**: Vercel | **Firebase Project**: `business-expense-trackin-ef659`
> **Repo**: `https://github.com/K-WAM/AIRoof` | **Vercel Project ID**: `prj_Z7wLkNHfQUm8JsnDAWrfuOHPOmy2`
> **Vercel URL**: https://ai-roof.vercel.app
> **Completion**: ~65%

---

## WHAT'S DONE ✅

### Infrastructure
- Firebase Admin + Client SDKs wired (singleton pattern)
- Firestore rules deployed, phone number index deployed
- Firebase Auth enabled (Google + email/password)
- Vercel env vars configured (OpenAI, DeepSeek, Vapi, Firebase, Resend)
- Health endpoint green: `{ firestore: "connected", openai: "configured" }`
- Seed script run — demo-roofing live in Firestore (Apex Roofing South Florida / Alice)

### Vapi Voice AI (Phase 2 — Complete)
- Migrated from custom Twilio webhook pipeline to Vapi
- Vapi assistant: Alice (`9267a84a-0f4f-416b-a328-1dc539f5265e`) — Claude Haiku 4.5 LLM + ElevenLabs TTS + Deepgram STT
- Single Vapi webhook at `/api/webhooks/vapi` handles function-call, status-update, end-of-call-report
- Conversation memory: prior call turns passed to OpenAI as message history
- Tool use confirmed live: bookAppointment fires → Firestore appointment + Resend email to inbox
- 4 Vapi tools configured: bookAppointment, createLead, escalateCall, checkAvailability

### Demo Customizer
- `/admin/demo` page — enter prospect company + email, click Apply
- `/api/admin/demo-customize` POST/DELETE — updates Firestore + PATCHes Vapi firstMessage
- `scripts/demo-customize.mjs` — CLI equivalent
- Admin nav updated to include "Demo" link

### AI Receptionist Core
- Scope classifier — 16 OFF_TOPIC_PATTERNS, deterministic, before any OpenAI call
- Prompt builder — injects company name, services, FAQs, hours, area, rules into every call
- OpenAI client (Claude Haiku 4.5 via Vapi) — live call responses with conversation history
- DeepSeek client — wired for summarizeTranscript, classifyCallOutcome, generateFaqSuggestions

### Notifications
- Resend wired in escalateCall() — urgent escalation email to notificationEmail
- Resend wired in bookAppointment() — booking confirmation to notificationEmail

### Auth
- Google + email/password login page at /login
- AuthContext — Firebase ID token, businessId, role from businessUsers collection
- Company layout guard — redirects to /login if not signed in
- Admin layout guard — redirects non-superadmins away from /admin
- Superadmin provisioned: connect@luxordev.com
- Root page.tsx: redirects to /login (404 fixed)

### Company Dashboard (all 5 pages wired to live Firestore)
- /company/dashboard — call count, lead count, appointment count, recent leads, agent config
- /company/leads — live leads, click-to-select detail, Mark Contacted button
- /company/calls — call history, click to read full transcript
- /company/appointments — upcoming/past split, Confirm and Cancel buttons
- /company/agent — full BusinessConfig display (services, FAQs, rules, routing)

### Multi-tenant
- All data scoped by businessId
- businessPhoneNumbers collection maps Vapi assistant IDs to businesses
- Firestore rules prevent cross-business reads

---

## WHAT'S MISSING — PRIORITY ORDER ❌

### P0 — Demo-blocking

- [ ] **RESEND_FROM env var** — add to Vercel: `Alice <notify@yourdomain.com>` (needs a verified Resend sending domain so "From" shows correctly)
- [ ] **Voice upgrade** — user task in Vapi UI: switch Alice to `eleven_multilingual_v2` + Rachel voice ID `21m00Tcm4TlvDq8ikWAM` for hyper-realistic demo voice

### P1 — Makes the product sellable

- [ ] **VAPI_WEBHOOK_SECRET** — currently bypassed with `VAPI_AUTH_BYPASS=true`; to fix: delete in Vercel, generate new secret, set in Vercel, paste in Vapi assistant → Advanced → Server URL headers AND in each of the 4 tool server headers
- [ ] **Superadmin onboarding wizard** — `/admin/onboarding` should auto-create a Vapi assistant + phone number + 4 tools via Vapi REST API, then write `businesses/` and `businessPhoneNumbers/` docs to Firestore; currently manual steps
- [ ] **Admin business list** — `/admin/businesses` shows static mock; wire to live Firestore businesses collection
- [ ] **Client onboarding guide** — internal doc: how to onboard a paying client (Vapi assistant setup, Firestore seed, businessUsers login)

### P2 — Makes it feel complete

- [ ] **After-hours logic** — Alice currently responds the same 24/7; check current time against businessHours and use afterHoursGreeting + softer booking behavior after hours
- [ ] **Call outcome tagging** — after each call ends (end-of-call-report webhook), run DeepSeek classifyCallOutcome() and write outcome field to call doc; show in /company/calls
- [ ] **FAQ suggestions cron** — POST /api/cron/faq-suggestions is stubbed; wire DeepSeek generateFaqSuggestions() and surface pending suggestions in /company/agent
- [ ] **FAQ approve/reject in UI** — approve/reject buttons on /company/agent not wired to API endpoint

### P3 — Post-first-customer

- [ ] **Google Calendar integration** — replace mock checkAvailability() slots with real Google Calendar free/busy query; requires OAuth per business
- [ ] **SMS escalation** — requires Twilio A2P 10DLC registration (~2-4 weeks approval); email covers MVP
- [ ] **Stripe billing** — subscription management, plan tier enforcement
- [ ] **Additional verticals** — HVAC, dental, property management (templates already stubbed)

---

## ARCHITECTURE (Current)

```
Inbound call → Vapi phone +1 (754) 283-7658 → Vapi assistant Alice (9267a84a)
  → Deepgram nova-3 STT (~100ms)
  → Claude Haiku 4.5 (via Vapi LLM config)
  → ElevenLabs TTS (~612ms)
  → Vapi webhooks POST to: https://ai-roof.vercel.app/api/webhooks/vapi

Webhook message types:
  function-call        → agentTools.ts (bookAppointment, createLead, escalateCall, checkAvailability)
  status-update        → creates call record in Firestore calls/{callId}
  end-of-call-report   → saves transcript, recording URL, summary to Firestore

Business lookup:
  vapiAssistantId → businessLookup.ts → businessId → BusinessConfig from Firestore
```

## KEY FILES

| File | Purpose |
|------|---------|
| src/app/api/webhooks/vapi/route.ts | Single Vapi webhook handler |
| src/lib/vapi/types.ts | Vapi payload types |
| src/lib/vapi/verify.ts | Webhook secret verification (bypass active) |
| src/lib/vapi/businessLookup.ts | Maps vapiAssistantId → businessId |
| src/lib/ai/agentPromptBuilder.ts | Builds system prompt from BusinessConfig |
| src/lib/ai/scopeClassifier.ts | Deterministic off-topic defense |
| src/lib/ai/openaiClient.ts | OpenAI wrapper (accepts conversation history) |
| src/lib/tools/agentTools.ts | bookAppointment, createLead, escalateCall (Resend wired) |
| src/app/admin/demo/page.tsx | Demo customizer UI |
| src/app/api/admin/demo-customize/route.ts | Demo POST/DELETE |
| scripts/demo-customize.mjs | CLI demo customizer |
| scripts/seed-demo-business.mjs | Seed demo-roofing (run with node, not ts-node) |
| firestore.rules | Tenant isolation rules (deployed) |

## DEMO BUSINESS

- **businessId**: demo-roofing
- **Name**: Apex Roofing South Florida
- **Agent**: Alice (Vapi assistant `9267a84a-0f4f-416b-a328-1dc539f5265e`)
- **Phone**: +1 (754) 283-7658 (Vapi number)
- **Demo customizer**: `/admin/demo` or `node scripts/demo-customize.mjs <email> "<Name>"`
- **Reset**: click Reset in UI or `node scripts/demo-customize.mjs --reset`
- **Login**: sign in with connect@luxordev.com → /admin access
