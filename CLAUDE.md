# AI Receptionist Platform — CLAUDE.md

**Project**: AI Receptionist Platform for local service businesses
**Status**: Phase 0 Firebase project setup (add airoof web app to existing Firebase project)
**Estimated Completion**: 28%
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

Current estimate: **28% complete**.

Basis:
- Core backend/API scaffolding exists.
- TypeScript configuration and type-checking pass.
- Firestore security rules are drafted but not deployed or tested.
- Superadmin onboarding shell exists.
- Company dashboard, leads, calls, and appointments shells exist.
- Named receptionist fields and prompt behavior exist: agentName, agentIdentity, greeting, afterHoursGreeting, easygoing one-question-at-a-time style.
- Credentials, real data persistence, auth guards, Twilio real audio, calendar, notifications, cron jobs, and production deployment are not done.

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
**Name**: Apex Roofing
**Services**: Inspections, shingle replacement, metal roofing, emergency repairs
**Service Area**: Vancouver, Burnaby, New Westminster, Coquitlam

Run seed script: `npx ts-node scripts/seed-demo-business.ts`

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

## Next Steps

1. **CURRENT**: Add airoof web app to existing Firebase project (Console → ⚙️ → Add app → Web). Copy config to `.env`. Download service account key.
2. Enable Firebase Auth providers (Google), add Vercel domain to authorized domains.
3. Connect Vercel project to GitHub repo and configure env vars.
4. Seed demo-roofing business: `npx ts-node scripts/seed-demo-business.ts`
5. Test endpoints: /api/agent/respond, /api/agent/classify, /api/tools/execute
6. Deploy/test Firestore security rules.
7. Wire Firebase Auth guards into admin and company routes.
8. Wire Twilio real audio, calendar, Resend email/SMS, and DeepSeek back-office tasks.

## Implementation Phases

- Phase 0: Firebase project setup (add web app to existing project) ← CURRENT
- Phase 1: Core infrastructure ✓
- Phase 2: Core API routes ✓
- Phase 3: Demo data, testing & admin docs (seed script written, testing pending)
- Phase 4: Firestore security rules (drafted, deployment/testing pending)
- Phase 5: Admin/company dashboard scaffolding (auth guards pending)
- Phase 6: Public pages (landing, ToS, demo widget)
- Phase 7: Twilio real audio
- Phase 8: Google Calendar integration
- Phase 9: Email/SMS notifications (Resend + Twilio)
- Phase 10: DeepSeek back-office
- Phase 11: Monitoring & logging
- Phase 12: Multi-tenant isolation audit
- Phase 13: Lawns/landscaping vertical
- Phase 14: Additional verticals (dental, HVAC, property management)

## Known Limitations

- Twilio webhook returns mock TwiML (real audio deferred)
- Google Calendar uses mock slots (real API integration deferred)
- Email/SMS notifications not yet implemented
- DeepSeek endpoints are stubs
- Admin/company dashboards are static shells, not data-backed yet
- Auth guards and multi-user role enforcement not wired into UI/API yet

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
