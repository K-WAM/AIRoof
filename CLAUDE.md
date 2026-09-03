# AI Receptionist Platform — CLAUDE.md

**Release plan is canonical (2026-07-20)**: `MASTER_PLAN.md` (task specs) · `AGENTS.md` (execution rules) · `TODO.md` (live queue + NEEDS-HUMAN) · `docs/SESSION_HANDOFF.md` (state). For release work, those override anything stale below. Source audit: `consolidated_implementation_brief.md`.

**Active Handoff**: Read `HANDOFF.md` first. It contains the current Vapi architecture, confirmed working state, pending items, and demo instructions.

## Code Navigation — Read Graphify Before Broad Work

`graphify-out/graph.json` is the project knowledge graph — **882 nodes, 1639 edges, 75 communities** (rebuilt 2026-07-15). Read it before opening many files. `graphify-out/GRAPH_REPORT.md` is the human-readable audit (god nodes, surprising connections, suggested questions).

**Ways to use it:**

1. **Ask a question** — answered from the graph, no rebuild:
   ```
   graphify query "how does field access auth work?"
   graphify explain "useBusinessModules"
   graphify path "CompanyNav" "VERTICAL_TEMPLATES"
   ```
2. **Full graph scan** — read `graphify-out/graph.json` directly to orient before a broad investigation.

**Rebuild it** by invoking the **`/graphify` skill** (not a CLI command). `/graphify .` full-rebuilds; `/graphify . --update` re-extracts only changed files.

⚠️ **The CLI has no `build`, `auto-update`, or `query <graph.json> <symbol>` command** — those were documented here for months and never existed (`graphify --help` lists the real set: query/path/explain/diagnose/install/add/merge-graphs). Any Stop hook calling `graphify auto-update .` fails silently, which is why the graph can go stale or missing. Rebuild via the skill at session start after big structural changes.

**Interpreter note:** graphify is installed as a **uv tool**, so its Python is `C:/Users/karee/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe` — a bare `python -c "import graphify"` fails. The skill writes this path to `graphify-out/.graphify_python`.

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
**Status**: see `TODO.md`'s "Current snapshot" for release/phase state and `docs/SESSION_HANDOFF.md` for the
latest session — this file doesn't duplicate that narrative. **Design-system rule:** one teal `var(--accent)` —
use `.button` variants/tokens, don't reintroduce `#2563eb` or per-page inline button styles.

## Industry-Applicability Rule (read before touching company UI)

A tenant must only ever see tools that apply to *their* industry — a dental office must never see "roofing jobs". Everything flows from **`src/lib/verticals/templates.ts`** (the single source of truth):

- **Adding a vertical = one template block.** `Record<VerticalId, …>` types make `tsc` fail until every consumer handles it. Never hardcode a per-industry list (a `Set` of field-service verticals, an agent-name map) — derive it from the template, or it silently drifts.
- **`disabledModules`**: `"jobs"` (Jobs + Field tabs) · `"pricing"` (Library's materials/labor catalog) · `"library"`. **Dashboard/Calls/Pipeline/Calendar/Settings/Guide are universal — never hide them.** A missing tab in a live demo is a lost deal; adapt the tab instead.
- **`calendarMode`**: `"jobs"` = drag jobs onto crews · `"appointments"` = drag bookings onto providers/vendors. Every industry gets a real Calendar.
- **`vocab`**: job/customer/resource nouns + placeholders + the field-voice example. Read it via `useBusinessModules()` — never hardcode "Crew"/"Job"/"shingles" in a shared page.
- **Consume via `useBusinessModules()`** (`isEnabled(module)`, `vocab`, `calendarMode`). It fails *open* (unknown industry keeps every tab) and is sessionStorage-cached. Route-gating lives in one place: `MODULE_ROUTES` in `src/app/company/layout.tsx`.
- **Agent prompt is fully config-driven** (`buildAgentPrompt`) — no industry hardcoding, no per-vertical Vapi assistant. Extra per-industry booking fields (DOB, insurance, unit no.) go in the booking tool's `notes`.
- **Demo data**: `demoSeedFor()` must seed resources + something draggable for every vertical, or the Calendar demos empty.
**Estimated Completion**: 100% of currently scoped implementation; production sign-off remains
**Tech Stack**: Next.js 15, TypeScript, Firebase Auth, Firestore (Spark/free), OpenAI, DeepSeek, Vapi (Cartesia voice), Resend, @dnd-kit, Vercel
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

Current estimate: **100% of currently scoped implementation**. Do not represent that as completed production
certification until the `NEEDS-HUMAN` smoke/provider/legal checks in `TODO.md` are closed.

Basis:
- Full infrastructure live on Vercel; Alice answers calls end-to-end with 7 Vapi tools (confirmed in dashboard: bookAppointment, checkAvailability, createLead, escalateCall, lookupAppointment, cancelAppointment, getCurrentDate).
- **Booking fixed platform-wide**: Admin Firestore uses `ignoreUndefinedProperties` — no more "undefined value" rejections.
- **Single source of truth for job data**: `job.parsed` is computed in code from the immutable `updates` ledger (`src/lib/jobs/projection.ts`). Materials dedup/sum by name. Tabs are inline-editable. **Voice corrections** are a one-tap confirm card (code computes old/new + running total — LLM never does arithmetic).
- **Job-site photos** on the free plan: base64-in-Firestore, split thumb/full docs, 10-photo cap, lightbox, include-in-report toggle (`src/lib/photos/store.ts` — swappable to Firebase Storage when on Blaze).
- **Report**: editable preview + Scope/Resolution notes + embedded photos (≤2 pages), manual "Mail report" gate.
- **Library** (`/company/library`): pricing catalog (auto-fills invoices), crews, documents.
- **Calendar Powerboard**: drag jobs onto crew×day cells (@dnd-kit) → grey/provisional → Confirm → branded crew email + color.
- **After-hours booking**: Alice books 24/7; after-hours appts flagged `pendingConfirmation`, shown grey, one-click "Confirm & notify customer".
- **Admin API auth ✓**: `verifySuperadmin()` gates all `/api/admin/*` (cookie-based; curl-verified 401 in prod).
- **Data-plane auth ✓**: `verifyFieldAccess()` gates jobs/field APIs with a staff session or a signed, scoped,
  expiring field grant. QR links exchange the demo mint key once, strip it from the URL, and continue with the
  scoped token; office mutations remain session-role-gated and agent test endpoints are superadmin-only.
- **Dynamic per-industry agent ✓**: webhook serves `{{systemPrompt}}`/`{{greeting}}` from each business's config; one assistant adapts to any vertical; caller-ID phone confirm + optional email.
- **Universal demo line ✓**: each Demo Studio launch reconfigures `demo-roofing` (the live number) to the chosen vertical — one number adapts.
- **After-hours customer-notify ✓**: email captured at booking; "Confirm & notify customer" emails the customer; dashboard surfaces pending-approval bookings.
- Mobile responsiveness: done (2026-07-04). Remaining: verified RESEND_FROM domain (NH-3 in TODO.md). SMS and Google Calendar OAuth are post-MVP; Twilio integration was superseded by Vapi (T-051 removed Twilio env declarations).

## Architecture

### Layers (Defensive)
1. **Scope Classifier** - deterministic pattern matching (OFF-TOPIC patterns, ALLOWED_SERVICE patterns) — rejects off-topic BEFORE OpenAI call
2. **Prompt Builder** — generates system prompt from BusinessConfig (approved services, FAQs, emergency rules, disallowed topics)
3. **OpenAI Client** — calls the business-configured live model with constraints; missing production configuration
   fails explicitly (clearly labeled mocks are development-only)
4. **Agent Tools** — Vapi-exposed (7): bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment, cancelAppointment, getCurrentDate; all scoped by businessId

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

Run seed script: `node scripts/seed-demo-business.mjs` (plain ESM; the obsolete TypeScript duplicate was removed).

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
| DELETE /api/calls/:callId | PII redaction (T-042) — removes transcript/recording, retains audit skeleton |
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
6. Deploy to production (Firestore rules; Twilio superseded by Vapi — T-010/T-051)

**Quick Checklist**: businessId, businessName, approvedServices[], approvedFaqs[], emergencyRules[], bookingRules[], escalationPhone, notificationEmail, calendarProvider

## Key Files

- src/types/index.ts — Type definitions (includes vapiAssistantId, vapiPhoneNumberId on BusinessConfig)
- firestore.rules — Tenant isolation rules (isSuperadmin checks businessUsers doc as fallback)
- src/middleware.ts — Next.js route protection (__session cookie check for /admin/* and /company/*)
- src/contexts/AuthContext.tsx — Sets/clears __session cookie on auth state change
- src/app/api/webhooks/vapi/route.ts — Single Vapi webhook handler (7 tools + outcome tagging + after-hours)
- src/lib/vapi/types.ts — Vapi payload types
- src/lib/vapi/verify.ts — Webhook secret verification (VAPI_AUTH_BYPASS removed by T-010; now fail-closed; timing-safe compare + Firestore-based replay guard)
- src/lib/vapi/businessLookup.ts — Maps vapiAssistantId → businessId
- src/lib/tools/agentTools.ts — Seven Vapi tools, transactional scheduling, callback state, and ledgered escalation
- src/lib/vapi/vapiClient.ts — Vapi REST client: initiateVapiCall() for outbound calls
- src/app/api/jobs/[jobId]/route.ts — GET single job + PATCH job status
- src/app/api/cron/follow-up-calls/route.ts — Daily follow-up cron (vercel.json: 2pm UTC)
- src/app/api/admin/invoices/route.ts — GET/POST Luxor invoices (LX-XXXX auto-ID)
- src/app/api/admin/invoices/[invoiceId]/route.ts — GET/PUT/DELETE single invoice
- src/app/api/admin/invoices/[invoiceId]/send/route.ts — Send branded invoice email via Resend
- src/app/api/admin/invoice-templates/route.ts — GET/POST/DELETE invoice templates
- src/app/admin/invoices/page.tsx — Luxor invoice editor (line items, templates, send, PDF)
- src/app/api/calls/outbound/route.ts — Staff-authenticated outbound call initiation (POST)
- src/app/admin/demo/page.tsx — Demo customizer UI + QR code for field demo
- src/app/api/admin/demo-customize/route.ts — Demo POST/DELETE endpoint
- vercel.json — Cron schedule for follow-up-calls
- src/app/admin/onboarding/page.tsx — Six-step onboarding wizard (includes Vapi IDs + branding)
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
- src/app/company/leads/page.tsx — Compatibility redirect to the unified Pipeline
- src/app/company/calls/page.tsx — Company call history/transcript (system prompt filtered)
- src/app/company/appointments/page.tsx — Compatibility redirect to the unified Pipeline
- src/app/company/jobs/page.tsx — Job list with status badges + create form
- src/app/company/jobs/[jobId]/page.tsx — Job detail: 6 tabs (timeline/materials/labor/issues/invoice/report)
- src/app/field/page.tsx — Field QR screen: scoped exchange token + Whisper voice recording
- src/app/company/field/page.tsx — Authenticated field screen: Whisper pipeline, job log display
- src/app/api/jobs/route.ts — GET list + POST create (atomic J-XXXX short ID via runTransaction)
- src/app/api/jobs/[jobId]/updates/route.ts — Submit field update + DeepSeek parse
- src/app/api/jobs/[jobId]/report/route.ts — Generate text report from all parsed updates
- src/app/api/jobs/[jobId]/invoice/route.ts — Generate editable draft invoice
- src/types/jobs.ts — Job, FieldUpdate (+ correction fields), ParsedUpdate, ProposedCorrection, JobPhotoMeta
- src/lib/ai/deepseekClient.ts — DeepSeek/GPT-4o: summaries, classification, parseFieldUpdate() (now also flags corrections)
- src/lib/jobs/projection.ts — buildProjection() (code-owned aggregation), resolveCorrection(), parsedToFieldLog() — **single source of truth for job data**
- src/lib/photos/store.ts — swappable photo storage (base64-Firestore now, Firebase Storage later); MAX_PHOTOS_PER_JOB, MAX_FULL_BYTES
- src/lib/photos/clientResize.ts — browser canvas compression (thumb + capped full)
- src/components/field/PhotoCapture.tsx — shared ＋Photo control (mandatory description) for both field screens
- src/app/api/jobs/[jobId]/photos/route.ts + [photoId]/route.ts — photo upload/list/blob/toggle/delete
- src/app/api/jobs/[jobId]/report/send/route.ts — branded report email (Resend), manual Mail gate
- src/app/api/jobs/[jobId]/assign/route.ts — crew assignment + branded crew email
- src/app/api/jobs/[jobId]/field-qr/route.ts — mints a one-time, 10-min field-access grant for a job (staff-role
  gated); the job detail page's "Field QR" button renders it as a scannable code via the `qrcode` package —
  the no-login counterpart to "Copy field link" (which needs a portal account)
- src/lib/notify.ts — BizBranding email templates (wraps `src/lib/comms/send.ts`, T-041 unified comms service)
- src/types/library.ts — LibraryPricing/Material/LaborRate/Document, Crew, lookupUnitPrice()
- src/app/company/library/page.tsx + src/app/api/company/library/route.ts + crews/route.ts — Library (pricing/crews/docs)
- src/app/company/calendar/page.tsx — Calendar Powerboard (@dnd-kit crew×day drag-drop scheduling)
- src/hooks/useBusinessTimezone.ts — US_TIMEZONES list + useBusinessTimezone() hook (sessionStorage cached)
- public/guides/field-operations-guide.html — Printable 4-section field ops guide (Luxor branded)
- public/guides/onboarding-guide.html — Printable demo + onboarding guide
- scripts/seed-demo-business.mjs — Demo data init (plain ESM — run with node, not ts-node)
- scripts/provision-superadmin.mjs — Set custom claim + businessUsers doc for superadmin
- docs/ADMIN-ONBOARDING.md — Complete business onboarding guide
- docs/archive/PERFORMANCE-CLEANUP.md — Phase 4 spec (done; archived)
- docs/archive/EPIC-PLAN.md — Field Ops + Calendar Powerhouse + Library epic plan (the 7-phase build that's now complete; archived)
- docs/archive/DEMO-STUDIO-PLAN.md — original multi-vertical Demo Studio design; superseded by universal-line routing (archived)

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

1. **Authenticated production smoke** — Calendar drag/confirm, real-phone field QR + voice correction, PDF print,
   and controlled-inbox email delivery (tracked as NH-8 in `TODO.md`).
2. **Provider/legal sign-off** — Vapi dashboard settings, Resend DNS, retention/recording wording, and Firestore
   TTL policies (NH-1/NH-3/NH-4/NH-11).
3. **Major dependency upgrades** — evaluate Next.js 16, Firebase 12, and Firebase Admin 14 separately; the
   2026-08-23 maintenance pass applied all non-breaking audit fixes but intentionally did not force majors.
4. **Post-MVP** — Google Calendar OAuth, Stripe billing, and SMS.

## Implementation Phases

- Phase 0: Firebase project setup ✓
- Phase 1A–1H: DeepSeek back-office, auth guards, Twilio (superseded by Vapi), company UI wired ✓
- Phase 2: Vapi migration + conversation memory + tool use ✓ (live; 7 tools confirmed in dashboard)
- Phase 3: After-hours logic, call outcome tagging, FAQ suggestions cron ✓
- Phase 4: Performance cleanup ✓ — outbound auth, public field auth, Whisper, status normalization, single-job endpoint, calendar range filter, timezone caching, dashboard aggregation
- **Field Ops + Calendar Powerhouse + Library epic ✓ (see docs/archive/EPIC-PLAN.md)** — booking fix; unified/editable/voice-correctable job data; job-site photos; editable report with mail gate; Library (pricing/crews/docs); Calendar Powerboard (drag-drop crews); after-hours booking confirmation. Vapi date injection (`assistant-request` → `{{currentDate}}`/`{{afterHoursContext}}`) wired and confirmed in the dashboard prompt.
- Post-MVP: Google Calendar OAuth, Stripe billing, SMS escalation, additional verticals (see docs/archive/DEMO-STUDIO-PLAN.md)

## Known Limitations

- **Vapi console verification**: webhook auth is fail-closed and `VAPI_AUTH_BYPASS` has no runtime behavior.
  The production health endpoint reports Vapi configured; NH-1 still tracks the human dashboard/tool-schema check.
- **After-hours**: now functional — `assistant-request` injects date/time/after-hours context (confirmed live in the dashboard prompt), and after-hours appts are flagged `pendingConfirmation` for one-click morning confirmation. Customer-email-on-confirm needs a captured customer email (only phone today).
- **Photos/files on free Spark plan**: base64-in-Firestore (no Firebase Storage). 10 photos/job, ~900KB each. Swap `src/lib/photos/store.ts` to Firebase Storage when a client justifies Blaze.
- **Google Calendar**: mock availability slots — real per-business OAuth is post-MVP.
- **SMS**: Post-MVP (deferred). Twilio integration superseded by Vapi; Twilio env declarations removed by T-051. No active SMS seam in source.
- **RESEND_FROM**: Needs a verified sending domain in Resend for the "From" name to show correctly.
- **Voice**: Cartesia Sonic 3.5 "Ariana - kind friend" (~250ms latency). For maximum raw human realism, ElevenLabs is the leader (higher latency); see HANDOFF for the tradeoff.

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
