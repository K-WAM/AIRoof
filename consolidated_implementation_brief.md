# Consolidated Implementation Brief

## Scope and source discipline

This brief consolidates three independent repository reviews. It does **not** perform a new audit. Findings are retained only where the reports provide direct code, route, symbol, test, command, or repository-state evidence. Production-console state, deployed configuration, external-provider behavior, and untested human workflows remain explicitly unverified.

Priority meanings:

- **P0** — confirmed launch-stopping security, privacy, or destructive-integrity defect.
- **P1** — required before real-customer production use, but not independently classified as P0.
- **P2** — material hardening, operational, or user-experience correction that should be scheduled but does not independently block a tightly controlled release.

---

## Release assessment

### Verdict: **NOT READY for real-customer production launch**

Two confirmed P0 defects remain at consequential authority boundaries:

1. The Vapi webhook can authenticate **fail-open**, allowing forged requests to execute privileged tools, mutate customer records, expose PII, and trigger paid outbound activity.
2. Appointment lookup and cancellation do not adequately verify caller identity, permitting cross-customer disclosure and cancellation even after transport-level webhook authentication is corrected.

The repository also has confirmed P1 weaknesses in scheduling integrity, idempotency and recovery, emergency escalation truthfulness, background-job execution, AI-derived data validation, field access scope, demo/production separation, privacy controls, provider configuration, and release verification.

A controlled **internal demo** may be possible only when it uses isolated demo data and infrastructure, contains no real customer PII, cannot trigger uncontrolled paid actions, and does not share destructive reset paths with production. That exception does not change the release verdict.

---

## Verified and protected context

### Verified working foundations

The following behavior was consistently supported by the reviews and should not be reopened without stronger contradictory evidence:

- Stack: Next.js 15 App Router, TypeScript, Vercel, Firebase Auth, Firestore, Vapi, Resend, OpenAI, and DeepSeek.
- Tenant records are keyed by `businessId`.
- `firestore.rules` ends in deny-all at `firestore.rules:139`.
- Membership and role checks are centralized through `verifyAuthAndRole`, `verifySuperadmin`, and `verifyFieldAccess` in `src/lib/auth/verifyRole.ts`.
- Administrative SDK usage was not found in client, hook, or context code.
- No source-controlled secret leakage was identified.
- Field corrections use an explicit confirm/cancel interaction.
- Reports and invoices retain manual send gates.
- Recording, processing, and success states are visible in the field UI.
- FAQ suggestions require human approval and use a transactional update.
- The reviewed worktree was clean, on `main`, and synchronized with `origin/main` at commit `1ad9566155b8df4fe3306ae5bcaab0310e7257cc`.
- Repository status documentation currently lives in `CLAUDE.md`, `HANDOFF.md`, and `docs/EPIC-PLAN.md`; `AGENTS.md`, `TODO.md`, and `MASTER_PLAN.md` were absent.

### Protected architecture and contracts

Do not change these without evidence that the current contract is defective:

- `businessId` tenant scoping.
- Default-deny Firestore rules.
- Centralized role and membership checks.
- Manual approval before sending reports, invoices, or FAQ changes.
- Existing field correction confirmation semantics.
- Current route and data contracts unless a task explicitly defines a versioned replacement and migration.
- Current provider behavior that has reliable verification; do not replace providers or redesign workflows merely for stylistic consistency.

### Accepted limitations

These are acceptable only when they are explicit and not represented as completed production capabilities:

- A single isolated demo tenant and number may be used for internal demonstration.
- Firebase Spark-plan constraints, base64 photos in Firestore, and lack of Firebase Storage may remain for a demo environment.
- Google Calendar integration is not active.
- SMS escalation is not implemented.
- `daily-call-summary` and `faq-suggestions` may remain unscheduled if that is an intentional owner decision.
- Pagination, advanced search, theme unification, and richer demo data are not release prerequisites at current MVP volumes.

---

## Consolidated findings

| ID | Priority | Root cause | Evidence | Affected areas | Required outcome | Acceptance criteria |
|---|---:|---|---|---|---|---|
| CIB-001 | P0 | Privileged Vapi ingress authenticates fail-open and lacks replay/event verification. | `src/lib/vapi/verify.ts:10-14`; `src/app/api/webhooks/vapi/route.ts:37,137`; `CLAUDE.md:285`; tool effects in `src/lib/tools/agentTools.ts:249,452,485`. | Vapi webhook, appointment mutation, lead creation, escalation, outbound calls, PII lookup. | Fail closed in every non-test environment. Use Vapi-supported authentication/signing, validate event identity and replay window, remove production bypass behavior, and reject missing configuration. | Unsigned, missing-secret, wrong-secret, altered, and replayed webhook requests return `401` and cause **zero** Firestore writes, emails, calls, or tool execution. A valid signed event succeeds once. |
| CIB-002 | P0 | Appointment lookup and cancellation trust partial caller-supplied identity and an exposed appointment ID. | `src/lib/tools/agentTools.ts:452-485`; lookup returns address/status/ID; cancellation relies on the ID. | Appointment privacy, lookup, cancellation, caller verification. | Define a business-approved identity check, disclose minimum necessary data, and require explicit cancellation confirmation bound to the verified caller and business. | Cross-customer lookup and cancellation tests fail without verified identity. Partial-name/address guessing cannot reveal an appointment ID or cancel another customer’s booking. Legitimate correction and cancellation remain usable. |
| CIB-003 | P1 | Scheduling is non-authoritative: fixed/mock availability, no transactional conflict protection, and optimistic UI state is not reconciled on failure. | `src/lib/tools/agentTools.ts:47`; `src/app/company/calendar/page.tsx:95-97,136`; `src/app/api/jobs/[jobId]/assign/route.ts:34`; calendar path noted untested in `HANDOFF.md:10`. | Voice booking, appointments, crew assignment, calendar drag/drop, business hours. | Either implement authoritative availability or explicitly model the action as a requested time. Add transactional conflict checks and rollback/reload failed optimistic mutations. Separate scheduling state from notification state. | Concurrent, occupied-slot, closed-day, duration, timezone/DST, and failed-API tests cannot double-book or display unpersisted assignments. Failed writes restore or reload truthful UI state and show an actionable error. |
| CIB-004 | P1 | External side effects have no durable idempotency, outbox, attempt state, or reconciliation. | `src/lib/tools/agentTools.ts:114`; `src/app/api/calls/outbound/route.ts:94`; repeated booking, lead, email, and call paths use non-provider IDs or can succeed externally before canonical persistence. | Webhook retries, outbound calls, bookings, leads, callbacks, emails, confirmations. | Introduce stable provider/event idempotency keys, transactional state machines or outboxes, attempt records, provider IDs, retry classification, and reconciliation. | Replaying the same event, double-clicking, losing the response, or interrupting each post-provider write produces exactly one external action. Recovery converges to a single canonical state with visible attempts. |
| CIB-005 | P1 | Emergency escalation reports success despite unacknowledged or failed delivery. | `src/lib/tools/agentTools.ts:304`; `src/app/api/webhooks/vapi/route.ts:244`; email errors are swallowed while the caller is told the team was notified and will respond within 15 minutes. | Emergency calls, Resend delivery, operator alerts, caller messaging. | Represent `accepted`, `delivered`, `failed`, and `unconfigured` separately. Use an acknowledged channel, operator-visible failure, and retry/fallback. Never promise notification or response timing without evidence. | Forced provider failure or missing configuration never returns `escalated:true` or a delivery promise. A failed escalation is persisted, visible, retryable, and correlated to the call. |
| CIB-006 | P1 | Background-job authentication and lead eligibility state are inconsistent with Vercel and Firestore semantics. | `src/app/api/cron/follow-up-calls/route.ts:14-15,58`; `vercel.json:4`; `src/lib/tools/agentTools.ts:203`; `daily-call-summary/route.ts:26`; `faq-suggestions/route.ts:27`. | Follow-up calls, daily summaries, FAQ generation, lead callbacks. | Centralize a fail-closed cron guard using `Authorization: Bearer <CRON_SECRET>`. Initialize explicit callback state on lead creation, use due timestamps and correct configuration names, and claim work atomically. | Production-equivalent cron invocation returns `200`, selects one eligible consented lead within its configured window, records one attempt, and cannot duplicate it. Missing/invalid secret returns `401` with no model/provider calls or writes for every cron route. |
| CIB-007 | P1 | AI-derived mutations cross the trust boundary without complete runtime schemas, confidence handling, or deterministic server-side tool policy. | `src/app/api/jobs/[jobId]/field-audio/route.ts:51`; `src/lib/ai/deepseekClient.ts:72`; `src/app/api/agent/respond/route.ts:61`; normal field extraction persists before review. | Field transcription/extraction, Vapi tools, structured output, job materials/labor, prompt/config input. | Add request, model-output, tool-input, and persistence schemas; load authoritative context server-side; bound file size/duration/timeouts; handle language and confidence; require confirmation for ambiguous or high-impact changes; authorize every tool server-side. | Malformed nested JSON, prompt injection, untrusted config text, empty/oversized audio, noisy/accented/multilingual input, and low-confidence extraction cannot mutate state without valid schema, authorization, and required confirmation. |
| CIB-008 | P1 | Field access uses one stable business-wide credential in the query string with broad anonymous scope and no expiry. | `src/lib/auth/verifyRole.ts:91`; `src/app/api/admin/demo-customize/route.ts:174`. | `/field`, `/company/field`, QR access, jobs, photos, voice updates. | Replace reusable query credentials with short-lived, scoped, revocable grants exchanged into a safer header/session mechanism. Enforce least privilege and audit use. | Expired or revoked tokens fail. A job-A token cannot list or mutate job B. URLs and referrers contain no reusable business-wide credential. |
| CIB-009 | P1 | Demo and production state share a destructive reset path and live-line identity. | `src/app/api/admin/demo-customize/route.ts:70`; the route deletes calls, leads, appointments, crews, and jobs before reseeding and can overwrite contact data. | Demo Studio, live phone line, tenant data, notifications. | Isolate demo in a separate environment/project/number, or add hard demo-only guards, tenant locks, backup, concurrency protection, and explicit destructive confirmation. | Non-demo tenants and production environments cannot invoke reset. Concurrent webhook activity cannot observe partial reseeding. Recovery or backup is available before destructive demo operations. |
| CIB-010 | P1 | PII retention and audit events are incomplete, mutable, or factually inaccurate. | `src/app/api/webhooks/vapi/route.ts:273,342`; `src/app/api/calls/[callId]/route.ts:114`; raw transcripts, recording URLs, and tool inputs/outputs are retained; DELETE only marks ended; lookup/cancel logs are mislabelled. | Calls, recordings, transcripts, diagnostic logs, audit trail, deletion. | Define repository-enforced retention, deletion/redaction, immutable event types, correlation IDs, provider/delivery IDs, and privacy-safe logging. | Retention jobs delete or redact eligible data. A call/action audit replay accurately reconstructs who/what/when/result without exposing unnecessary PII. Deletion semantics match documented policy. |
| CIB-011 | P1 | Model/provider selection is scattered, some configured values are ignored, and missing keys can return plausible mock output. | `src/lib/ai/deepseekClient.ts:44`; hardcoded `whisper-1`, `gpt-4o`, and `deepseek-chat`; `DEEPSEEK_MODEL` and persisted `backOfficeModel` are not honored; `.env.example` omits `RESEND_FROM`, `VAPI_AUTH_BYPASS`, and `VAPI_BASE_URL`. | OpenAI, DeepSeek, Vapi, field extraction, summaries, classifications, health/readiness. | Centralize capability-to-provider/model routing and environment validation. Fail explicitly outside test/demo. Add provider-neutral adapters only where needed by an approved task. | Configuration tests prove each capability uses the intended provider/model. Missing production keys fail readiness and do not generate fabricated summaries, classifications, or success responses. |
| CIB-012 | P1 | Operator-facing state can be false or silently lost because errors are swallowed, async state is misused, and forms lack basic guards. | Silent fetch catches in `src/app/company/dashboard/page.tsx:93`, `calls/page.tsx:40`, `pipeline/page.tsx:110`, `jobs/page.tsx:68`, `calendar/page.tsx:95-97`, `src/app/admin/businesses/page.tsx:38`, `usage/page.tsx:38`, and the library page; invoice flow `src/app/admin/invoices/page.tsx:138-163`; settings validation `src/app/company/settings/page.tsx:149-157`; onboarding and admin config pages. | Dashboard, calls, pipeline, jobs, calendar, library, businesses, usage, invoices, settings, onboarding/config. | Replace silent failure with explicit loading/error/empty states. Correct new-invoice save/send sequencing without relying on stale React state. Add required field/format validation and dirty-form protection where data loss is material. | Injected fetch failures never render a successful empty state. A new invoice sends with one explicit action after successful save. Invalid required email/phone/client data is rejected. Navigating away from dirty critical forms warns the user. |
| CIB-013 | P2 | Outbound communication identity and delivery status are fragmented across routes and defaults. | `src/lib/notify.ts:8` versus `src/lib/tools/agentTools.ts:7`; placeholder sender fallback; `src/app/api/appointments/send-confirmation/route.ts:57`; `src/app/api/jobs/[jobId]/assign/route.ts:34`. | Resend sender, booking/report/crew/customer email, delivery feedback. | Use one verified `RESEND_FROM`, one communication service, explicit delivery status, safe retry, and truthful UI messages. | Test messages deliver from the verified domain with SPF/DKIM alignment. Provider failures are shown as delivery failures, not “no email on file,” and retries do not duplicate messages. |
| CIB-014 | P2 | Browser/session hardening is incomplete. | `src/contexts/AuthContext.tsx:56`; raw Firebase ID token stored in a JavaScript-readable `__session` cookie without a server-set `HttpOnly` boundary; no `next.config.*` security-header configuration was found. | Session token, XSS containment, clickjacking, MIME sniffing, transport headers. | Add appropriate `Secure` cookie behavior immediately and plan a server-set session-cookie boundary. Add CSP/HSTS/frame/content-type/referrer headers compatible with the application. | Production cookie/header inspection confirms intended flags and headers. Authentication and embedded/provider workflows still function under the policy. |
| CIB-015 | P1 | Release changes have no automated CI gate or deterministic workflow suite. | No `.github/` directory; no test script or suite in `package.json:5`; Vercel auto-deploys `main`; `HANDOFF.md:10` says the new calendar path was not human click-tested. | Pull requests, main deployments, calendar, webhooks, cron, provider integrations, adversarial inputs. | Add CI for type-check, lint, build, unit/integration tests, and a small deterministic end-to-end release suite. Gate merges/deployments on green checks. | A pull request runs green required checks. Tests cover P0/P1 acceptance criteria, webhook replay/auth, cron invocation, duplicate side effects, calendar failure rollback, and provider-key readiness. |

---

## Cross-cutting corrections

### 1. Fail-closed boundary policy

Create shared guards for webhook, cron, provider, environment, and field-token boundaries. Missing configuration must produce an explicit failure in production, never an authentication bypass or plausible mock success.

Resolves or supports: `CIB-001`, `CIB-006`, `CIB-008`, `CIB-011`, `CIB-014`.

### 2. Canonical side-effect state machine

Use stable operation IDs, provider event IDs, idempotency keys, atomic claim/transition logic, outbox/attempt records, retry classification, and reconciliation for calls, bookings, callbacks, emails, and escalations.

Resolves or supports: `CIB-003`, `CIB-004`, `CIB-005`, `CIB-006`, `CIB-013`.

### 3. Runtime schema and authorization boundary

Define versioned schemas for requests, model output, tool inputs, persistence records, and external events. Run deterministic authorization and consequence checks server-side before mutation or provider invocation.

Resolves or supports: `CIB-002`, `CIB-007`, `CIB-011`.

### 4. Truthful state and error semantics

Standardize `loading`, `empty`, `error`, `pending`, `persisted`, `delivery pending`, `delivered`, and `failed` states across APIs and UI. Do not conflate missing data with failed retrieval or completed persistence with successful notification.

Resolves or supports: `CIB-003`, `CIB-005`, `CIB-012`, `CIB-013`.

### 5. Canonical configuration and readiness

Centralize model selection, environment parsing, sender identity, cron authentication, capability readiness, and provider health. Update `.env.example` with names only; never insert real secrets.

Resolves or supports: `CIB-001`, `CIB-006`, `CIB-011`, `CIB-013`, `CIB-015`.

### 6. Evidence-driven cleanup sweep

After behavior is protected by tests:

- Remove dead imports, unreachable branches, obsolete components, duplicate helpers, unused environment-variable declarations, stale comments, superseded routes, and redundant notification/toast implementations.
- Consolidate duplicate code only when callers and behavior are understood.
- Use repository search, TypeScript, lint, build, tests, and route references to prove removal is safe.
- Do not perform speculative architecture rewrites or delete compatibility code without usage evidence.
- Record removed code and rationale in the implementation log.

---

## Recommended workstreams

| Workstream | Scope and likely file ownership | Dependencies | Parallelization guidance |
|---|---|---|---|
| WS-1 — Webhook and caller authority | `src/lib/vapi/verify.ts`; `src/app/api/webhooks/vapi/route.ts`; appointment lookup/cancel symbols in `src/lib/tools/agentTools.ts`; related webhook tests. | None. Must start first. | One owner. Avoid parallel edits to `agentTools.ts` with WS-2/WS-4 without explicit symbol ownership. |
| WS-2 — Scheduling and durable side effects | Scheduling/booking/call functions in `src/lib/tools/agentTools.ts`; `src/app/api/calls/outbound/route.ts`; `src/app/api/jobs/[jobId]/assign/route.ts`; `src/app/api/appointments/send-confirmation/route.ts`; `src/app/company/calendar/page.tsx`. | WS-1 event identity; shared state-machine design. | Split backend state machine and calendar UI only after API contracts are fixed. |
| WS-3 — Cron and callback execution | `src/app/api/cron/follow-up-calls/route.ts`; `daily-call-summary/route.ts`; `faq-suggestions/route.ts`; `vercel.json`; lead creation/state in `src/lib/tools/agentTools.ts`. | Shared fail-closed guard and idempotency primitives. | Can run beside WS-4 after shared guard interfaces are agreed. |
| WS-4 — AI input, structured output, and provider routing | `src/app/api/jobs/[jobId]/field-audio/route.ts`; `src/lib/ai/deepseekClient.ts`; `src/app/api/agent/respond/route.ts`; provider adapters/config; schema and adversarial tests. | Canonical configuration contract. May require provider keys for integration verification. | One owner for schemas/provider registry; route-specific integrations may follow in parallel. |
| WS-5 — Field and demo isolation | `src/lib/auth/verifyRole.ts`; `/field` access exchange; `src/app/api/admin/demo-customize/route.ts`; demo/environment guards and tests. | Token model and environment policy. | Can proceed in parallel with WS-3/WS-4 if shared auth utilities are not edited concurrently. |
| WS-6 — UI truthfulness and administrative forms | Company/admin pages listed in `CIB-012`; invoice save/send; settings/onboarding/config validation; shared error/toast components only where they remove proven duplication. | Stable backend error/state contracts from WS-2/WS-3. | Split by route group. Shared UI primitives require one owner to avoid churn. |
| WS-7 — Communications, privacy, and audit | `src/lib/notify.ts`; Resend call sites; call/transcript routes; audit event schema; retention/redaction jobs. | Side-effect state machine; legal/owner retention decisions. | Delivery service and retention implementation may run separately after event schema is fixed. |
| WS-8 — Release engineering, documentation, and cleanup | `.github/workflows/*`; `package.json`; `next.config.*`; `.env.example`; `AGENTS.md`; `MASTER_PLAN.md`; `TODO.md`; canonical implementation log; final dead-code sweep. | Objective contracts and tests from WS-1 through WS-7. | CI scaffolding can start early. Final cleanup must occur after functional merges and green tests. |

---

## Missing evidence

These are not confirmed defects until inspected through the appropriate console, CLI, or live test:

- Actual production values for `VAPI_WEBHOOK_SECRET`, `VAPI_AUTH_BYPASS`, `CRON_SECRET`, `RESEND_FROM`, provider keys, and Firebase configuration.
- Current Vapi dashboard model, voice, tool schemas, authentication header/signature support, retry policy, recording settings, and server URL configuration.
- Current Vercel deployment health, function logs, and cron invocation results.
- Whether Firestore rules and required indexes are deployed. Only `businessPhoneNumbers` was reported in `firestore.indexes.json`; `businessUsers` and callback queries remain unverified.
- Live Resend domain verification and SPF/DKIM deliverability.
- Live phone-call quality and end-to-end Vapi reliability.
- Human click testing of provider/crew calendar paths.
- Real-device `/field` QR, PWA, camera, and hold-to-speak behavior.
- Production performance and accuracy for noisy, accented, interrupted, multilingual, or domain-specific audio.
- Whether `afterHoursGreeting` still remains hardcoded to “Apex Roofing” after dynamic onboarding edits.
- External recording disclosure, consent, callback opt-in, privacy policy, contractual retention, and deletion obligations.

---

## Human checkpoints

Use CLI and repository-accessible evidence first. Escalate only when credentials, external consoles, legal approval, billing approval, production access, or owner judgment are genuinely required.

1. **Vapi console**
   - Configure the supported webhook secret/signature mechanism.
   - Confirm live assistant model, voice, tool schemas, retry behavior, recording, and server authentication.
   - Rotate or remove any bypass configuration.

2. **Vercel**
   - Set/rotate `VAPI_WEBHOOK_SECRET`, `CRON_SECRET`, provider keys, and `RESEND_FROM`.
   - Remove `VAPI_AUTH_BYPASS` from production.
   - Verify cron invocation and deployment logs.

3. **Resend/DNS**
   - Verify the sending domain and SPF/DKIM.
   - Approve the canonical sender identity.

4. **Firebase**
   - Confirm rules and index deployment.
   - Decide whether production requires Blaze, scheduled exports, Storage, and a documented restore procedure.

5. **Legal/privacy**
   - Approve call-recording disclosure, transcript/recording retention, customer deletion handling, callback consent, and emergency-message wording.

6. **Owner/product judgment**
   - Decide whether scheduling means authoritative booking or only a requested time.
   - Approve a separate demo environment/project/number or the exact guarded alternative.
   - Confirm whether daily summaries and FAQ-suggestion jobs should be scheduled.
   - Confirm whether SMS or Google Calendar is a promised launch capability.

7. **API keys and credentials**
   - If implementation or verification requires an unavailable OpenAI, DeepSeek, Vapi, Resend, Firebase, Google Calendar, Twilio, or other provider credential, the implementation agent must ask for the **specific missing key or console action**.
   - Do not insert placeholders, weaken guards, enable bypasses, fabricate provider output, or mark the task complete without the required credential-dependent verification.

---

## Optional improvements

These may be planned after required release work:

- Unified accessible toast/notification component.
- Consistent `PageSkeleton` use, including `src/app/company/jobs/[jobId]/page.tsx:383`.
- Replace `window.location.href` navigation with Next.js routing in jobs, businesses, and pipeline actions.
- Consistent destructive-action confirmation.
- Search/filter/sort for admin businesses and usage.
- Cursor pagination or virtualization for pipeline, jobs, calls, and tenant lists.
- Mobile overflow handling for the job-detail tab bar.
- Richer demo seed data.
- Field-theme unification.
- Tenant-specific transcription vocabulary and pronunciation hints.
- Operator replay console for transcript, extraction, confidence, tools, delivery state, and safe retry.
- Offline field queue with pending/synced/conflicted states.
- “Edit before save” for high-value field updates.
- Consolidated outbound communication templates.

---

## Rejected or deferred findings

- **Silent fetch failures and calendar rollback are not retained as P0.** They are confirmed and serious, but they do not independently cross the P0 threshold used in this brief. Calendar rollback is merged into `CIB-003`; broader UI truthfulness is `CIB-012`.
- **Invoice double-click, validation gaps, and unsaved-change warnings are consolidated.** They share operator-form correctness and state-management concerns and do not require separate workstreams.
- **Different field color themes are deferred.** This is a subjective presentation preference unless user research or brand requirements establish a functional defect.
- **Pagination, admin search, and richer demo data are deferred.** The reports describe scale or sales-demo improvements, not current launch-stopping failures.
- **Firestore index absence is not treated as a confirmed defect.** Repository declarations are incomplete, but deployed indexes and actual query behavior were not inspected.
- **Production environment-variable absence is not assumed.** The reports could not read sensitive production configuration. Code must still fail closed when required values are absent.
- **Unscheduled `daily-call-summary` and `faq-suggestions` routes are not automatically defects.** Scheduling is an owner decision; insecure fail-open authentication remains a confirmed correction.
- **Existing tenant isolation is protected.** No report supplied stronger evidence contradicting the current `businessId` scoping, deny-all rules, and centralized role checks.
- **No broad visual redesign is authorized.** Only evidence-backed usability and truthfulness corrections belong in the release plan.
- **No provider migration is required solely for preference.** Provider abstraction should be introduced only to centralize current routing, enforce schemas, improve testing, or support an approved migration.

---

## Instructions for the planning engineer

1. **Do not repeat repository discovery or conduct another broad audit.**
   - Start from this brief, then read `CLAUDE.md`, `HANDOFF.md`, and `docs/EPIC-PLAN.md`.
   - Check current Git state only to account for changes after commit `1ad9566155b8df4fe3306ae5bcaab0310e7257cc`.

2. **Validate only material disputed or external-state findings.**
   - Limit validation to items whose priority or implementation depends on current code changes, deployed environment state, provider consoles, or live behavior.
   - Do not reopen reliably verified tenant isolation, manual approval gates, or field correction behavior without contradictory evidence.

3. **Create canonical repository documentation.**
   - Create or update:
     - `AGENTS.md` — execution rules, protected context, safety constraints, test expectations, credential handling, cleanup rules.
     - `MASTER_PLAN.md` — phased workstreams, objective task specifications, dependencies, acceptance criteria, rollback.
     - `TODO.md` — live queue, status, owner, branch/PR, blockers, and `NEEDS-HUMAN` checkpoints.
   - Reconcile or supersede stale instructions in `CLAUDE.md`, `HANDOFF.md`, and `docs/EPIC-PLAN.md` without deleting historical evidence prematurely.

4. **Turn each finding into an objective implementation task.**
   - Include exact files/symbols, required behavior, non-goals, tests, observability, migration/rollback, and completion evidence.
   - Prefer one shared correction when it resolves several findings.

5. **Sequence work by dependency.**
   - First: `CIB-001` and `CIB-002`.
   - Next: shared fail-closed guards, event identity, idempotency/state-machine primitives, and runtime schemas.
   - Then: scheduling, cron, AI, field/demo, communications/privacy, and UI work.
   - Last: CI finalization, documentation reconciliation, and cleanup sweep.

6. **Allocate parallel work safely.**
   - Avoid concurrent edits to `src/lib/tools/agentTools.ts`, shared auth guards, provider registry, event schemas, and common UI primitives.
   - Assign explicit file or symbol ownership and define integration order.

7. **Require objective verification.**
   - Type-check, lint, build, unit/integration tests, adversarial tests, and targeted human click tests.
   - Provider-dependent tasks require real integration evidence or an explicit `NEEDS-HUMAN` checkpoint.

8. **Handle credentials correctly.**
   - Check available CLI/environment metadata before escalating.
   - Ask for the exact missing API key, secret, console permission, or DNS action when required.
   - Never add a production bypass, placeholder secret, or plausible mock fallback to avoid requesting access.

9. **Perform a safe cleanup sweep after functional work.**
   - Remove old, redundant, unreachable, duplicate, or unused code only when repository search and green verification establish safety.
   - Do not mix speculative refactors with security or correctness fixes.
   - Document every meaningful removal and retain compatibility until migration evidence is complete.

10. **Keep the final plan compact and executable.**
    - No subjective redesign.
    - No duplicate tasks.
    - No unsupported assumptions about product type, users, business model, platform, or integrations.
    - Every release requirement must map to a finding and measurable acceptance criteria.
