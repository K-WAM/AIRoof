# AI Receptionist Platform — CLAUDE.md

**Release plan is canonical (2026-07-20)**: `MASTER_PLAN.md` (task specs) · `AGENTS.md` (execution rules) · `TODO.md` (live queue + NEEDS-HUMAN) · `docs/SESSION_HANDOFF.md` (state). For release work, those override anything stale below. Source audit: `consolidated_implementation_brief.md`.

**Phase 12 (2026-09-16) — all 7 sub-phases shipped and pushed to `origin/main`.** A separate owner-added initiative (Customers, time clock, Spanish, invoice persistence, trade roles, a general speed pass) with its own canonical spec: `docs/PLATFORM-EXPANSION-PLAN.md`. Tracked as T-088+ in `TODO.md`. Foundation/speed/the field-URL fix; Customers; Time clock (T-090); Photos (T-091); Invoice persistence + hide-materials everywhere it's promised + a letterhead redesign + the logo library (T-092, Phase 4 — only the two-pane live-preview redesign is deliberately not built); Spanish (T-093 — field-update auto-detect+translate and the phone AI's language toggle are real; voice selection is a documented **NEEDS-HUMAN** follow-up, see `TODO.md`); Trade roles (T-094). See the plan doc's per-phase "Shipped" notes for exact deviations/deferrals — every phase has honest ones, nothing is oversold as 100% complete.

**Phases 13–20 (2026-09-23/24) — the current work.** Phase 13 CRM domain move (`crm.luxordev.com`, `NEXT_PUBLIC_APP_URL`); 14 Care Homes + Daycares verticals (13 industries now); 15 industry peripherals (per-vertical intake fields, starter kits, dashboard tiles); 16 call-recording notice (T-102, default ON) + per-tenant voice override (T-103) + `/api/admin/sync-personas`; 17 work catalog + job findings + quotes (T-105; T-106 bilingual line open); 18 document-suite unification (T-107), email intake (T-109), voice bake-off (T-110); 19 ElevenLabs switch-over scaffolding (T-111: `voiceProvider` per tenant, default `vapi`); 20 request-review workflow (T-113) + feedback/UX pass (T-114). **Owner decisions:** jobs are NEVER auto-created (the AI captures a request, the admin reviews and decides; T-108 cancelled); feedback is for client users only (hidden for superadmin). **Who builds what next:** `docs/WORKER_QUEUE.md` (two parallel Codex sessions; Deepseek is out of credits). **Owner's to-do list:** `docs/NEEDS-HUMAN-CHECKLIST.md`. **Voice research + bake-off plan:** `docs/VOICE-RESEARCH-2026-09-24.md`. **Tomorrow's plan:** `docs/NEXT_SESSION.md`.

**Phases 21–23 (2026-09-24/25):** demo experience (T-115/T-116/T-121), Vapi→ElevenLabs migration (T-117; ElevenLabs test tenant `carlita-elevenlabs-test` live end-to-end), and launch readiness (Phase 23: email deliverability fix, call-visibility/superadmin fixes, document suite T-107a/b with **price-free reports**, request review T-113). **Only the first link of the customer story has been proven live — run the T-124 smoke test and the owner's NH-26 run-through before selling.** Start every session at `docs/NEXT_SESSION.md`.

**Phase 24 (2026-09-25) — the 20-minute roofing demo, ElevenLabs only (Vapi retired from demos).** T-124 smoke test is done (offline, all pass). Spec + status: `docs/DEMO-READINESS-PLAN.md` (STATUS block at the top lists what shipped, what deviated and what is unproven); TODO.md Phase 24. All three tasks (D1 phone line + Demo Studio, D2 job loop, D3 roofing content) are built and deployed; the demo line is +1 (689) 204-2643 on tenant `demo-roofing`. **Not yet proven on a real phone** — owner verification (Twilio Upgrade, scripted calls, dry runs) is the next step.

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
The file `public/guides/onboarding-guide.html` is the single source of truth for the demo playbook and client onboarding walkthrough. It is served live at `/guides/onboarding-guide.html` and embedded in the superadmin portal at `/hub/guide` (moved from `/admin/guide`, T-055 — old links redirect). Open it in a browser and print → Save as PDF to generate the PDF version.

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

## Customer Entity & Search (read before touching Customers or any Firestore-list API)

`businesses/{businessId}/customers/{customerId}` (`src/types/customer.ts`) is relational truth for who a job is
for; `Job.clientName`/`clientPhone`/`clientEmail`/`address` stay as flat fields — a **point-in-time snapshot**,
never rewritten except by an explicit `PATCH /customers/[id]?propagate=true`, and even then only onto that
customer's still-*open* jobs (an invoiced/complete job's snapshot is frozen so a rename can never mutate
something already sent to a customer).

- **The instant-search requirement ("type walmart, jobs show up, fast") is solved client-side, not by a
  Firestore query.** `GET /api/company/customers` returns a slim list (up to 1000 rows) fetched once per
  session; `src/lib/customers/search.ts`'s `matchesQuery()` filters it in memory on every keystroke — zero
  network round trip. The Firestore `searchTokens array-contains` query (`buildSearchTokens`/`tokenForQuery`,
  same file) is the fallback past that row cap, honest to ~50k customers/tenant; past that the answer is a real
  search service, not a patch to this.
- **`matchKey` (normalized name + phone-last-7) is the one definition of "same customer."** `resolveCustomer()`
  (`src/lib/customers/resolve.ts`) is the only place that decides find-vs-create — the manual-create route, the
  job-create combobox's background resolve call, and `scripts/backfill-customers.mjs` all call it (or its
  plain-JS duplicate, in the script's case — no path aliases there) so none of the three can disagree about
  what counts as a duplicate.
- **Diacritic-folding is load-bearing, not cosmetic** — `src/lib/format/name.ts`'s `normalizeName()` NFD-folds
  before lowercasing, so "José" and "jose" search/match identically. Any new name-comparison logic must reuse
  it, not roll its own.

## Cache-Control Rule (read before adding any GET route)

Every API route in this app is single-tenant, cookie-authenticated. **Never set `public` or `s-maxage` on a
response** — a shared/CDN cache would risk serving one tenant's response to another tenant's request, a
cross-tenant data leak, not a bug to tune later. Use `src/lib/http/cache.ts`'s `jsonWithCache(data, policy)` —
every named tier (`semiStatic`, `volatile`, `immutable`, `noStore`) is already `private`.

**Estimated Completion**: 100% of currently scoped implementation; production sign-off remains
**Tech Stack**: Next.js 15, TypeScript, Firebase Auth, Firestore (Spark/free), OpenAI (incl. GPT Realtime for the live voice), DeepSeek, Vapi, Resend, @dnd-kit, Vercel
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
- **Customer entity + instant search ✓ (Phase 12, T-089)**: `businesses/{bid}/customers`, a Library "Customers" tab, a job-create combobox, and client-side zero-network search — see the Customer Entity & Search rule above.
- **No client Firestore SDK left ✓ (Phase 12, T-088)**: the last four client-side Firestore reads/writes (AuthContext's profile doc, `useBusinessModules`/`useBusinessTimezone`, Pipeline's status writes) are gone, replaced by `/api/auth/profile` + `/api/company/bootstrap` + two new PATCH routes — confirmed by inspecting the built client chunks directly, not assumed. The field screen's address bar is now a bare `/field` (was showing a ~300-char token).
- Mobile responsiveness: done (2026-07-04). Resend domain verified and `RESEND_FROM` set to `Luxor CRM <crm@luxordev.com>` (2026-09-25); only the header pass-check remains (NH-3). SMS and Google Calendar OAuth are post-MVP; Twilio integration was superseded by Vapi (T-051 removed Twilio env declarations).

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
- src/lib/vapi/vapiClient.ts — Vapi REST client: initiateVapiCall() for outbound calls; updateAssistantPersona() pushes prompt/greeting/transcriber-language live (the actual mechanism that makes a persona change "take" — assistant-request never fires for a number with a fixed assistantId), always reads back and re-sends startSpeakingPlan/stopSpeakingPlan verbatim (see the 2026-09-07 gpt-realtime incident below)
- src/lib/vapi/voices.ts — per-language voice map, deliberately inert (NEEDS-HUMAN: no confirmed Spanish voiceId exists yet — see TODO.md)
- src/app/api/jobs/[jobId]/route.ts — GET single job + PATCH job status
- src/app/api/cron/follow-up-calls/route.ts — Daily follow-up cron (vercel.json: 2pm UTC)
- src/app/api/admin/invoices/route.ts — GET/POST Luxor invoices (LX-XXXX auto-ID)
- src/app/api/admin/invoices/[invoiceId]/route.ts — GET/PUT/DELETE single invoice
- src/app/api/admin/invoices/[invoiceId]/send/route.ts — Send branded invoice email via Resend
- src/app/api/admin/invoice-templates/route.ts — GET/POST/DELETE invoice templates
- src/app/admin/invoices/page.tsx — Luxor invoice editor (line items, templates, send, PDF)
- src/app/api/calls/outbound/route.ts — Staff-authenticated outbound call initiation (POST)
- src/app/hub/demo/page.tsx — Demo customizer UI + QR code for field demo (moved from /admin/demo, T-055)
- src/app/api/admin/demo-customize/route.ts — Demo POST/DELETE endpoint
- vercel.json — Cron schedule for follow-up-calls
- src/app/hub/onboarding/page.tsx — Six-step onboarding wizard, incl. Vapi IDs + branding (moved from /admin/onboarding, T-055)
- src/hooks/useBusinessId.ts — Returns ?preview=businessId for superadmin, user.businessId otherwise
- src/app/admin/admin-nav.tsx — Sidebar nav: Clients/Usage/Invoices + a link to the Hub
- src/app/hub/hub-nav.tsx — Hub's own sidebar nav: Demo Studio/Onboarding/Playbooks (T-055)
- src/app/hub/layout.tsx — Hub shell, same superadmin gate as /admin (T-055)
- src/app/admin/usage/page.tsx — Platform-wide usage monitoring (calls/leads/appts per tenant)
- src/app/api/admin/usage/route.ts — Firestore count aggregation per business
- src/app/hub/guide/page.tsx — Playbooks — 3 tabs: Demo Playbook / Client Onboarding / Field Operations (moved from /admin/guide, T-055)
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
- src/app/company/jobs/[jobId]/page.tsx — Job detail: 9 tabs (timeline/materials/labor/issues/photos/findings/invoice/quote/report)
- src/app/field/page.tsx — Field QR screen: scoped exchange token + Whisper voice recording
- src/app/company/field/page.tsx — Authenticated field screen: Whisper pipeline, job log display
- src/app/api/jobs/route.ts — GET list + POST create (atomic J-XXXX short ID via runTransaction)
- src/app/api/jobs/[jobId]/updates/route.ts — Submit field update + DeepSeek parse
- src/app/api/jobs/[jobId]/report/route.ts — Generate text report from all parsed updates
- src/app/api/jobs/[jobId]/invoice/route.ts — GET/POST/PATCH for the persisted invoice (see the fuller entry further down this list — this line was stale since T-092, still describing the pre-persistence dead-code version)
- src/types/jobs.ts — Job, FieldUpdate (+ correction fields), ParsedUpdate, ProposedCorrection, JobPhotoMeta
- src/lib/ai/deepseekClient.ts — DeepSeek/GPT-4o: summaries, classification, parseFieldUpdate() (flags corrections; Phase 12/Phase 6 — one LANGUAGE instruction block canonicalizes structured data to English and returns transcriptEn, one call not two)
- src/lib/ai/whisperPrompt.ts — the field-audio Whisper biasing prompt, industry/tenant-driven (vertical voiceExample + top-30 Library material names), capped at Whisper's 224-token limit
- src/lib/i18n/detect.ts — normalizeLang() (Whisper's full language name → ISO code) + detectLanguage() (cheap Spanish heuristic for the typed-text path, no Whisper/no extra LLM call)
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
- docs/PLATFORM-EXPANSION-PLAN.md — Phase 12 canonical spec (Customers ✓, Photos, Invoice persistence, Time clock, Spanish, Trade roles, speed) — per-phase shipped/not-shipped status table at the top
- src/types/bootstrap.ts + src/app/api/company/bootstrap/route.ts + src/contexts/BootstrapContext.tsx — one-call company-shell bootstrap (industry/vocab-derivable/timezone/branding); useBusinessModules/useBusinessTimezone are now thin selectors over this
- src/app/api/auth/profile/route.ts — server-verified replacement for AuthContext's old client-Firestore profile read (admin/hub layouts, FeedbackForm, QuickAddContext, company/settings all consume it via useAuth())
- src/lib/auth/memberCache.ts — 30s point-read memo backing verifyAuthAndRole (bypassed whenever an "owner" check is in play)
- src/lib/format/ — shared fmtDay/fmtTime/dayKey/normalizeName (memoized Intl.DateTimeFormat); src/hooks/useFormat.ts binds tz from bootstrap
- src/lib/data/store.ts + src/hooks/useQuery.ts — hand-rolled cache/tag-invalidation layer (chosen over SWR — generalizes the existing quickAdd event bus); wired additively into useQuickAddRefresh, not yet adopted by any page
- src/lib/http/cache.ts — the Cache-Control tiers (see the rule above) — jsonWithCache(data, policy)
- src/app/f/[grant]/route.ts + src/app/api/field/session/route.ts — the short opaque field-QR alias + session-cookie-based businessId/jobId lookup (replaces the old ?businessId=&jobId= URL params)
- src/types/customer.ts + src/lib/customers/search.ts + src/lib/customers/resolve.ts — Customer type, buildSearchTokens/matchesQuery/tokenForQuery, resolveCustomer/bumpCustomerJobStats (see the Customer Entity & Search rule above)
- src/app/api/company/customers/route.ts + [customerId]/route.ts + resolve/route.ts — Customer list/create, get+propagate-patch, and the job-create form's non-blocking find-or-create
- src/app/company/library/CustomersSection.tsx + src/components/customers/CustomerCombobox.tsx — the Library Customers tab and the job-create form's free-text-and-search combobox
- scripts/backfill-customers.mjs — one-time, --dry-run-capable, idempotent backfill grouping pre-Phase-12 jobs into customers by matchKey
- src/test-utils/fakeFirestore.ts — small in-memory Firestore fake (nested collections, where/orderBy/limit, transactions, batch) shared across the customers route tests
- src/types/timeclock.ts + src/lib/timeclock/machine.ts + src/lib/timeclock/fold.ts — the time-clock (Phase 12, Phase 5) state machine and pure ledger fold; `foldPunches`/`punchedLaborForJob` are the only source of a job's punched labor
- src/lib/jobs/writeProjection.ts — `writeJobProjection()`, the single recompute-and-persist-a-job's-projection implementation (was duplicated in updates/route.ts and field-audio/route.ts; also folds in punched labor)
- src/lib/jobs/search.ts — `matchesJobSearch()`, the Jobs list's client-side live-filter (job id/title/client/address/service type + digits-only phone), same forgiving/punctuation-insensitive shape as `src/lib/customers/search.ts`'s `matchesQuery()`
- src/app/api/timeclock/punch/route.ts — the cross-job punch guard (GET today's state, POST a punch; the atomic "Switch job" flow lives here)
- src/app/api/cron/close-punches/route.ts — nightly auto-close of any punch left open from a prior day (vercel.json: 9am UTC)
- src/components/field/TimeClock.tsx — the punch-buttons widget shared by both field screens (`/field` and `/company/field`)
- src/app/api/jobs/[jobId]/photos/blobs/route.ts — batched full-res photo fetch (≤12 ids/request, `immutable` cache tier) — kills the report/lightbox N+1
- src/components/ui/Sheet.tsx — generic bottom-sheet shell (Modal.tsx's mobile-appropriate sibling); `.sheet`/`.sheet-backdrop`/`.sheet-handle` in globals.css
- src/components/field/PhotoEditSheet.tsx — after-the-fact photo label/phase editing (wired into the job detail page's Photos tab); the `includeInReport` toggle only renders when `canCurate` is passed
- src/types/invoice.ts + src/lib/billing/jobInvoiceNumber.ts + src/app/company/jobs/[jobId]/jobInvoice.ts — persisted JobInvoice type, its own `invoiceCounter` sequence (deliberately separate from Luxor's own `nextLuxorInvoiceNumber`), and the pure `buildDraftFromProjection`/`computeTotals`/`canSendInvoice` module both client and server import
- src/app/api/jobs/[jobId]/invoice/route.ts — GET/POST/PATCH for the persisted invoice (POST is idempotent, `force: true` rebuilds a still-draft invoice from the current projection)
- src/lib/billing/jobInvoiceEmailHtml.ts — `buildJobInvoiceEmailHtml()`, the pure/unit-tested emailed-invoice HTML template (extracted from `send/route.ts`, 2026-09-15); the same letterhead (logo/name/address/phone left, Invoice title + Date/Invoice No./Due/Service block right, boxed Total Due) as the in-app invoice-doc render in `jobs/[jobId]/page.tsx`, both reading `businessConfig`'s branding fields
- src/app/api/jobs/[jobId]/invoice/send/route.ts — thin auth-and-fetch shell around `buildJobInvoiceEmailHtml()`; marks the invoice `sent`
- src/types/team.ts — TeamRole (permission axis) + TradeTitle (Phase 12/Phase 7, descriptive only, no permissions) + TeamMember (trade?/displayName?/crewId?)
- src/lib/team/landing.ts — defaultLandingPath(): field trades → `/company/field`, foreman → `/company/jobs`, else the dashboard; always the dashboard when this industry has no Jobs/Field module
- src/lib/branding/logo.ts — logo-library size caps + `logoStyle()`/`needsLogoChip()`, the rendering rule for a logo on a white document vs. a colored bar (see the Cache-Control-style "read this before touching X" rules above — this is the one place that decision lives)
- src/app/api/company/library/logos/route.ts + src/app/company/library/LogosSection.tsx — the logo library's GET/POST/PATCH/DELETE and its Library "Branding" tab UI (dual white/brand-bar preview, set-default, variant picker)
- src/components/field/InstallPrompt.tsx — "Add to Home Screen" nudge on `/field` only (not `/company/field` — its manifest start_url doesn't point there, see the component's own doc comment); the one real lever over "the address bar shows on mobile," which no website can suppress in a plain browser tab

## Phase 13–20 Key Files

- src/lib/voice/types.ts + provider.ts + elevenlabs/ — the voice-provider seam: `voiceProviderOf(config)` (missing => "vapi"), `getVoiceProvider()`, `pushPersona`, `startOutboundCall`. **Only the phone call is provider-specific** — field notes (Whisper + gpt-4o), invoices, reports and the 7 booking tools never touch Vapi/ElevenLabs.
- src/lib/recordingDisclosure.ts — the call-recording notice (missing config = default ON, spoken first; draft wording, not legal advice)
- src/lib/vapi/syncPersonas.ts + src/app/api/admin/sync-personas/route.ts — one-time push of every tenant's greeting/prompt to its live assistant (dry-run by default; skips shared assistants like the demo line)
- src/types/workCatalog.ts, quote.ts, documentOptions.ts — shared contracts for the work catalog, quotes, and hide-materials/labor options
- src/lib/verticals/starterKits.ts, workCatalogStarter.ts — per-industry starter content (prices are EXAMPLES flagged `starter`, never placeholder text in customer-visible strings)
- src/lib/jobs/findings.ts, src/lib/billing/jobQuote*.ts — job findings (point-in-time snapshots) and quotes (own counter; no online acceptance/payment)
- docs/WORKER_QUEUE.md — worker assignments + paste-ready prompts; docs/NEEDS-HUMAN-CHECKLIST.md — the owner's click-by-click list

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

1. **Voice decision (T-110, next session)** — run the scripted bake-off in `docs/VOICE-RESEARCH-2026-09-24.md` on SEPARATE test
   assistants (never the live line): Vapi + ElevenLabs/Cartesia voices, gpt-realtime via Vapi, then ElevenLabs Agents. The dormant
   `voiceProvider` seam (T-111) means a winner can be switched on per tenant without a rewrite.
2. **Build queue** — see `docs/WORKER_QUEUE.md`: finish T-111b (ElevenLabs webhooks), T-113 (request review + decline), T-114 (feedback +
   UX pass), T-107a/b (invoice/quote/report suite with hide-materials/labor + logo everywhere), T-109 (email intake).
3. **Owner sign-off items** — `docs/NEEDS-HUMAN-CHECKLIST.md`: Vapi console audit (NH-1), Resend domain (NH-3), recording-notice wording (NH-4),
   real-device tests (NH-8), `crm.luxordev.com` (NH-17), Care Homes/Daycares live-call safety tests (NH-18), ElevenLabs keys/number/privacy
   (NH-20..22), and pressing **Apply** on Admin -> Clients -> "Sync live phone assistants" so the recording notice reaches live lines.
4. **Major dependency upgrades** — Firebase Admin 14 (T-062, blocked upstream), Next.js 16, Firebase 12: separate, deliberate tasks.
5. **Post-MVP** — Google Calendar OAuth, Stripe billing, SMS, in-app Vapi/ElevenLabs provisioning (T-054/T-112).

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
- **Voice (2026-09-07, reverted)**: briefly ran OpenAI `gpt-realtime-2025-08-28` (native speech-to-speech) + the `cedar` voice (2026-09-05 – 2026-09-07) for maximum prosody/naturalness. **Rolled back after a real phone call exposed a broken turn-taking regression**: the assistant talked over the caller, never yielded on interruption, and cut off mid-word on longer responses (resuming only if the caller said "continue"). Root cause: Vapi's `startSpeakingPlan`/`stopSpeakingPlan` (the hand-tuned `numWords: 2`/`backoffSeconds: 0.7`/`waitSeconds: 0.1`) govern the cascaded transcriber→LLM→TTS pipeline only — they don't apply to speech-to-speech models, so the tuned interruption handling was silently inert the whole time it ran. **Live config is back to** Vapi Voices v2 `Savannah` + `gpt-4o-mini` (openai) + Deepgram Flux transcriber — the same cascaded pipeline the turn-timing settings actually govern. Cost is back to ~$0.09–0.14/min. Script: `scripts/rollback-vapi-voice.mjs` (`--dry-run` supported); the pre-rollback (gpt-realtime/cedar) snapshot is saved outside the repo, not in git. If gpt-realtime is revisited, treat interruption/turn-detection tuning as a separate, unproven problem — don't assume the cascaded-pipeline settings carry over.
- **Spanish voice (2026-09-16, NEEDS-HUMAN)**: the phone AI's language toggle (Settings → Phone AI Language) switches the transcriber and the prompt/greeting live, but deliberately does NOT switch to a language-specific voice — `src/lib/vapi/voices.ts` has no confirmed-working Spanish `voiceId` anywhere in this codebase, and guessing one risked silently breaking a live line. `Savannah` (English-named) speaks whatever language the prompt asks for in the meantime. To finish: pick a real Spanish voice in the Vapi dashboard's voice picker, confirm it sounds right on a test call, then fill in `AGENT_VOICES.es` and thread it through `updateAssistantPersona`.

## Contact

- Superadmin: connect@luxordev.com
- Product Owner: Kareem Awad
