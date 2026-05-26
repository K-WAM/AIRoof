# AI Receptionist Platform — CLAUDE.md

**Active Handoff**: Read `HANDOFF.md` first. It contains the current Vapi architecture, confirmed working state, pending items (VAPI_AUTH_BYPASS, voice upgrade, onboarding wizard), and demo instructions.

## Code Navigation — Read Graphify Before Broad Work

`graphify-out/graph.json` is the project knowledge graph (64 files, 104 symbols). Read it before opening many files.

**Two ways to use it:**

1. **Symbol lookup** — find where anything is defined without Grep:
   ```
   graphify query graphify-out/graph.json <name>
   # e.g.: graphify query graphify-out/graph.json useBusinessId
   # → src/hooks/useBusinessId.ts:6
   ```

2. **Full graph scan** — read `graphify-out/graph.json` directly to orient before a broad investigation.

**Keep it fresh:**
- `graphify build .` — full re-index (run after adding many new files)
- `graphify auto-update .` — incremental update from git diff (runs automatically via Stop hook after each response)

The Stop hook keeps it current during active work. Run `graphify build .` manually at session start if the project has had major structural changes since the last session.

## Onboarding & Demo Guide
The file `public/guides/onboarding-guide.html` is the single source of truth for the demo playbook and client onboarding walkthrough. It is served live at `/guides/onboarding-guide.html` and embedded in the superadmin portal at `/admin/guide`. Open it in a browser and print → Save as PDF to generate the PDF version.

**Update the guide when any of these change:**
- Demo phone number, portal URL, or superadmin login
- Onboarding form steps (e.g. new required fields added)
- Vapi assistant setup steps (new tools, changed voice/model config)
- Phone number provisioning process
- Client login provisioning steps (e.g. if businessUsers creation is automated)
- Key stats or ROI numbers used in the pitch

**Project**: AI Receptionist Platform for local service businesses
**Status**: Phase 2 complete + field operations layer shipped — job tracking, voice updates, AI parsing, draft invoices, field ops guide
**Estimated Completion**: 80%
**Tech Stack**: Next.js 15, TypeScript, Firebase Auth, Firestore, OpenAI, DeepSeek, Vapi, ElevenLabs, Resend, Vercel
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

Current estimate: **70% complete**.

Basis:
- Full infrastructure live on Vercel: Firestore, OpenAI, DeepSeek, Vapi, Resend all configured.
- Migrated from custom Twilio pipeline to Vapi (managed voice AI) — old Twilio routes deleted.
- Alice (Vapi assistant) answers calls end-to-end: multi-turn conversation memory, tool use confirmed.
- 5 tools wired in code: bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment. lookupAppointment needs Vapi UI step.
- Branded HTML emails: client logo/color in notifications + confirmation emails; "Powered by Luxor AI" hidden footer.
- All 5 company dashboard pages wired to live Firestore data.
- Auth guards on /company and /admin: Next.js middleware (__session cookie) + layout redirects + Firestore rules.
- Superadmin provisioned: connect@luxordev.com → /admin access.
- Demo customizer built: /admin/demo page + CLI script for prospect demos.
- Admin onboarding form (5 steps): creates business doc, accepts vapiAssistantId, branding fields.
- Business config edit page: loads live Firestore data, editable vapiAssistantId + all agent settings.
- Critical gaps remaining: VAPI_AUTH_BYPASS active, lookupAppointment not yet added to Vapi UI, no real Google Calendar.

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
**Agent**: Alice (Vapi assistant ID: `9267a84a-0f4f-416b-a328-1dc539f5265e`)
**Phone**: +1 (754) 283-7658 (Vapi number)
**Services**: Inspections, shingle replacement, metal roofing, emergency repairs
**Service Area**: Miami, Coral Gables, Doral, Hialeah, Kendall, Homestead

Run seed script: `node scripts/seed-demo-business.mjs` (plain ESM — no ts-node needed)
Do NOT use `npx ts-node scripts/seed-demo-business.ts` — it fails due to `moduleResolution: bundler` in tsconfig (see Lesson 65).

## Core Routes (Implemented)

| Route | Purpose |
|-------|---------|
| POST /api/webhooks/vapi | Single Vapi webhook — handles function-call, status-update, end-of-call-report |
| POST /api/agent/respond | Non-Vapi agent endpoint (testing / back-office) |
| POST /api/agent/classify | Test scope classifier |
| GET /api/health | Health check |
| GET /api/businesses/:businessId/agent-config | Retrieve business config |
| POST /api/admin/demo-customize | Customize demo (prospect name/email) |
| DELETE /api/admin/demo-customize | Reset demo to Apex Roofing defaults |
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

- src/types/index.ts — Type definitions (includes vapiAssistantId, vapiPhoneNumberId on BusinessConfig)
- firestore.rules — Tenant isolation rules (isSuperadmin checks businessUsers doc as fallback)
- src/middleware.ts — Next.js route protection (__session cookie check for /admin/* and /company/*)
- src/contexts/AuthContext.tsx — Sets/clears __session cookie on auth state change
- src/app/api/webhooks/vapi/route.ts — Single Vapi webhook handler (5 tools)
- src/lib/vapi/types.ts — Vapi payload types
- src/lib/vapi/verify.ts — Webhook secret verification (VAPI_AUTH_BYPASS active)
- src/lib/vapi/businessLookup.ts — Maps vapiAssistantId → businessId
- src/lib/tools/agentTools.ts — All tools + BizBranding email templates (lookupAppointment added)
- src/app/admin/demo/page.tsx — Demo customizer UI
- src/app/api/admin/demo-customize/route.ts — Demo POST/DELETE endpoint
- scripts/demo-customize.mjs — CLI demo customizer
- src/app/admin/onboarding/page.tsx — Onboarding wizard (5 steps, includes vapiAssistantId + branding)
- src/hooks/useBusinessId.ts — Returns ?preview=businessId for superadmin, user.businessId otherwise
- src/app/admin/admin-nav.tsx — Sidebar nav with section groups (Platform / Tools)
- src/app/admin/usage/page.tsx — Platform-wide usage monitoring (calls/leads/appts per tenant)
- src/app/api/admin/usage/route.ts — Firestore count aggregation per business
- src/app/admin/guide/page.tsx — Playbooks — 3 tabs: Demo Playbook / Client Onboarding / Field Operations
- src/app/admin/businesses/page.tsx — Live business list + Edit + Preview ↗ buttons
- src/app/admin/businesses/[businessId]/config/page.tsx — Live config edit (Vapi IDs, branding, rules, timezone)
- src/app/api/admin/businesses/route.ts — GET list + POST create business
- src/app/api/admin/businesses/[businessId]/config/route.ts — GET + PUT config per business
- src/app/api/appointments/send-confirmation/route.ts — Branded confirmation email via Resend
- src/app/company/dashboard/page.tsx — Company operations dashboard (uses useBusinessId hook)
- src/app/company/leads/page.tsx — Company lead queue
- src/app/company/calls/page.tsx — Company call history/transcript (system prompt filtered)
- src/app/company/appointments/page.tsx — Company inspection schedule + Send Confirmation + Create Job
- src/app/company/jobs/page.tsx — Job list with status badges + create form
- src/app/company/jobs/[jobId]/page.tsx — Job detail: 6 tabs (timeline/materials/labor/issues/invoice/report)
- src/app/company/field/page.tsx — Mobile field screen: auto language detect, voice via Web Speech API
- src/app/api/jobs/route.ts — GET list + POST create (atomic J-XXXX short ID via runTransaction)
- src/app/api/jobs/[jobId]/updates/route.ts — Submit field update + DeepSeek parse
- src/app/api/jobs/[jobId]/report/route.ts — Generate text report from all parsed updates
- src/app/api/jobs/[jobId]/invoice/route.ts — Generate editable draft invoice
- src/types/jobs.ts — Job, FieldUpdate, ParsedUpdate, InvoiceLineItem types
- src/lib/ai/deepseekClient.ts — DeepSeek: summaries, classification, FAQ suggestions, parseFieldUpdate()
- src/hooks/useBusinessTimezone.ts — US_TIMEZONES list + useBusinessTimezone() hook
- public/guides/field-operations-guide.html — Printable 4-section field ops guide (Luxor branded)
- public/guides/onboarding-guide.html — Printable demo + onboarding guide
- scripts/seed-demo-business.mjs — Demo data init (plain ESM — run with node, not ts-node)
- scripts/provision-superadmin.mjs — Set custom claim + businessUsers doc for superadmin
- docs/ADMIN-ONBOARDING.md — Complete business onboarding guide
- TODO.md — Implementation roadmap

## Navigation Completeness Rule

Every `page.tsx` must have a reachable UI path before being committed:
- Admin pages: in `admin-nav.tsx` links OR linked via a visible button/CTA from another admin page
- Company pages: in `company-nav.tsx` links
- Dead pages (removed from nav) must redirect, not sit unreachable

Check nav before closing any session. `/end-session` command includes a nav audit step.

## Agent Verification Protocol

Before asking the user to verify anything, use CLI/curl first:
- **Is Firestore connected?** `curl https://ai-roof.vercel.app/api/health`
- **Did the deploy succeed?** `vercel logs --environment production --no-follow` or `git log --oneline -3`
- **Is a package installed?** `npm list <package>`
- **Did Firestore rules deploy?** `firebase deploy --only firestore:rules --project business-expense-trackin-ef659 --dry-run`
- **Is a file/path correct?** Use Glob, Grep, or Read — not user confirmation
- Only fall back to asking the user when the CLI genuinely cannot answer (Vapi dashboard settings, Vercel env var entry via web UI).

## Next Steps

1. **CURRENT**: Fix VAPI_WEBHOOK_SECRET — delete Vercel secret, generate new one, set in both Vercel + Vapi UI (assistant Advanced + each tool server header); remove VAPI_AUTH_BYPASS
2. Add `lookupAppointment` as 5th tool in Vapi dashboard (see HANDOFF.md for exact walkthrough)
3. Wire `businessUsers/{uid}` provisioning in POST `/api/admin/businesses` — so onboarded clients can log in automatically
4. Add "Complete" button to job detail page so staff can mark jobs done (removes from field crew's dropdown)
5. Phase 3: after-hours logic, call outcome tagging via DeepSeek, FAQ suggestions cron

## Implementation Phases

- Phase 0: Firebase project setup ✓
- Phase 1A: DeepSeek back-office wired ✓
- Phase 1B: Auth guards + login page ✓
- Phase 1C–1H: Twilio pipeline built + fixed ✓ (superseded by Vapi migration)
- Phase 1F: Company UI pages wired to live Firestore ✓
- Phase 2: Vapi migration + conversation memory + tool use during calls ✓ (confirmed live end-to-end)
- Phase 3: After-hours logic, call outcome tagging, FAQ suggestions cron ← CURRENT
- Phase 4: Admin UI polish — business list, superadmin onboarding wizard (auto Vapi + Firestore)
- Phase 5: Google Calendar (post-MVP, requires per-business OAuth)
- Phase 6: Stripe billing, SMS escalation, additional verticals

## Known Limitations

- **VAPI_AUTH_BYPASS active**: Webhook signature not verified — bypassed with env var. Fix: re-generate secret and set in both Vercel and Vapi UI
- **No superadmin onboarding wizard**: New businesses must be onboarded manually (create Vapi assistant + phone in dashboard, write Firestore docs via seed script)
- **Google Calendar**: Uses mock availability slots — real per-business OAuth is post-MVP
- **SMS escalation**: Requires Twilio A2P 10DLC registration (~2-4 weeks) — email covers MVP
- **RESEND_FROM**: Needs a verified sending domain in Resend before "From" name shows correctly in emails

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
