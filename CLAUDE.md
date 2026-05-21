# AI Receptionist Platform — CLAUDE.md

**Project**: AI Receptionist Platform for local service businesses
**Status**: Phase 1 complete — live receptionist working, UI wiring (Phase 1F) next
**Estimated Completion**: 55%
**Tech Stack**: Next.js 15, TypeScript, Firebase Auth, Firestore, OpenAI, DeepSeek, Twilio, Resend, Vercel
**Repository**: https://github.com/K-WAM/AIRoof
**Vercel Project ID**: prj_Z7wLkNHfQUm8JsnDAWrfuOHPOmy2
**Vercel URL**: (deployment pending — not yet live)
**Firebase Project**: business-expense-trackin-ef659 (web app: "airoof")
**Firebase Auth Domain**: business-expense-trackin-ef659.firebaseapp.com
**Superadmin**: connect@luxordev.com

## Overview

Multi-tenant phone AI agent answering inbound calls, qualifying leads, booking appointments, escalating urgent cases. Strict AI constraint strategy: deterministic scope classifier (patterns, before model), prompt builder (business rules), OpenAI API (live response), tool interface (scoped actions). First vertical: roofing. Designed for safe cost and easy expansion to new verticals.

## Progress Reporting

When handing off or answering "what's next", include an estimated completion percentage for the overall platform and a one-step next action. Keep the percentage pragmatic, not overly precise.

Current estimate: **55% complete**.

Basis:
- Core backend/API scaffolding exists and is deployed on Vercel.
- Firestore rules and indexes deployed. Seed data live (demo-roofing).
- Health endpoint returns green (firestore + openai + deepseek all configured).
- Roofus (AI receptionist) responds correctly to real calls — tested end-to-end.
- DeepSeek wired for back-office processing (summaries, classification, FAQ suggestions).
- Auth guards on /company and /admin layouts; Google login page live.
- Twilio webhooks fixed: real phone lookup, Twilio signature verification, no collection scan.
- Resend emails wired: escalation + booking confirmation notifications.
- Remaining: company UI pages wired to live Firestore (Phase 1F), Twilio webhook URL configured in Twilio console.

## Architecture

### Layers (Defensive)
1. **Scope Classifier** - deterministic pattern matching (OFF-TOPIC patterns, ALLOWED_SERVICE patterns) — rejects off-topic BEFORE OpenAI call
2. **Prompt Builder** — generates system prompt from BusinessConfig (approved services, FAQs, emergency rules, disallowed topics)
3. **OpenAI Client** — calls the business-configured live model with constraints; falls back to safe mock if key missing
4. **Agent Tools** — checkAvailability, bookAppointment, createLead, escalateCall, logAgentAction; all scoped by businessId

### Data Model (Firestore)
```
businesses/{businessId}
  ├── config (BusinessConfig document)
  ├── calls/{callId}
  │   └── messages[] (CallMessage with classification)
  ├── leads/{leadId}
  ├── appointments/{appointmentId}
  └── agentActions/{actionId}
```

### Multi-Tenant Isolation
- All Firestore operations scoped by businessId
- Security rules prevent cross-business reads
- API endpoints validate business exists before operating
- No hardcoded secrets or business IDs

## Demo Business (Seed)

**ID**: demo-roofing
**Name**: Apex Roofing South Florida
**Agent**: Roofus
**Phone**: +16892042643
**Services**: Inspections, shingle replacement, metal roofing, emergency repairs
**Service Area**: Miami, Coral Gables, Doral, Hialeah, Kendall, Homestead

Run seed script: `node scripts/seed-demo-business.mjs` (plain ESM — no ts-node needed)
Do NOT use `npx ts-node scripts/seed-demo-business.ts` — it fails due to `moduleResolution: bundler` in tsconfig (see Lesson 65).

## Core Routes (Implemented)

| Route | Purpose |
|-------|---------|
| POST /api/agent/respond | Main entry: classify → prompt → OpenAI → log |
| POST /api/agent/classify | Test scope classifier |
| GET /api/health | Health check |
| GET /api/businesses/:businessId/agent-config | Retrieve business config |
| POST /api/webhooks/twilio/incoming | Receive call |
| POST /api/webhooks/twilio/transcribe | Process speech |
| GET/PUT /api/calls/:callId | Call record management |
| DELETE /api/calls/:callId | End call without deleting audit trail |
| POST /api/tools/execute | Execute tools (checkAvailability, bookAppointment, etc.) |

## Scope Classifier (Defense Layer)

**OFF-TOPIC** (rejected before OpenAI):
- Stocks, crypto, investments
- Politics, elections
- Medical/legal/financial advice
- News, sports, entertainment
- Relationships, dating
- Coding, software, trivia

**EMERGENCY** (immediate escalation):
- Water entry, leak, flooding
- Fire, electrical hazards
- Urgent keyword

## Environment Variables (Required)

- OPENAI_API_KEY
- FIREBASE_SERVICE_ACCOUNT_JSON
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_APP_ID

See .env.example for full list and optional vars.

## Admin Onboarding (For Adding New Businesses)

See **[docs/ADMIN-ONBOARDING.md](docs/ADMIN-ONBOARDING.md)** for complete workflow:

1. Collect business info (name, services, hours, FAQs, rules)
2. Create BusinessConfig in Firestore
3. Configure approved services, FAQs, emergency rules, booking rules, disallowed topics
4. Map phone number to businessId
5. Test agent responses (/api/agent/respond, /api/agent/classify)
6. Deploy to production (Firestore rules, Twilio webhooks, Google Calendar if needed)

**Quick Checklist**: businessId, businessName, approvedServices[], approvedFaqs[], emergencyRules[], bookingRules[], escalationPhone, notificationEmail, calendarProvider

## Key Files

- src/types/index.ts — Type definitions
- firestore.rules — Draft tenant isolation rules
- src/app/admin/onboarding/page.tsx — Superadmin onboarding wizard shell
- src/app/company/dashboard/page.tsx — Company operations dashboard shell
- src/app/company/leads/page.tsx — Company lead queue shell
- src/app/company/calls/page.tsx — Company call history/transcript shell
- src/app/company/appointments/page.tsx — Company inspection schedule shell
- src/lib/verticals/templates.ts — Vertical templates, currently roofing defaults with placeholders for other industries
- src/lib/ai/planPresets.ts — Standard/Subscriber model, voice, and tuning presets
- src/lib/ai/scopeClassifier.ts — Off-topic defense
- src/lib/ai/agentPromptBuilder.ts — System prompt generation
- src/lib/ai/openaiClient.ts — OpenAI wrapper
- src/lib/tools/agentTools.ts — Scoped actions
- src/app/api/agent/respond/route.ts — Main endpoint
- scripts/seed-demo-business.ts — Demo data init
- docs/README.md — Documentation index & overview
- docs/ADMIN-QUICK-START.md — Fast 5-step onboarding checklist
- docs/ADMIN-ONBOARDING.md — Complete business onboarding guide
- TESTING.md — Test cases & verification procedures
- TODO.md — Implementation roadmap (13 phases)

## Agent Verification Protocol

Before asking the user to verify anything, use CLI/curl first:
- **Is Firestore connected?** `curl https://<domain>/api/health`
- **Did the deploy succeed?** `vercel ls` or check `git log --oneline -3`
- **Is a package installed?** `npm list <package>`
- **Did Firestore rules deploy?** `firebase deploy --only firestore:rules --project <id> --dry-run`
- **Is a file/path correct?** Use Glob, Grep, or Read — not user confirmation
- Only fall back to asking the user when the CLI genuinely cannot answer (web UI OAuth flows, Twilio console webhook URLs, Vercel env var entry).

## Next Steps

1. **CURRENT**: Wire Phase 1F — company UI pages to live Firestore (dashboard, leads, calls, appointments, agent config)
2. Configure Twilio Voice webhook URL in Twilio console → `https://<vercel-domain>/api/webhooks/twilio/incoming`
3. Add RESEND_FROM env var to Vercel (format: `Roofus <notify@yourdomain.com>`)
4. Test end-to-end: real call → Roofus responds → Firestore logged → email sent

## Implementation Phases

- Phase 0: Firebase project setup ✓
- Phase 1A: DeepSeek back-office wired ✓
- Phase 1B: Auth guards + login page ✓
- Phase 1C: Twilio webhooks fixed (phone lookup, sig verification, no collection scan) ✓
- Phase 1D: Phone number activation (businessPhoneNumbers collection, active: true) ✓
- Phase 1E: Resend email notifications (escalation + booking confirmation) ✓
- Phase 1F: Company UI pages → live Firestore ← CURRENT
- Phase 2: Twilio Voice webhook configured in Twilio console
- Phase 3: Google Calendar integration (post-MVP)
- Phase 4: SMS escalation via Twilio (post A2P 10DLC approval)
- Phase 5: DeepSeek cron jobs (call summaries, FAQ generation)
- Phase 6: Additional verticals (HVAC, dental, property management)

## Known Limitations

- Company dashboard pages (dashboard, leads, calls, appointments, agent) show static shells — Phase 1F pending
- Google Calendar uses mock availability slots — real OAuth is post-MVP
- SMS escalation requires A2P 10DLC registration (2–4 weeks) — email covers MVP
- Twilio Voice webhook URL must be configured in Twilio console manually

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
