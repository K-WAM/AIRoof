# Documentation Index

## For Admins (Onboarding New Businesses)

**START HERE:** [ADMIN-QUICK-START.md](ADMIN-QUICK-START.md) — 5-step checklist to add a business
- Quick reference with JSON templates
- Test cases to verify configuration
- Checklist for deployment

**FULL GUIDE:** [ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md) — Complete workflow with details
- How to collect business information
- How to configure BusinessConfig (services, FAQs, rules)
- Phone number mapping setup
- Industry-specific templates (roofing, dental, HVAC, landscaping)
- Troubleshooting guide
- Analytics & reporting (Phase 10+)

## For Developers (Building & Testing)

**ARCHITECTURE:** [../CLAUDE.md](../CLAUDE.md) — Project overview
- Defensive AI constraint strategy (scope classifier → prompt builder → OpenAI → tools)
- Data model (Firestore structure)
- API routes and their purposes
- Environment variables required

**TESTING:** [../TESTING.md](../TESTING.md) — Comprehensive test cases
- Scope classifier tests (critical: off-topic rejection before OpenAI)
- Full pipeline tests (agent response, tool execution)
- Multi-tenant isolation tests
- Performance targets
- Regression tests

**IMPLEMENTATION ROADMAP:** [../TODO.md](../TODO.md) — 13 phases
- Phase 0: Core infrastructure (✓ complete)
- Phase 1: Core API routes (✓ complete)
- Phase 2: Demo data & testing (in progress)
- Phase 3-13: Admin dashboard, security, integrations, new verticals

**SEED DATA:** [../scripts/seed-demo-business.ts](../scripts/seed-demo-business.ts)
- Creates demo-roofing business (Apex Roofing)
- Run: `npx ts-node scripts/seed-demo-business.ts`
- Requires: Firebase service account in project root or FIREBASE_SERVICE_ACCOUNT_PATH env var

## Key Concepts

### BusinessConfig (The Core Constraint Document)

Every business has a `BusinessConfig` in Firestore at `businesses/{businessId}`. This single document controls everything the AI can do:

```json
{
  "businessId": "apex-roofing",
  "businessName": "Apex Roofing",
  "approvedServices": ["roof inspections", "shingle replacement", ...],
  "approvedFaqs": [{"question": "...", "answer": "..."}, ...],
  "emergencyRules": ["If caller mentions water leak: escalate immediately", ...],
  "bookingRules": ["Only book during business hours", ...],
  "disallowedTopics": ["pricing details", "insurance claims", ...],
  "escalationPhone": "+1 (604) 555-0000",
  ...
}
```

This config is used by:
1. **Scope Classifier** — checks `disallowedTopics` against message
2. **Prompt Builder** — constructs system prompt with all approved services, FAQs, rules
3. **Tool Validation** — checks booking/emergency rules before executing actions

### Defensive AI Strategy

The platform uses **layered defense** to control costs and prevent hallucination:

```
User Message
    ↓
[LAYER 1: Scope Classifier]
  - Pattern matching (OFF_TOPIC_PATTERNS)
  - Disallowed topics check
  - REJECT before OpenAI if off-topic ← Cost control
    ↓
[LAYER 2: Prompt Builder]
  - Generate system prompt from BusinessConfig
  - Approved services, FAQs, rules embedded in prompt
  - No hallucination clause
    ↓
[LAYER 3: OpenAI API Call]
  - Only called if message is in-scope
  - Constrained by system prompt
  - Fallback safe response if API fails
    ↓
[LAYER 4: Tool Execution]
  - Agent requests tool (checkAvailability, bookAppointment, etc.)
  - All tools scoped by businessId
  - All tools validate business rules before executing
    ↓
Agent Response + Logging to Firestore
```

### Multi-Tenant Isolation

All data is scoped by `businessId`:
- Firestore queries: `collection("businesses").doc(businessId).collection("calls")`
- Security rules: deny cross-business reads
- API validation: reject if businessId not found
- No hardcoded IDs or secrets

---

## How to Onboard a Business (Quick Summary)

1. **Collect info**: businessId, businessName, services, hours, FAQs, escalation phone
2. **Create in Firestore**: Document at `businesses/{businessId}` with BusinessConfig
3. **Configure constraints**: Populate approvedServices[], approvedFaqs[], emergencyRules[], bookingRules[], disallowedTopics[]
4. **Test responses**: 
   - On-topic → agent responds ✅
   - Off-topic → rejected, no OpenAI call ✅
   - FAQ → exact answer from config ✅
   - Emergency → escalates immediately ✅
5. **Deploy**: Security rules, Twilio mapping, Google Calendar (optional)

See [ADMIN-QUICK-START.md](ADMIN-QUICK-START.md) for detailed commands.

---

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Backend**: Next.js API Routes, TypeScript
- **Database**: Firestore (document store)
- **Auth**: Firebase Authentication (Google Sign-In)
- **AI**: OpenAI (gpt-4o-mini), DeepSeek (back-office)
- **Voice**: Twilio (webhooks, audio)
- **Calendar**: Google Calendar API (or mock)
- **Deployment**: Vercel

---

## Environment Variables

See `../.env.example` for full list. Minimum required:

```
OPENAI_API_KEY=...
FIREBASE_SERVICE_ACCOUNT_JSON={...}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

---

## Running Locally

```bash
# Install
npm install

# Seed demo data
npx ts-node scripts/seed-demo-business.ts

# Start dev server
npm run dev

# Test API
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-roofing", "callId": "test_001", "callerMessage": "I need to schedule an appointment"}'
```

---

## Next: Phase 2 (Testing & Demo)

Priority tasks:
1. [ ] Seed demo-roofing with `npx ts-node scripts/seed-demo-business.ts`
2. [ ] Run all test cases from [../TESTING.md](../TESTING.md)
3. [ ] Verify off-topic rejection works (critical for cost control)
4. [ ] Verify Firestore documents are created and logged
5. [ ] Move to Phase 3: Firestore security rules deployment

---

## Support & Questions

- **For admin/onboarding questions**: See [ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md)
- **For testing & verification**: See [../TESTING.md](../TESTING.md)
- **For architecture**: See [../CLAUDE.md](../CLAUDE.md)
- **For implementation roadmap**: See [../TODO.md](../TODO.md)
- **Superadmin contact**: connect@luxordev.com
