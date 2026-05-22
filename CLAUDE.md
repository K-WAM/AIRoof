# AI Receptionist Platform — CLAUDE.md

**Active Handoff**: Read `HANDOFF.md` first. It contains the latest Roofus/Twilio call failure evidence, patches already made, verification commands, and the next production deployment/test step.

**Project**: AI Receptionist Platform for local service businesses
**Status**: Phase 2 in progress — all Twilio blockers fixed, login/auth complete, awaiting first successful live call
**Estimated Completion**: 65%
**Tech Stack**: Next.js 15, TypeScript, Firebase Auth, Firestore, OpenAI, DeepSeek, Twilio, Resend, Vercel
**Repository**: https://github.com/K-WAM/AIRoof
**Vercel Project ID**: prj_Z7wLkNHfQUm8JsnDAWrfuOHPOmy2
**Vercel URL**: https://ai-roof.vercel.app
**Firebase Project**: business-expense-trackin-ef659 (web app: "airoof")
**Firebase Auth Domain**: business-expense-trackin-ef659.firebaseapp.com
**Superadmin**: connect@luxordev.com

## Overview

Multi-tenant phone AI agent answering inbound calls, qualifying leads, booking appointments, escalating urgent cases. Strict AI constraint strategy: deterministic scope classifier (patterns, before model), prompt builder (business rules), OpenAI API (live response), tool interface (scoped actions). First vertical: roofing. Designed for safe cost and easy expansion to new verticals.

## Progress Reporting

When handing off or answering "what's next", include an estimated completion percentage for the overall platform and a one-step next action. Keep the percentage pragmatic, not overly precise.

Current estimate: **65% complete**.

Basis:
- Full infrastructure live on Vercel: Firestore, OpenAI, DeepSeek, Twilio, Resend all configured.
- All known Twilio call blockers fixed (absolute URLs, phone mapping, sig validation).
- Firestore phone mapping seeded: businessPhoneNumbers/demo-roofing-main active: true.
- Login page: Google + email/password sign-in live.
- Superadmin provisioned: connect@luxordev.com → /admin access.
- Root URL redirects to /login (404 fixed).
- All 5 company dashboard pages wired to live Firestore data.
- Auth guards on /company and /admin; login page live.
- Resend escalation + booking confirmation emails wired.
- Critical gaps remaining: conversation memory (Roofus forgets prior turns mid-call), tool use during calls (can't book or capture lead mid-call), Twilio webhook URL must be confirmed in Twilio console.

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

## Critical Architecture Gap — Conversation Memory

Roofus currently handles one turn at a time with no memory of prior turns. Each Twilio webhook call only sees the current speech input. This means Roofus cannot collect name + address + service across a natural multi-turn conversation.

**Fix**: In `transcribe/route.ts`, before calling OpenAI, load `call.messages[]` from Firestore and pass the full conversation history as OpenAI messages array (alternating user/assistant roles). This gives Roofus context for the entire call.

**Second gap**: Roofus never calls bookAppointment() or createLead() during a call. After conversation memory is fixed, add intent detection — if Roofus has collected name + phone + service + address, call the appropriate tool and confirm back to the caller.

## Next Steps

1. **CURRENT**: Add conversation memory to Twilio transcribe webhook — load prior turns from Firestore, pass to OpenAI as message history
2. Add tool invocation during calls — detect when enough info is collected, call bookAppointment() or createLead(), confirm to caller
3. Configure Twilio Voice webhook URL in Twilio console → `https://<vercel-domain>/api/webhooks/twilio/incoming` POST
4. Add RESEND_FROM env var to Vercel: `Roofus <notify@yourdomain.com>`

## Implementation Phases

- Phase 0: Firebase project setup ✓
- Phase 1A: DeepSeek back-office wired ✓
- Phase 1B: Auth guards + login page ✓
- Phase 1C: Twilio webhooks fixed (phone lookup, sig verification, no collection scan) ✓
- Phase 1D: Phone number activation (businessPhoneNumbers collection) ✓
- Phase 1E: Resend email notifications (escalation + booking) ✓
- Phase 1F: Company UI pages wired to live Firestore ✓
- Phase 1G: Auth complete — email/password + Google, superadmin provisioned, root redirect ✓
- Phase 1H: Twilio call blockers fixed — absolute URLs, phone mapping, sig validation ✓
- Phase 2: Conversation memory + tool use during calls ← CURRENT (pending first successful live call)
- Phase 3: After-hours logic, call outcome tagging, FAQ suggestions cron
- Phase 4: Admin UI polish (business list, onboarding wizard test)
- Phase 5: Google Calendar (post-MVP, requires per-business OAuth)
- Phase 6: Stripe billing, SMS escalation, additional verticals

## Known Limitations

- **No conversation memory**: Roofus sees only the current turn, not prior turns in the call
- **No tool use during calls**: Roofus never calls bookAppointment() or createLead() mid-call
- **Twilio Voice webhook URL**: must be configured in Twilio console manually (2 min)
- Google Calendar uses mock availability slots — real OAuth is post-MVP
- SMS escalation requires A2P 10DLC registration (2–4 weeks) — email covers MVP
- Multi-turn lead collection only works after Phase 2 is built

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
