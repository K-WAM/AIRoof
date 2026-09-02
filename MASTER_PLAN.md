# MASTER_PLAN.md — Release Plan (sole technical specification)

**Source of authority:** `consolidated_implementation_brief.md` (CIB) at repo root — a consolidation of three
independent audits at commit `1ad9566`. This plan turns its findings into executable tasks.
**Companion files:** `AGENTS.md` (execution rules) · `TODO.md` (live queue) · `docs/EXECUTION_PROMPTS.md`
(worker/reviewer prompts) · `docs/SESSION_HANDOFF.md` (session state) · `docs/IMPLEMENTATION_LOG.md` (evidence log).
Task requirements live **only here**. Do not restate them elsewhere.

**Release verdict (from CIB):** NOT READY for real-customer production until P0 tasks T-010/T-011 and the P1 set
are complete. Controlled internal demo remains allowed under the accepted limitations below.

---

## Protected context (do not change without contradictory evidence)

- `businessId` tenant scoping; default-deny `firestore.rules`; centralized checks in `src/lib/auth/verifyRole.ts`.
- Manual send gates for reports, invoices, FAQ changes; field-correction confirm/cancel semantics.
- Existing route/data contracts unless a task defines a versioned replacement.
- No provider migrations for preference; no broad visual redesign. One teal `var(--accent)` design language.
- Industry-Applicability Rule (CLAUDE.md): templates in `src/lib/verticals/templates.ts` are the single source
  for vertical behavior; universal tabs never hidden.

## Accepted limitations (demo-scope, must never be represented as production capability)

Single demo tenant/number; Spark plan + base64 photos; no Google Calendar; no SMS; `daily-call-summary` and
`faq-suggestions` unscheduled pending owner decision (NH-6).

## Baked-in default decisions (owner may override — see TODO.md NEEDS-HUMAN)

- **D-1 Scheduling semantics:** bookings are a **requested time**, not authoritative availability. Transactional
  conflict checks prevent double-booking of the same slot/resource; UI language says "requested". (Overrides: NH-5.)
- **D-2 Demo isolation:** hard in-code guards + tenant lock + pre-reset backup export, on the existing project.
  A fully separate Vapi number/Firebase project is an owner cost decision. (NH-5.)
- **D-3 Cron auth:** Vercel-standard `Authorization: Bearer <CRON_SECRET>`, fail-closed, shared guard.
- **D-4 Sender identity:** `no-reply@luxordev.com` via Resend as the single `RESEND_FROM`, pending domain
  verification (NH-3). Primary contact `connect@luxordev.com` (Luxor Developments LLC).

---

# Phases and tasks

Effort weights: P0-Foundation 8% · P1-Authority 12% · P2-Primitives 15% · P3-Boundaries 30% ·
P4-Operator-truth 20% · P5-Release+cleanup 15%.

Task template fields: **Objective/Evidence · Spec · Deps · Owns · Constraints · Edge/failure cases ·
Security/accessibility · Acceptance · Tests · Rollback · Prohibited scope.**

---

## Phase 0 — Foundation (parallel-safe now)

### T-000 — Test harness + CI gate
- **Objective:** Add vitest, a `test` script, and `.github/workflows/ci.yml` running type-check, lint, build, test on PR and push to main. **Evidence:** no `.github/`, no test script (`package.json` scripts = dev/build/start/lint/type-check).
- **Spec:** CIB-015, cross-cutting §5.
- **Deps:** none.
- **Owns:** `package.json`, `package-lock.json`, `vitest.config.ts`, `.github/**`, `src/test-utils/**`.
- **Constraints:** Node 20 in CI; no network in unit tests; Firestore/Vapi/Resend mocked via injectable seams only where they already exist (do not refactor call sites in this task). Keep `npm run lint` green (flat config exists, 0 errors/26 warnings baseline).
- **Edge/failure cases:** Windows dev vs Linux CI path handling; `next build` needing env vars — provide CI-safe dummies for `NEXT_PUBLIC_*` only, never for secrets.
- **Security/accessibility:** never echo secrets in CI logs; no production keys in workflow.
- **Acceptance:** a PR shows green required checks; `npm test` runs locally on Windows; one example unit test per layer (lib, api route via direct handler import) passes.
- **Tests:** the harness itself + 2 seed tests.
- **Rollback:** delete workflow file; harness is additive.
- **Prohibited scope:** no e2e suite yet (T-050); no branch-protection changes (needs owner, NH-7); no test-driven refactors of app code.

### T-001 — `.env.example` completion (names only)
- **Objective:** Document all required/optional env names: add `RESEND_FROM`, `VAPI_WEBHOOK_SECRET`, `CRON_SECRET`, `VAPI_BASE_URL`; mark `VAPI_AUTH_BYPASS` as removed-after-T-010. **Evidence:** CIB-011 — those names absent today.
- **Spec:** CIB-011 (partial), cross-cutting §5. **Deps:** none. **Owns:** `.env.example`.
- **Constraints:** names + one-line comments only; never real values.
- **Edge cases:** n/a. **Security:** no secrets. **Acceptance:** every `process.env.X` read in `src/` and `scripts/` has a line in `.env.example` (verify by grep). **Tests:** grep audit noted in commit message. **Rollback:** revert file. **Prohibited:** no code changes.

### T-002 — Security headers + cookie flags
- **Objective:** Add security headers in `next.config.ts` (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`/`X-Frame-Options`, CSP in **Report-Only** first) and set `Secure; SameSite=Lax; Path=/` on the `__session` cookie. **Evidence:** CIB-014 — no header config found; raw ID token in JS-readable cookie at `src/contexts/AuthContext.tsx:56`.
- **Spec:** CIB-014. **Deps:** none.
- **Owns:** `next.config.ts`, `src/contexts/AuthContext.tsx` (cookie lines only), `src/middleware.ts` (only if needed for headers).
- **Constraints:** must not break Vapi webhooks (API routes need no CSP), the `/field` PWA, embedded guide iframes (`/admin/guide` iframes `public/guides/*` — same-origin must stay allowed), or Firebase auth popups/redirects.
- **Edge/failure cases:** localhost dev (no `Secure` on http — gate by `location.protocol`); guide iframe = same-origin framing must remain allowed (use `frame-ancestors 'self'`).
- **Security/accessibility:** this is the security task; no UI change.
- **Acceptance:** `curl -sI` of prod-build pages shows the headers; login + company portal + `/field` + `/admin/guide` iframe still function locally; CSP violations only reported, not enforced.
- **Tests:** unit test for header config export; manual click checklist recorded in the implementation log.
- **Rollback:** headers are config-only; revert commit. **Prohibited:** server-set HttpOnly session migration (future task, requires auth flow redesign); CSP enforce mode.

---

## Phase 1 — P0 authority boundaries (one owner; starts first)

### T-010 — Fail-closed Vapi webhook authentication
- **Objective:** `verifyVapiWebhook` fails closed in every non-test environment: remove the `VAPI_AUTH_BYPASS`/missing-secret bypass, require the configured Vapi server-secret header, add an event-identity replay guard (dedupe on Vapi call/message id within a window), and reject when configuration is missing. **Evidence:** `src/lib/vapi/verify.ts:10-17` returns `true` when bypass is set **or the secret is unset**; tool side effects reachable at `src/lib/tools/agentTools.ts` (booking/lead/escalation/outbound).
- **Spec:** CIB-001, cross-cutting §1. **Deps:** none (harness helpful; may use `npm i --no-save vitest` until T-000 merges).
- **Owns:** `src/lib/vapi/verify.ts`, `src/app/api/webhooks/vapi/route.ts` (auth/dedupe portions), `src/lib/vapi/__tests__/**`.
- **Constraints:** keep timing-safe compare; keep accepted header names (Vapi sends the dashboard-configured secret — mechanism itself is fine); `NODE_ENV==='test'` may inject secrets via env, never via a code bypass. Log auth failures without secret values (current length-only logging is acceptable). Dedupe store must be Firestore-based (serverless instances share nothing) and TTL-bounded.
- **Edge/failure cases:** missing secret env in prod → 401 + explicit server log; duplicate delivery of `end-of-call-report` (Vapi retries) → second attempt is a no-op `200 {duplicate:true}`; clock-skewed timestamps; concurrent duplicate deliveries (transactional claim).
- **Security/accessibility:** the security fix itself. PII: no transcript content in auth-failure logs.
- **Acceptance (from CIB):** unsigned, missing-secret, wrong-secret, altered, and replayed requests return 401 (or duplicate no-op) with **zero** Firestore writes/emails/calls/tool executions; a valid event succeeds once.
- **Tests:** unit tests for every rejection class; integration test importing the route handler with mocked Firestore proving zero writes on reject; replay test proving single processing.
- **Rollback:** single revertible commit; NH-1/NH-2 (Vapi + Vercel secret config) must be done **before** production deploy of this change or live calls break — deploy gate noted in TODO.
- **Prohibited scope:** no changes to tool business logic; no provider migration; no new webhook framework.

### T-011 — Verified caller identity for appointment lookup/cancel
- **Objective:** `lookupAppointment`/`cancelAppointment` require verified identity: match on the **Vapi-reported caller number** (from call metadata passed by the webhook, not model-supplied), disclose minimum data (day/time + service only — never `appointmentId`, full address, or other customers' names), and make cancellation a two-step confirm bound server-side to the verified match. **Evidence:** `src/lib/tools/agentTools.ts:452-521` — fuzzy name/address matching over all tenant appointments, returns `appointmentId` + address; cancel needs only the ID.
- **Spec:** CIB-002, cross-cutting §3. **Deps:** T-010 (webhook must pass trusted caller metadata; same owner, same batch).
- **Owns:** `lookupAppointment`, `cancelAppointment`, their input interfaces in `src/lib/tools/agentTools.ts`; the two tool dispatch cases in `src/app/api/webhooks/vapi/route.ts`; matching tests. **No other symbols in `agentTools.ts`.**
- **Constraints:** keep tool names/JSON contracts compatible with the live Vapi assistant config (7 tools) — extend parameters, don't rename; unknown callers (blocked caller ID) get a graceful "I can't verify you — the office will call back" path that creates a lead, not a disclosure.
- **Edge/failure cases:** caller with multiple appointments (list day/times only, confirm which); shared/family phone (acceptable: phone = identity boundary per D-1-level owner default); no caller ID; number formatting variants (normalize digits); cancelled-status appointments excluded from disclosure.
- **Security/accessibility:** cross-tenant scoping already enforced by `businessId` — keep; add per-caller scoping.
- **Acceptance (from CIB):** cross-customer lookup/cancel tests fail without verified caller number; name/address guessing reveals nothing and cannot cancel; a legitimate caller can still look up and cancel their own booking in one call.
- **Tests:** adversarial unit tests (guessing, ID replay from a prior lookup, cross-business), happy-path test, no-caller-ID test.
- **Rollback:** revert commit; tool schema change in Vapi dashboard (if any) recorded in NH-1.
- **Prohibited scope:** other tools in `agentTools.ts`; email/SMS verification flows; UI changes.

---

## Phase 2 — Shared primitives (single owner; contracts others build on)

### T-020 — Central config/readiness + fail-closed cron guard
- **Objective:** One module (`src/lib/config/env.ts`) validating env at use (required names, typed getters, explicit production failure instead of silent fallback), plus `requireCronAuth(req)` in `src/lib/auth/cronGuard.ts` accepting only `Authorization: Bearer <CRON_SECRET>` (D-3), and a `/api/health` readiness extension reporting per-capability configured/unconfigured (no secret values). **Evidence:** CIB-006 (`x-cron-secret`/query-param check at `follow-up-calls/route.ts:14-15` — Vercel sends the Bearer header, so prod cron 401s today), CIB-011 (scattered env reads, mock fallbacks).
- **Spec:** CIB-006 (partial), CIB-011 (partial), cross-cutting §1 §5. **Deps:** T-000 (harness).
- **Owns:** `src/lib/config/env.ts` (new), `src/lib/auth/cronGuard.ts` (new), `src/app/api/health/route.ts`.
- **Constraints:** adoption by routes happens in T-032/T-033 — this task creates + tests the primitives and converts **only** the health route; no behavior change elsewhere.
- **Edge cases:** dev without secrets (health reports unconfigured, doesn't crash); empty-string env values treated as missing.
- **Security:** health output never includes values or key prefixes.
- **Acceptance:** unit tests: missing/invalid bearer → 401 before any work; health shows accurate readiness with/without vars.
- **Tests:** unit only. **Rollback:** additive; revert. **Prohibited:** editing cron routes' business logic (T-032), AI provider routing (T-033).

### T-021 — Side-effect ledger (idempotency + attempts)
- **Objective:** Firestore-backed primitive: `operations/{opId}` records with `claim(opId)` (transactional create-or-fail), attempt subrecords, states `pending|succeeded|failed`, provider IDs, and a stable op-ID convention (e.g. `vapi:{callId}:{tool}:{n}`, `email:{type}:{entityId}`). **Evidence:** CIB-004 — bookings/leads/emails/calls have no idempotency; webhook retries duplicate side effects.
- **Spec:** CIB-004, cross-cutting §2. **Deps:** T-000.
- **Owns:** `src/lib/ops/ledger.ts` (new), `src/lib/ops/__tests__/**`, `src/types/ops.ts` (new).
- **Constraints:** tenant-scoped storage under `businesses/{businessId}/operations`; write primitive + tests only — call-site adoption happens in T-030/T-031/T-032/T-041. Design doc-comment must define retry classification (retryable vs terminal).
- **Edge cases:** concurrent claim of same opId (exactly one wins — transaction test); orphaned `pending` older than TTL (reconciliation query helper).
- **Security:** no PII in op records beyond entity references.
- **Acceptance:** transaction test proves double-claim yields one execution; ledger read helper lists attempts.
- **Tests:** unit with Firestore emulator or transactional mock. **Rollback:** additive. **Prohibited:** adopting it anywhere yet.

### T-022 — Runtime schema layer for AI and tool I/O
- **Objective:** zod schemas + parse helpers for: Vapi tool-call inputs (7 tools), DeepSeek/OpenAI structured outputs (`parseFieldUpdate` result, summaries, classification), and persistence-bound records derived from them; reject/flag on parse failure with a typed error. **Evidence:** CIB-007 — model output crosses trust boundary unvalidated (`deepseekClient.ts:72`, `field-audio/route.ts:51`).
- **Spec:** CIB-007 (core), cross-cutting §3. **Deps:** T-000.
- **Owns:** `src/lib/schemas/**` (new), zod dependency addition coordinated with integrator (package.json otherwise owned by T-000 — sequence after T-000 merges).
- **Constraints:** schemas mirror existing TS types in `src/types/*` — no shape redesign; helpers return `{ok,data}|{ok:false,issues}` and never throw into route handlers.
- **Edge cases:** nested-JSON-in-string model replies; extra keys (strip); numeric strings; empty transcript.
- **Security:** schema failures logged without full payload PII (truncate).
- **Acceptance:** malformed fixtures (10+ adversarial samples incl. prompt-injection-shaped output) all rejected; valid fixtures pass.
- **Tests:** fixture-driven unit tests. **Rollback:** additive. **Prohibited:** wiring into routes (T-033), changing prompts.

---

## Phase 3 — Boundary applications (parallel after Phase 2; see workstream ownership)

### T-030 — Scheduling integrity + calendar rollback
- **Objective:** Apply D-1: booking tools and calendar assignment do transactional conflict checks (same resource/slot), model requested-time semantics truthfully in copy, and every optimistic UI mutation on `src/app/company/calendar/page.tsx` rolls back or reloads on failed API response with a visible error. Separate scheduling persistence from notification state (uses T-021 ledger for the crew/customer emails). **Evidence:** CIB-003 — mock availability (`agentTools.ts:47`), silent catches + optimistic state (`calendar/page.tsx:95-97,136`), assign route non-transactional (`assign/route.ts:34`).
- **Spec:** CIB-003, cross-cutting §2 §4. **Deps:** T-011 merged (agentTools.ts serialization), T-021, T-022.
- **Owns:** booking/availability symbols in `src/lib/tools/agentTools.ts` (`checkAvailability`, `bookAppointment`), `src/app/api/jobs/[jobId]/assign/route.ts`, `src/app/api/appointments/[appointmentId]/route.ts`, `src/app/company/calendar/page.tsx`.
- **Constraints:** keep Vapi tool contracts compatible; keep drag-drop UX (@dnd-kit) and `calendarMode` semantics; business-hours honored per business timezone.
- **Edge/failure cases (from CIB acceptance):** concurrent booking of one slot; occupied slot; closed day; duration overlap; timezone/DST boundary; API failure mid-drag (UI restores truthful state).
- **Security/accessibility:** assignment routes stay session-role-gated; drag-drop keyboard alternative not required this task (log as backlog), but error states must be screen-reader-visible (`role="alert"`).
- **Acceptance:** the CIB-003 test list cannot double-book or show unpersisted assignments; failed writes surface an actionable error.
- **Tests:** transaction unit tests; component test for rollback path (or scripted Playwright note in log + NH-8 human click test).
- **Rollback:** per-file revert; no data migration. **Prohibited:** real Google Calendar integration; redesigning the board.

### T-031 — Truthful emergency escalation
- **Objective:** Escalation returns `accepted|delivered|failed|unconfigured` from real provider results (Resend response persisted via T-021 attempts); caller messaging never promises notification/timing without evidence ("I've flagged this as urgent" vs "the team was notified and will respond within 15 minutes"); failures are persisted, operator-visible (dashboard flag), and retryable. **Evidence:** CIB-005 — `agentTools.ts:304` swallows email errors, webhook tells caller team was notified (`vapi/route.ts:244`).
- **Spec:** CIB-005, cross-cutting §2 §4. **Deps:** T-021; serialize with T-030 on `agentTools.ts` (same worker or after merge).
- **Owns:** `escalateCall` symbol in `agentTools.ts`; escalation branch in `src/app/api/webhooks/vapi/route.ts`; escalation surfacing in `src/app/company/dashboard/page.tsx` (banner only).
- **Constraints:** Vapi voice reply wording changes require assistant-prompt compatibility — keep reply shape, change content.
- **Edge cases:** Resend down; `RESEND_FROM`/`escalationPhone`/`notificationEmail` unconfigured; duplicate escalation in one call (ledger dedupe).
- **Security:** escalation records carry callId correlation, minimal PII.
- **Acceptance (CIB):** forced provider failure/missing config never yields `escalated:true` or a delivery promise; failed escalation is persisted, visible, retryable, correlated.
- **Tests:** unit with mocked Resend failure/success; webhook branch test. **Rollback:** revert. **Prohibited:** SMS, paging providers, new notification channels.

### T-032 — Cron correctness + callback state machine
- **Objective:** All three cron routes (`follow-up-calls`, `daily-call-summary`, `faq-suggestions`) use `requireCronAuth`; lead docs get explicit callback state at creation (`callbackState: "pending"|"none"`, `callbackDueAt`, consent field); follow-up selection queries due leads only, claims each atomically via T-021, records one attempt, honors calling window/attempt caps; `vercel.json` schedule names/config corrected. **Evidence:** CIB-006 — wrong auth header semantics, eligibility derived from absent flags (`agentTools.ts:203`), non-atomic claiming.
- **Spec:** CIB-006, cross-cutting §1 §2. **Deps:** T-020, T-021. Touches `createLead` in `agentTools.ts` — serialize after T-030/T-031 merges (integration order in TODO).
- **Owns:** `src/app/api/cron/**`, `vercel.json`, `createLead` callback-state initialization in `agentTools.ts`.
- **Constraints:** scheduling `daily-call-summary`/`faq-suggestions` in `vercel.json` is NH-6 (owner decision) — task makes them *secure and correct when invoked*, not necessarily scheduled.
- **Edge cases:** business without `callbackDelayMinutes` (skip, no default surprise calls); lead without consent → never auto-called (consent default false, existing leads = none → NH-9 owner confirms backfill policy); overlapping cron invocations (atomic claim).
- **Security:** 401 before any model/provider call or write.
- **Acceptance (CIB):** production-equivalent invocation (Bearer) returns 200, selects one eligible consented lead in-window, records one attempt, cannot duplicate; missing/invalid secret → 401, zero side effects, all three routes.
- **Tests:** route handler tests for auth + selection + claim race. **Rollback:** revert; lead fields additive. **Prohibited:** changing outbound-call voice content; A2P/SMS.

### T-033 — AI input hardening + provider/model routing
- **Objective:** Adopt T-022 schemas at the trust boundaries: `field-audio` (size/duration caps, content-type check, timeout), `transcribe`, `agent/respond`, DeepSeek parse paths — invalid/low-confidence extractions are flagged for confirmation instead of persisted; centralize provider/model selection in `src/lib/ai/registry.ts` honoring `DEEPSEEK_MODEL` and persisted `backOfficeModel`; remove plausible-mock fallbacks in production (fail explicitly via T-020 config). **Evidence:** CIB-007/CIB-011 — hardcoded `whisper-1`/`gpt-4o`/`deepseek-chat`, ignored config, mock summaries when keys missing.
- **Spec:** CIB-007, CIB-011, cross-cutting §3 §5. **Deps:** T-020, T-022.
- **Owns:** `src/lib/ai/deepseekClient.ts`, `src/lib/ai/registry.ts` (new), `src/app/api/jobs/[jobId]/field-audio/route.ts`, `src/app/api/transcribe/route.ts`, `src/app/api/agent/respond/route.ts`.
- **Constraints:** keep `job.parsed` projection ownership (`src/lib/jobs/projection.ts`) untouched — corrections flow already confirmed good; dev/demo may keep mock **only** when `NODE_ENV!=='production'` and clearly labeled in output.
- **Edge cases (CIB):** malformed nested JSON, prompt injection in transcript, oversized/empty audio, multilingual/noisy input (low-confidence path → confirm card), provider timeout.
- **Security:** every tool/mutation authorized server-side (existing `verifyFieldAccess` retained); no API keys in errors.
- **Acceptance (CIB):** the adversarial list cannot mutate state without valid schema + authorization + confirmation; config tests prove each capability uses intended provider/model; missing prod keys fail readiness, never fabricate output.
- **Tests:** fixture adversarial suite; registry unit tests. **Rollback:** registry is a seam — call sites revert cleanly. **Prohibited:** new providers, prompt redesign, changing correction UX.

### T-034 — Scoped field access tokens
- **Objective:** Replace the stable business-wide `?key=` credential with short-lived scoped grants: keep `fieldKey` as the **mint** secret but exchange it server-side for a signed, expiring token (HttpOnly cookie or header) scoping to the business + optional job; QR links carry a one-time/short-TTL exchange URL; revocation = rotate `fieldKey`; access audited (who/when per T-021-style records). **Evidence:** CIB-008 — `verifyRole.ts:91+` accepts permanent query-string key with full field scope; URLs/referrers leak it.
- **Spec:** CIB-008, cross-cutting §1. **Deps:** T-020. Owns shared auth file — serialize with anything touching `verifyRole.ts` (nothing else does in this plan).
- **Owns:** `src/lib/auth/verifyRole.ts` (`verifyFieldAccess` + new exchange), `src/app/field/page.tsx` (token bootstrap), `src/app/api/field/exchange/route.ts` (new), QR-link construction in `src/app/admin/demo/page.tsx` + `demo-customize` fieldUrl output.
- **Constraints:** printed-QR workflow must survive: QR → exchange → session; unauthenticated crew phones still work; demo-roofing continuity (existing printed QRs may break once — record in log + demo playbook update pointer).
- **Edge cases (CIB):** expired/revoked token fails; job-A token cannot touch job B (when job-scoped); no reusable credential in URL after bootstrap redirect (strip via `history.replaceState` + server redirect).
- **Security:** tokens signed (HMAC w/ server secret via T-020), TTL ≤ 12h, audited.
- **Acceptance (CIB):** expiry/revocation/scope tests pass; referrer/URL inspection shows no reusable business-wide credential post-bootstrap.
- **Tests:** unit for mint/verify/expiry/scope; route tests. **Rollback:** feature-flag fallback to legacy key for one deploy (removed in T-051). **Prohibited:** changing session-role auth paths; new auth providers.

### T-035 — Demo/production isolation guards
- **Objective:** Apply D-2: destructive reset in `demo-customize` (a) hard-refuses any `businessId !== 'demo-roofing'` via an explicit allowlist constant, (b) refuses when the target doc lacks `isDemo: true` marker (added by seed), (c) takes a JSON backup export of deleted collections to `businesses/demo-roofing/backups/{ts}` (or local file on Spark limits) before delete, (d) serializes concurrent resets (transactional lock doc), (e) requires explicit `confirm: "RESET"` body field from the UI. **Evidence:** CIB-009 — `demo-customize/route.ts:70+` deletes calls/leads/appointments/crews/jobs on the live-line tenant.
- **Spec:** CIB-009, cross-cutting §1. **Deps:** T-020. No file overlap with T-034 (different routes) — parallel-safe.
- **Owns:** `src/app/api/admin/demo-customize/route.ts`, `src/lib/verticals/demoSeed.ts` (isDemo marker), `src/app/admin/demo/page.tsx` (confirm field), seed script marker line.
- **Constraints:** demo UX stays one-click-ish (confirm field auto-sent by the Launch button after a visible confirm dialog); webhook activity during reseed must not observe partial state (batch writes / staging then swap where feasible).
- **Edge cases:** reset mid-live-call (lock + brief agent-side "maintenance" config flag); backup write failure aborts reset.
- **Security:** superadmin gate retained; allowlist is code, not config.
- **Acceptance (CIB):** non-demo tenants/environments cannot invoke reset (unit-tested); concurrent webhook sees consistent state; backup exists before every destructive run.
- **Tests:** unit for allowlist/marker/lock/backup-abort. **Rollback:** revert; backups additive. **Prohibited:** building a second environment/project (owner decision NH-5).

---

## Phase 4 — Operator truth, communications, privacy

### T-040 — UI truthfulness + form guards
- **Objective:** Replace silent fetch catches with explicit loading/error/empty states (distinct: "failed to load" ≠ "no data") across the CIB-012 page list; fix invoice save→send sequencing (no stale-state send; one explicit send action after confirmed save); add required-field/format validation (email/phone/client) on invoices/settings/onboarding/config; warn on dirty-form navigation for invoice + onboarding + config forms. **Evidence:** CIB-012 file/line list.
- **Spec:** CIB-012, cross-cutting §4. **Deps:** stable error contracts from T-030/T-032 responses (shape: `{error}` + status codes — already conventional).
- **Owns (split by route group if two workers):** company group: `src/app/company/{dashboard,calls,pipeline,jobs,calendar*,library,settings}/page.tsx` (*calendar error-state only — rollback logic landed in T-030); admin group: `src/app/admin/{businesses,usage,invoices,onboarding}/page.tsx`, `src/app/admin/businesses/[businessId]/config/page.tsx`.
- **Constraints:** use existing design tokens/`.button` variants + `PageSkeleton`; no new toast library — a single small shared error-banner component is allowed **once**, owned by the company-group worker, admin group consumes after merge.
- **Edge cases (CIB):** injected fetch failure renders error state, never empty-success; double-click send; navigation-away with dirty invoice.
- **Security/accessibility:** error banners `role="alert"`; focus management on validation errors; no PII in error text.
- **Acceptance (CIB):** injected failures never render successful empty state; new invoice sends once with one action; invalid email/phone rejected; dirty-form warning fires.
- **Tests:** component tests for one page per pattern + the invoice flow; rest verified by shared helper adoption + manual checklist in log.
- **Rollback:** per-page commits. **Prohibited:** visual redesign, pagination, search (deferred list).

### T-041 — Unified outbound communications
- **Objective:** One comms service (`src/lib/comms/send.ts`) wrapping Resend with: single `RESEND_FROM` (D-4) validated by T-020 config, per-message delivery records (T-021 attempts + provider message ID), typed results surfaced to UIs ("delivery failed" ≠ "no email on file"), safe retry (idempotent per opId). Migrate call sites: `notify.ts`, `agentTools.ts` branded emails, `send-confirmation`, `assign`, report/invoice send routes. **Evidence:** CIB-013 — two sender defaults (`notify.ts:8` vs `agentTools.ts:7`), placeholder fallbacks, no delivery status.
- **Spec:** CIB-013, cross-cutting §2 §4 §5. **Deps:** T-020, T-021; serialize with T-031 (escalation email path) — integrate after.
- **Owns:** `src/lib/comms/**` (new), `src/lib/notify.ts`, email call sites listed above (email-sending lines only).
- **Constraints:** keep BizBranding templates; do not change email copy except sender identity; SPF/DKIM verification is NH-3 — until verified, service must report `unconfigured` in prod rather than sending from unverified domain.
- **Edge cases:** Resend 4xx vs 5xx (terminal vs retryable); duplicate send via double-click (ledger); missing recipient.
- **Security:** no full recipient lists in logs.
- **Acceptance (CIB):** test messages deliver from verified domain (after NH-3) with SPF/DKIM alignment; provider failures shown as delivery failures; retries don't duplicate.
- **Tests:** unit with mocked Resend; one live test post-NH-3 recorded in log. **Rollback:** call sites revert to direct Resend individually. **Prohibited:** template redesign, SMS.

### T-042 — PII retention, deletion, audit integrity
- **Objective:** Repository-enforced retention policy module: configurable retention windows (transcripts, recordings, tool I/O logs), a cron-invoked redaction/deletion job (auth via T-020), immutable audit event types with correlation IDs + provider IDs, corrected mislabelled lookup/cancel logs, and DELETE semantics on `/api/calls/[callId]` matching documented policy (true redaction of transcript/recording refs, retain audit skeleton). **Evidence:** CIB-010 — raw transcripts/recording URLs/tool I/O retained indefinitely; DELETE only marks ended; mislabelled logs at `vapi/route.ts:273,342`, `calls/[callId]/route.ts:114`.
- **Spec:** CIB-010, cross-cutting §4. **Deps:** T-020, T-021; retention window values are NH-4 (legal) — implement with conservative defaults (e.g. 90d) behind config, flagged for owner sign-off.
- **Owns:** `src/lib/audit/**` (new), `src/app/api/cron/retention/route.ts` (new), `src/app/api/calls/[callId]/route.ts` (DELETE), audit-log lines in `vapi/route.ts` (serialize after T-031 merges).
- **Constraints:** never delete financial records (invoices) via retention; audit events append-only.
- **Edge cases:** retention run interrupted mid-batch (resumable, idempotent); call still active.
- **Security:** redaction removes recording URLs + transcript bodies, keeps hashes/lengths for audit.
- **Acceptance (CIB):** retention job deletes/redacts eligible data; audit replay reconstructs who/what/when/result without unnecessary PII; deletion matches documented policy (`docs/RETENTION.md` created here).
- **Tests:** unit for eligibility + idempotent re-run. **Rollback:** job additive; DELETE change revertible. **Prohibited:** external consent/disclosure wording (NH-4), data-subject request tooling.

### T-043 — Owner-facing tenant-creation email
- **Objective:** When a business is created via `POST /api/admin/businesses`, send the new owner (`ownerEmail`)
  one branded `no-reply@luxordev.com` welcome email containing their login email and a working
  `admin.auth().generatePasswordResetLink()` URL — never a plaintext temp password in an email body or log.
  Subject line clearly prefixed for inbox filtering (e.g. `[Luxor AI] Your account is ready`). **Evidence:**
  owner request (2026-07-21 session) — verified today that the POST handler currently returns `tempPassword`
  in the JSON response for the superadmin to relay manually and sends no email at all; also verified **no
  tenant-removal/DELETE endpoint exists yet** for businesses (only create + config PUT) — so a "removal"
  notification has no action to hang off yet; tracked as NH-12, not built speculatively here.
- **Spec:** owner request. **Deps:** T-020 (capability-status gate for Resend/`RESEND_FROM`).
- **Owns:** email-dispatch addition in `src/app/api/admin/businesses/route.ts` (POST only); new template in
  `src/lib/notify.ts` reusing the existing BizBranding HTML shell.
- **Constraints:** reuse the existing brand shell/pattern already in `notify.ts`; if Resend/`RESEND_FROM`
  reports `not_configured` (T-020), the API response must say so explicitly, not silently skip and claim
  success; a send failure must not roll back the Firestore business-creation transaction.
- **Edge cases:** missing/invalid `ownerEmail` (skip send, note it in the response, don't fail creation);
  `generatePasswordResetLink` failure (Firebase project not fully configured) surfaces as a warning, not a
  silent no-op.
- **Security:** no plaintext password anywhere in an email body, log line, or error message.
- **Acceptance:** creating a business with a valid `ownerEmail` and Resend configured sends exactly one email
  containing a working password-reset link; capability-not-configured and missing-owner-email paths are both
  explicit in the API response, never silently "successful".
- **Tests:** unit with mocked Resend + mocked `generatePasswordResetLink`. **Rollback:** additive, single call
  site. **Prohibited:** building a tenant-removal/DELETE endpoint (that's a new destructive capability, not an
  email addition — needs its own owner-scoped task if wanted, see NH-12).

### T-044 — Self-serve feedback form → connect@luxordev.com
- **Objective:** A "Send Feedback" entry point (discoverable from company + admin nav, lucide `MessageSquareText`
  icon) opens a small form (message + optional category; name/email prefilled from the signed-in session) that
  sends one branded email to `connect@luxordev.com` with a subject clearly prefixed for inbox triage (e.g.
  `[Feedback] <businessName> — <first ~40 chars of message>`) and the submitter's name/email/businessId in the
  body so support can reply directly. **Evidence:** owner request (2026-07-21 session) — verified today no
  "feedback" feature exists anywhere in `src/`.
- **Spec:** owner request. **Deps:** T-020 (capability gate). No dependency on T-041 — ships now via the same
  direct-Resend pattern `notify.ts` already uses; migrate the call site onto `src/lib/comms/send.ts` when T-041
  lands (note left in code + `docs/IMPLEMENTATION_LOG.md`, not blocking).
- **Owns:** new `src/app/api/feedback/route.ts`; a small shared `FeedbackForm` component + nav entry point
  (company nav + admin nav); new send function in `src/lib/notify.ts`.
- **Constraints:** authenticated users only (reuse existing session/role guard pattern — no anonymous public
  endpoint); rate-limit or single-submit-disable the button to avoid double-send on double-click.
- **Edge cases:** Resend not configured → form shows a clear "feedback couldn't be sent" error, never a false
  success toast; empty message rejected client- and server-side.
- **Security:** no unauthenticated write surface; message body length-capped; no PII beyond name/email/businessId
  in the email.
- **Acceptance:** submitting the form from a signed-in company or admin session delivers one email to
  `connect@luxordev.com` with submitter contact info and a triage-friendly subject; failure path never reports
  success.
- **Tests:** unit with mocked Resend; component test for the form's submit/disable/error states.
- **Rollback:** additive, single new route + component. **Prohibited:** a public/unauthenticated feedback
  endpoint; a general-purpose support-ticket system.

### T-045 — Icon consistency sweep (lucide-react)
- **Objective:** Audit every page under `src/app/company/**` and `src/app/admin/**` (25 files; only 9 currently
  import `lucide-react`) and bring icon usage to one consistent language — add `lucide-react` icons wherever a
  nav row, button, or section header is missing one or uses something else, matching the pattern already
  established in `src/app/company/guide/page.tsx` and `company-nav.tsx`. **Evidence:** owner request (2026-07-21
  session) — verified today: no emoji-as-icon or `react-icons`/`heroicons` usage found (so this is a coverage
  gap, not a mixed-library cleanup), 16 of 25 pages import zero `lucide-react` icons today.
- **Spec:** owner request, extends CLAUDE.md's "one teal design system" rule to icons. **Deps:** none (pure
  frontend, additive-only import changes).
- **Owns:** icon imports/usages inside existing company/admin page files only — no new components, no layout
  changes beyond adding an `<Icon />` where one is visibly missing.
- **Constraints:** no visual redesign, no new icon set, no changing existing icon choices that are already
  `lucide-react` — this is a coverage pass, not a restyle. Follow `CompanyModule`/`useBusinessModules()` vocab
  rules for any icon tied to industry-specific nouns.
- **Edge cases:** none (low-risk, additive UI change) — but must not touch files owned by an in-flight task
  (check TODO.md's owned-scope column before editing any page another batch is mid-edit on).
- **Acceptance:** every company/admin page's primary actions/nav rows/section headers use a `lucide-react` icon;
  `npm run build` unaffected; no visual regression in existing lucide usages (spot-check via Playwright
  screenshot of 2–3 representative pages before/after).
- **Tests:** existing gates (type-check/lint/build); no new unit tests required for icon-only changes.
- **Rollback:** trivial per-file revert. **Prohibited:** redesign, new dependencies, touching non-icon markup.

---

## Phase 5 — Release engineering + cleanup

### T-050 — Deterministic release suite + merge gating
- **Objective:** Small e2e suite (route-handler level, deterministic, mocked providers) covering P0/P1 acceptance: webhook auth/replay, cron auth, duplicate side effects, calendar failure rollback, provider-key readiness; wire into CI as required; document branch-protection setup for owner (NH-7). **Evidence:** CIB-015.
- **Spec:** CIB-015. **Deps:** all Phase 1–4 merges. **Owns:** `tests/release/**`, `.github/workflows/ci.yml` (extend).
- **Constraints:** no live providers in CI. **Edge cases:** flaky-test quarantine policy documented. **Security:** n/a.
- **Acceptance (CIB):** PR runs green required checks covering the listed scenarios. **Tests:** is the tests. **Rollback:** n/a. **Prohibited:** browser-automation e2e farm (post-MVP).

### T-051 — Evidence-driven cleanup sweep
- **Objective:** The owner-requested clean sweep, per CIB cross-cutting §6: remove dead imports, unreachable branches, obsolete components, duplicate helpers, unused env declarations, stale comments, superseded routes, redundant notification implementations, and the T-034 legacy-key fallback; prove each removal via grep/tsc/lint/build/tests; log every removal + rationale in `docs/IMPLEMENTATION_LOG.md`. **Evidence:** CIB §6; prior sweep (2026-07-15) already removed ~230 lines — this is the post-fix pass.
- **Spec:** cross-cutting §6. **Deps:** Phases 1–4 merged + T-050 green (tests protect behavior first — this ordering is deliberate; do not front-run it).
- **Owns:** repo-wide, single worker, small commits per removal cluster.
- **Constraints:** keep types describing live collections (`CallSession`, `UserBusinessMembership`, `SuperadminProfile` rule from HANDOFF §8); no speculative refactors; keep compatibility code lacking migration evidence.
- **Edge cases:** dynamic imports/string route references (grep both). **Security:** removals cannot touch auth guards without dedicated review.
- **Acceptance:** tsc/lint/build/tests green after each commit; log complete. **Tests:** existing gates. **Rollback:** per-commit reverts. **Prohibited:** behavior changes of any kind.

### T-052 — Documentation reconciliation
- **Objective:** Update `CLAUDE.md`, `HANDOFF.md`, `.env.example`, `public/guides/onboarding-guide.html` (per its update rule), and `docs/SESSION_HANDOFF.md` to reflect shipped state; mark superseded claims (e.g. "VAPI_AUTH_BYPASS permanently correct" — superseded by T-010) without deleting history; refresh graphify (`/graphify . --update`).
- **Spec:** CIB planning-engineer instruction §3. **Deps:** Phase 5 others. **Owns:** docs only.
- **Acceptance:** no doc instructs a practice a merged task removed. **Prohibited:** code.

---

## Phase 6 — UX & Demo Polish (queued; starts only after Phase 5 is fully merged)

**Not CIB-derived — owner-requested 2026-07-23.** Lower task numbers than Phase 5 (T-046–049 vs T-050–052) are
an artifact of sequential ID assignment, **not** execution order — see Integration order below. Owner explicitly
chose "finish security/compliance backlog first" over parallelizing this with Phase 4/5; do not start any of
these four before T-050/051/052 are merged. Two owner asks were explicitly decided **against** scoping here:
public self-serve signup/trial/billing (concierge onboarding stays; see T-047) and tenant deactivation/removal
(NH-12 stays unbuilt for now — no email-on-removal task without the removal capability itself).

### T-046 — Demo Studio richness + parity audit
- **Objective:** Make every vertical's seeded demo read as "a business in full swing," and prove the demo never
  structurally diverges from the live app. Reseed each vertical with ~5–6 resources and ~12–18 jobs/bookings
  (up from today's 3/3), mixed states (confirmed solid, provisional grey-dashed, 2–3 left unscheduled/unassigned
  to drag live), real per-industry names (not filler — Roofing: Carlos/Tyler/Storm Response; HVAC: named techs +
  on-call; Dental: 2–3 dentists + hygienists; etc., per HANDOFF's existing per-vertical list), and a click-through
  audit confirming `/admin/demo`'s launch leads into the exact same `/company/*`/`/admin/*` pages a real tenant
  uses — no demo-only mock component anywhere. **Evidence:** `HANDOFF.md`'s own 2026-07-15 backlog entry
  ("Demo data should look like a business in full swing, not a startup... 1-crew/3-job board showcases nothing")
  was never turned into a task; confirmed via code read that `/admin/demo` (`src/app/admin/demo/page.tsx`) is a
  launcher/config panel only — the demo *is* the real app for tenant `demo-roofing` — so parity is structurally
  sound today and the actual gap is seed richness, not architecture.
- **Spec:** HANDOFF.md 2026-07-15 Backlog section (richness spec already written there) + owner request
  2026-07-23 (parity audit). **Deps:** none — touches only demo seed data, not `agentTools.ts` or any Phase 1–5
  file.
- **Owns:** `src/lib/verticals/demoSeed.ts` (`RESOURCES` + jobs/appointments builders only); a throwaway
  (not committed) per-vertical verification script.
- **Constraints:** don't change `calendarMode`/`vocab`/`disabledModules` semantics (protected, `templates.ts`
  untouched); keep `jobCounter` advancing past seeded IDs (re-verify the 2026-07-15 collision fix still holds
  at higher volume); stay within one Firestore batch write per launch (Spark-plan budget — HANDOFF already
  confirmed ~18×7 verticals is trivial).
- **Edge/failure cases:** at least one after-hours `pendingConfirmation` booking with an email must survive
  richer seeding (Dashboard approval demo depends on it); mixed job-status stepper values (inspection/quoted/
  in_progress/invoiced) so Jobs + Dashboard don't read as one flat list.
- **Security/accessibility:** n/a — demo data only, no new endpoints or auth changes.
- **Acceptance:** each of the 7 verticals reseeds via Demo Studio Launch with the target volume/mix above;
  Playwright walk-through of 3 representative verticals (Dashboard/Calls/Pipeline/Jobs/Calendar/Library/Guide)
  shows no placeholder/broken/default-empty screen; component-tree spot-check confirms demo-mode pages are the
  identical components a directly-created tenant renders (not just visually similar).
- **Tests:** throwaway per-vertical seed script (rows > 0, draggable > 0, states varied — same method as the
  2026-07-15 session); Playwright smoke pass across 3 verticals recorded in `docs/IMPLEMENTATION_LOG.md`.
- **Rollback:** additive data changes only; revert the `demoSeed.ts` commit.
- **Prohibited scope:** no new features; no separate demo environment/project (D-2 default already decided,
  NH-5); no visual redesign.

### T-047 — Navigation/workflow friction pass + surfaced tutorial
- **Objective:** Audit click-path friction across roles (owner/staff/superadmin/field-worker) for the most
  common actions (create job, schedule, send invoice, add crew, view call); surface the existing `/company/guide`
  tutorial to brand-new users instead of leaving it undiscovered in the nav; convert the admin onboarding wizard
  into a real stepper (progress indicator, back/next, no orphaned steps) — **polishing the existing
  admin-driven flow, not building public self-serve signup** (owner decision 2026-07-23: concierge onboarding
  stays; no public landing/trial/billing flow). **Evidence:** no task audits nav friction today; `/company/guide`
  (`src/app/company/guide/page.tsx`) already contains a solid industry-aware how-to but nothing nudges a
  first-time user toward it; the onboarding-wizard-to-stepper item has been open on HANDOFF's backlog since
  2026-06-28 and never scheduled.
- **Spec:** owner request 2026-07-23, extends HANDOFF backlog "onboarding wizard → real stepper."
- **Deps:** none structurally; sequenced after Phase 5 per owner decision, so no worktree overlap risk with
  T-040/044/045 in practice (those will already be merged).
- **Owns:** `src/app/company/layout.tsx` (nav), `src/app/company/company-nav.tsx`, `src/app/admin/onboarding/page.tsx`
  (stepper conversion), a new small first-login nudge component linking to `/company/guide`.
- **Constraints:** no visual redesign beyond nav/stepper ergonomics (one-teal design system, `.button` variants);
  `useBusinessModules()`/Industry-Applicability Rule stays the source of truth for nav — do not touch
  `MODULE_ROUTES` gating logic itself, only ergonomics around it; onboarding wizard keeps its existing submit
  payload/contract — no backend change.
- **Edge/failure cases:** mobile hamburger nav (audit it too, don't just add to desktop); a returning user must
  not see the first-login nudge again (session/localStorage-dismissed); wizard-to-stepper conversion must not
  silently drop a step.
- **Security/accessibility:** nav stays role-gated exactly as today; stepper must be keyboard-navigable; must not
  regress T-040's truthful loading/error states.
- **Acceptance:** documented click-count audit for the 5 flows above, before/after; new company users see a
  one-time "start here" nudge pointing at Guide; onboarding wizard reads as a real stepper with an unchanged
  data contract.
- **Tests:** Playwright click-path recording for 2–3 representative flows before/after; existing gates
  (type-check/lint/build).
- **Rollback:** per-file revert; nudge component is additive/removable.
- **Prohibited scope:** public self-serve signup, trial provisioning, or billing of any kind (explicitly decided
  against this session); no backend contract changes to the onboarding POST route.

### T-048 — Voice-note field resilience + AI model right-sizing
- **Objective:** `useFieldAudio.ts` drops the recorded audio blob on any fetch failure with no retry, forcing a
  field worker to redo the entire spoken note on a transient network blip — undercutting the "clinical," zero-
  friction field capture that is the app's stated core differentiator. Add one bounded automatic retry (same
  blob, one re-POST) before surfacing an honest error — **not** a persistent offline queue, which stays
  explicitly deferred (`TODO.md` Deferred list). Separately: `registry.ts`'s `parse-field-update` capability is
  still routed to full `gpt-4o` while every other back-office capability was already right-sized to
  `gpt-4o-mini`/`deepseek-chat` in T-033 — right-size it only if a fixture-driven accuracy comparison shows no
  regression. **Evidence:** `src/hooks/useFieldAudio.ts:158-164` — catch block sets `status:"error"` with no
  retry path, blob is not retained; `src/lib/ai/registry.ts:61` — `"parse-field-update": { provider: "openai",
  model: "gpt-4o" }`, the one unreviewed holdout from T-033's otherwise-complete model-routing pass.
- **Spec:** owner request 2026-07-23 ("the real heart of the app"; AI model right-sizing).
- **Deps:** T-022 (schemas), T-033 (registry) — both already merged.
- **Owns:** `src/hooks/useFieldAudio.ts` (retry logic only), `src/lib/ai/registry.ts` (the single
  `parse-field-update` model line), new fixture-driven accuracy-comparison tests.
- **Constraints:** retry is in-memory/same-session only (no retry across a page reload — that is the deferred
  offline-queue problem); model swap must ship with a before/after accuracy comparison against
  `src/lib/schemas/__tests__/fixtures/adversarial.ts` plus real (anonymized) field-note transcripts, never a
  blind flip; the correction-confirm-card UX and Whisper vocabulary-bias prompt are protected/working — do not
  touch them.
- **Edge/failure cases:** the retry itself fails (surface an honest error once, don't loop silently); app
  backgrounded/reloaded mid-retry (out of scope — do not attempt to solve this, it's the offline-queue problem).
- **Security/accessibility:** no new attack surface (same authenticated/`fieldKey`-gated endpoint); error states
  stay screen-reader-visible per T-040's `role="alert"` pattern.
- **Acceptance:** a simulated network failure during field-audio upload retries once automatically before
  surfacing an error; the model change (if the fixture comparison shows no accuracy regression) ships with
  before/after cost + accuracy numbers logged in `docs/IMPLEMENTATION_LOG.md` — if it *does* regress, the model
  stays on `gpt-4o` and that's a documented finding, not a blocker.
- **Tests:** unit test for the retry path (mocked fetch: fail-then-succeed, fail-then-fail); fixture comparison
  script output recorded in the log.
- **Rollback:** retry logic and model change are two independent, separately revertible commits.
- **Prohibited scope:** offline queue, multi-language toggle, audio-level/waveform visualization, redesigning
  the mic UI.

### T-049 — Outbound email consistency + branding pass
- **Objective:** Standardize outbound email subject lines and system-vs-tenant branding onto one documented
  convention. **Evidence (confirmed by reading every call site):** `src/lib/notify.ts:61` `"New assignment: X —
  Y"` vs `:83` `"Appointment confirmed — Y"` vs `src/app/api/appointments/send-confirmation/route.ts:70`
  `"Appointment Confirmed — X · Y"` (capitalization differs between two near-duplicate emails);
  `src/app/api/admin/invoices/[invoiceId]/send/route.ts:101` `"Invoice X from Luxor AI"` vs
  `src/app/api/jobs/[jobId]/invoice/send/route.ts:165` `"Draft Invoice #X from {bizName}"` — no shared
  inbox-triage prefix, unlike the `[Category] ...` convention T-043/T-044 already establish. Tenant-facing
  templates already correctly use the tenant's own `logoUrl` (`agentTools.ts:853-859`) — that part is right and
  must not change; only Luxor-authored system emails (welcome, feedback) should carry the Luxor mark.
- **Spec:** owner request 2026-07-23 ("titled such that organizing inbox is easy"), extends T-041's unified
  comms service and the `[Category]` convention T-043/T-044 already use.
- **Deps:** T-041 (`src/lib/comms/send.ts`), T-043, T-044 — all merged; this task extends their convention, does
  not invent a new one.
- **Owns:** subject-line strings only in `src/lib/notify.ts`, `src/app/api/appointments/send-confirmation/route.ts`,
  `src/app/api/admin/invoices/[invoiceId]/send/route.ts`, `src/app/api/jobs/[jobId]/{invoice,report}/send/route.ts`.
- **Constraints:** tenant-facing emails keep the tenant's own branding/logo (protected, already correct) — only
  Luxor-system-email subject/logo conventions change; no email body/template redesign beyond the subject line;
  no send-logic changes (T-041's delivery-status contract untouched).
- **Edge/failure cases:** n/a — string-only change on top of an already-tested delivery path.
- **Security/accessibility:** n/a.
- **Acceptance:** every outbound email subject follows one documented convention (`[Category] Specific detail`,
  consistent capitalization/dash style), recorded in a short new `docs/EMAIL-CONVENTIONS.md`; spot-check of all
  6+ call sites confirms compliance.
- **Tests:** extend T-041's existing mocked-Resend unit tests with subject-format assertions per call site — do
  not rewrite them.
- **Rollback:** trivial per-string revert.
- **Prohibited scope:** template HTML redesign, new email types, SMS.

---

## Phase 7 — Quality of Life & Multi-Vertical Expansion (owner-added 2026-08-27)

**Not CIB-derived — owner requested an identify-only QoL/expansion audit 2026-08-27; findings published as an
Artifact (see `docs/SESSION_HANDOFF.md` for the pointer) and turned into the eight tasks below.** No task in
this phase has been started or assigned to a worker. **Queued — awaiting owner prioritization before any task
begins**, same posture Phase 6 held before 2026-07-23. Where a task's spec below intentionally stops short of a
final design decision (e.g. T-056's palette set), that is deliberate — confirm with the owner before
implementation starts, don't invent the missing decision.

### T-053 — Retire or wire the dead `agentVoice` field
- **Objective:** Either delete the `agentVoice` UI (two forms currently claim to set the caller-facing voice) or
  make it real by pushing the value to the Vapi assistant via the Vapi API on save — pick one; do not leave it
  half-functional. **Evidence:** full-repo grep shows `agentVoice` written by `admin/onboarding/page.tsx:163` and
  `admin/businesses/[businessId]/config/page.tsx:204,467-473` (two different, mutually inconsistent option sets —
  one an old Twilio `<Say>` voice-name dropdown, one a freeform field suggesting non-Vapi voice IDs), persisted
  via `api/admin/businesses/route.ts:212` and `api/admin/businesses/[businessId]/config/route.ts:147`, and read
  by **nothing downstream** — not `api/webhooks/vapi/route.ts`, not `src/lib/ai/agentPromptBuilder.ts`, not
  `src/lib/vapi/vapiClient.ts`. The real voice (Cartesia, set directly in the Vapi dashboard) is fully
  disconnected from this control.
- **Spec:** 2026-08-27 QoL audit §05.2. **Deps:** none.
- **Owns:** the voice field in `admin/onboarding/page.tsx` and `admin/businesses/[businessId]/config/page.tsx`;
  `src/types/index.ts`'s `agentVoice` field (if removed); the two API routes that persist it.
- **Constraints:** decide remove-vs-wire before implementation starts; if wiring, a Vapi API failure on save must
  not block saving the rest of the business config; if removing, existing stale Firestore values are harmless
  and need no migration.
- **Edge/failure cases:** existing businesses with a stale `agentVoice` value must not error on load either way.
- **Security/accessibility:** n/a.
- **Acceptance:** no control on this platform implies a change it cannot make — either editing the field actually
  changes the caller-facing voice, or the field is gone.
- **Tests:** unit test proving the chosen behavior (API-call assertion, or absence-of-field assertion).
- **Rollback:** single revertible commit either direction.
- **Prohibited scope:** full in-app Vapi provisioning (T-054); no visual redesign beyond the voice field itself.

### T-054 — In-app Vapi provisioning (assistant + number, incl. Canadian import)
- **Objective:** Replace the hand-copy-paste `vapiAssistantId`/`vapiPhoneNumberId` workflow with real Vapi API
  calls: create/clone an assistant for a new tenant, and buy or import a phone number — including the Canadian
  bring-your-own-number path (buy from Twilio or Telnyx, import into Vapi) alongside the existing US flow.
  **Evidence:** `src/lib/vapi/vapiClient.ts` wraps exactly one Vapi endpoint (outbound `POST /call`);
  `admin/onboarding/page.tsx:490-511` and `admin/businesses/[businessId]/config/page.tsx:369-387` are raw text
  inputs with no API call behind them — Vapi's own free number provisioning is US-only by area code (per Vapi
  docs), so a Canadian number requires this same import mechanism regardless.
- **Spec:** 2026-08-27 QoL audit §02 + §05.1. **Deps:** T-053 (land the voice-field decision first so this new
  provisioning UI doesn't carry the dead control forward).
- **Owns:** `src/lib/vapi/vapiClient.ts` (new assistant/number endpoints), a new server route (e.g.
  `src/app/api/admin/businesses/[businessId]/vapi/route.ts`), a button-driven provisioning panel in onboarding +
  config pages (existing text inputs stay as a manual-override fallback).
- **Constraints:** never rotate/overwrite the live `demo-roofing` assistant from this flow; reuse the existing
  `VAPI_API_KEY`, no new secret-storage pattern; Canadian import needs a Twilio/Telnyx credential the owner
  supplies per purchase — build the import call, not a Twilio/Telnyx account-management UI.
- **Edge/failure cases:** a mid-provisioning Vapi API failure must leave the business record clearly
  "not provisioned," never half-written; today's manually-entered IDs must keep working unchanged (additive, not
  a breaking migration).
- **Security/accessibility:** superadmin-only (existing `verifySuperadmin()` gate); provisioning calls must never
  leak the Vapi API key to the client.
- **Acceptance:** a new tenant can get a working Vapi assistant + number (US or Canadian) from the onboarding
  wizard without a manual dashboard round-trip.
- **Tests:** mocked-Vapi-API unit tests for create/import success and failure paths.
- **Rollback:** additive — manual ID fields stay as fallback; revert the new route/button if needed.
- **Prohibited scope:** assistant prompt/voice design changes (`buildAgentPrompt` stays config-driven, unchanged);
  no Twilio/Telnyx account-management UI.

### T-055 — Split demo/onboarding into a dedicated hub
- **Objective:** Move Demo Studio, the onboarding wizard, and the Playbooks/Guide out of the superadmin
  `/admin/*` shell into their own route group with a dedicated nav shell, reachable from its own domain (e.g.
  `hub.luxordev.com`) on the same Vercel deployment. Usage, invoices, businesses list, and platform settings stay
  in `/admin`. **Evidence:** all three currently share `verifySuperadmin()` + `admin-nav.tsx` with internal
  platform-ops tooling; `src/middleware.ts` is 24 lines gating purely by path prefix against one cookie.
- **Spec:** 2026-08-27 QoL audit §03. **Deps:** none.
- **Owns:** new route group (e.g. `src/app/hub/*`, migrated from `src/app/admin/{demo,onboarding}` and the guide),
  `src/middleware.ts` (new prefix), a new hub nav shell distinct from `admin-nav.tsx`; Vercel domain attachment is
  an owner action, not code.
- **Constraints:** keep the same auth gate — re-route/re-skin only, not an auth redesign; every old deep link
  (`/admin/demo`, `/admin/onboarding`) must redirect, not 404; no functional change to Demo Studio/onboarding
  itself in this task.
- **Edge/failure cases:** a bookmarked pre-move URL; the hub's own favicon/branding is in scope here, not invented
  ad hoc elsewhere.
- **Security/accessibility:** unchanged from today's superadmin gate.
- **Acceptance:** Demo Studio + onboarding are reachable at a dedicated hub URL with hub-only nav chrome (no
  admin usage/invoices sidebar visible); old `/admin/*` URLs redirect there.
- **Tests:** route test confirming moved pages 200 at the new path and redirect from the old one; middleware test
  for the new prefix.
- **Rollback:** mechanical — revert the file moves + middleware line.
- **Prohibited scope:** visual redesign of Demo Studio/onboarding beyond nav chrome (see T-056); no new auth
  system.

### T-056 — Per-industry visual families in the company portal
- **Objective:** Give `useBusinessModules()` a visual "family" token (grouping the 10 verticals into a small
  number of families — field/dispatch, care/intake, ops/escalation) and thread it into a CSS custom property at
  the company layout root, so a tenant's portal reflects its family, not one fixed teal for every industry.
  **Evidence:** each vertical template already carries `icon`/`color`, but they render only in the admin Demo
  Studio card grid (`admin/demo/page.tsx`) — inside `/company/*`, every industry renders in the same
  `var(--accent)` teal; `brandColor` only reaches outbound emails (`notify.ts`'s `shell()`) and one accent on the
  job-detail page.
- **Spec:** 2026-08-27 QoL audit §04. **Deps:** none.
- **Owns:** `src/lib/verticals/templates.ts` (add a `family` field per template — additive only, does not touch
  `disabledModules`/`calendarMode`/vocab semantics), `src/hooks/useBusinessModules.ts` (expose `family`),
  `src/app/company/layout.tsx` (apply the family's CSS custom property at the root).
- **Constraints:** **the one-teal design-system rule (CLAUDE.md/AGENTS.md protected context) is about not
  reintroducing arbitrary per-page inline colors — this task is a small, deliberate, reviewed family-palette set,
  not a reversal of that rule.** Confirm the final palette values with the owner before implementation; the
  artifact's 3-family grouping (field/dispatch · care/intake · ops/escalation) is a proposed starting point, not
  a final palette. Universal tabs/modules stay universal — this changes color/texture only, never what's shown.
- **Edge/failure cases:** unknown/missing `industry` must fail open to the current default teal, matching
  `useBusinessModules()`'s existing fail-open behavior.
- **Security/accessibility:** every family palette must independently clear the same contrast bar the current
  teal system does.
- **Acceptance:** two tenants in different families visibly differ in portal accent/texture on the same page; an
  unrecognized/legacy tenant renders exactly as today.
- **Tests:** contrast test per family palette; `useBusinessModules()` unit test for the new field.
- **Rollback:** additive CSS custom property + one new template field; revert cleanly.
- **Prohibited scope:** full portal redesign; changing `disabledModules`/`calendarMode` semantics; changing the
  admin Demo Studio's existing per-vertical `color` field.
- **NEEDS-HUMAN (2026-09-01):** owner is collecting reference apps for visual direction (top field-service/
  organizing apps, roofing-specific apps) to paste into chat before the family palettes are drafted — don't start
  the palette pass until those references land.

### T-057 — Post-sale client talk-track content
- **Objective:** Extend `public/guides/onboarding-guide.html` with a post-sale playbook — what to say handing
  over a client's login, setting after-hours-behavior expectations before their first real after-hours call,
  explaining the ROI/pricing story, and what to say if a call goes wrong — and extend the full click-by-click
  demo walkthrough (today written in depth only for roofing) to the other 9 verticals.
- **Spec:** 2026-08-27 QoL audit §05.3. **Deps:** none — content only, no code paths.
- **Owns:** `public/guides/onboarding-guide.html` only.
- **Constraints:** content/copy work, no functional change; keep the existing "presenter notes hidden by default"
  pattern for anything client-facing during a live demo.
- **Edge/failure cases:** n/a. **Security/accessibility:** n/a.
- **Acceptance:** every vertical has a full click-by-click demo section, not just a one-line pitch script; a new
  "After the sale" section covers login handoff, after-hours expectations, ROI talk, and what to say when a call
  goes wrong.
- **Tests:** manual read-through, rendered in a browser (existing guide-update convention).
- **Rollback:** single-file content revert.
- **Prohibited scope:** no code changes; no new guide infrastructure.

### T-058 — AI-authored document layer + server-side PDF generation
- **Objective:** Add an optional, human-reviewed AI-authored prose summary on top of the already-trusted
  structured job data (`job.parsed`) — never replacing the deterministic report — and add real server-side PDF
  generation so reports/invoices can be emailed as a polished document instead of relying on the browser's print
  dialog. **Evidence:** `jobs/[jobId]/report/route.ts` is deterministic templating over AI-*extracted* data, no
  AI-authored prose exists anywhere; `package.json` carries no PDF library — "PDF" today means an
  `@media print` stylesheet and the browser's own Print dialog.
- **Spec:** 2026-08-27 QoL audit §06. **Deps:** none functionally (soft-sequence after T-053/T-054 so the UI
  patterns it echoes are settled first).
- **Owns:** a new AI-summary endpoint (e.g. `src/app/api/jobs/[jobId]/summary/route.ts`), a new PDF-generation
  module (library TBD — evaluate a lightweight server-safe option before adding a dependency), the report/invoice
  send UI (offer the AI summary as a reviewable addition only).
- **Constraints:** **the existing extraction/authoring split is protected** — the AI summary is additive and must
  be human-reviewed before send, same manual-send-gate principle as today's reports/invoices; the deterministic
  report stays the source of truth; the LLM never does arithmetic (existing rule, unchanged).
- **Edge/failure cases:** AI-summary failure must not block sending the existing deterministic report;
  PDF-generation failure must fall back to the existing print-to-PDF path, not hard-fail the send.
- **Security/accessibility:** AI summary endpoint gated the same as existing report generation
  (`verifyAuthAndRole`, owner/staff/superadmin).
- **Acceptance:** a report/invoice can be generated as a real server-side PDF and emailed directly; an optional
  AI-written summary paragraph is available, editable, never auto-sent without review.
- **Tests:** mocked-AI unit tests for the summary endpoint; a PDF-generation smoke test.
- **Rollback:** both pieces are additive endpoints/UI; revert independently.
- **Prohibited scope:** replacing deterministic report/invoice generation; changing `job.parsed`/`projection.ts`.

### T-059 — Cleanup: Twilio type debris + archive stale planning docs
- **Objective:** Remove `twilioPhoneNumber`, `twilioConfigured`, and the `"twilio"` union member from
  `src/types/index.ts` (always false/unused now that Vapi fully superseded Twilio); move
  `docs/DEMO-STUDIO-PLAN.md`, `docs/EPIC-PLAN.md`, and `docs/PERFORMANCE-CLEANUP.md` to `docs/archive/` once
  confirmed superseded; trim `CLAUDE.md`'s status header to a pointer at the canonical docs.
- **Spec:** 2026-08-27 QoL audit §07. **Deps:** none.
- **Owns:** `src/types/index.ts` (the three fields/members), the two API routes hardcoding
  `twilioConfigured: false` (`api/admin/businesses/route.ts`, `api/admin/businesses/[businessId]/config/route.ts`),
  the three docs (move only), `CLAUDE.md` (header trim only).
- **Constraints:** follow AGENTS.md's cleanup rule — repo-wide grep before removal, `tsc`/lint/build/tests green
  after; never remove a type describing a live Firestore collection (these three don't); archive via `git mv`,
  not delete, to preserve history.
- **Edge/failure cases:** confirm no dynamic/string reference to the removed fields before deleting (grep, not
  just `tsc`).
- **Security/accessibility:** n/a.
- **Acceptance:** `tsc`/lint/build/tests green after removal; `docs/` no longer has a plan doc that reads as
  current but isn't; `CLAUDE.md`'s header is a short pointer, not a competing status narrative.
- **Tests:** existing gates only — this is a cleanup task per AGENTS.md, not new functionality.
- **Rollback:** trivial per-file revert; archived docs can be moved back.
- **Prohibited scope:** no functional changes; do not touch `MASTER_PLAN.md`/`TODO.md`/`HANDOFF.md`/
  `docs/SESSION_HANDOFF.md` (current, not stale).

### T-060 — Voice-model A/B evaluation (Vapi Voices v2 / GPT Realtime vs current stack)
- **Objective:** Run one real call script on Vapi's native "Voices v2" and one on OpenAI's GPT Realtime, side by
  side against the current Cartesia + GPT-4o-mini + Deepgram nova-3 stack, and record latency/cost/quality
  findings before any live-line change. **Evidence:** both are now available directly in the Vapi dashboard per
  Vapi's own docs/blog (see the audit artifact's §01 sources); current stack is ~$0.09/min, ~840ms per
  `HANDOFF.md`.
- **Spec:** 2026-08-27 QoL audit §01. **Deps:** none — dashboard-side evaluation, not a code task.
- **Owns:** no source files; if it proceeds, log findings in `docs/IMPLEMENTATION_LOG.md` or a new
  `docs/VOICE-EVALUATION.md`.
- **Constraints:** must not touch the live `demo-roofing` assistant configuration without a documented
  before/after and an easy revert; natural to pair with NH-1 (Vapi dashboard review) since both need dashboard
  access.
- **Edge/failure cases:** n/a. **Security/accessibility:** n/a.
- **Acceptance:** a short written comparison (latency, cost/min, subjective quality on the same script) exists
  for all three options; a recommendation is made, not necessarily executed.
- **Tests:** n/a. **Rollback:** n/a (no code change).
- **Prohibited scope:** switching the live demo line's voice without owner sign-off; no code changes.

## Phase 8 — Hardening, Performance & Discoverability (owner-added 2026-09-01)

**Not CIB-derived — prompted by this session's Vapi webhook secret incident (found only by manually running
`vercel logs` after a bug report; nothing automated caught a 100%-failure outage), an owner request for
tooltip/hover guidance, and an owner request to make every screen load with no perceptible lag. Queued —
awaiting owner prioritization before any task begins**, same posture Phase 6/7 held before starting.

**Suggested execution order** (not a hard dependency chain — flagging where independent quick wins should go
first): T-064 (secrets hygiene) and T-061 (CSP + font self-hosting) are small, independent, low-risk — do these
anytime. T-067–T-069 (the performance trio) are what the owner asked for most recently and have no
dependencies on each other. T-063 (rate limiting) and T-065 (webhook alerting) are independent. T-062
(dependency vulnerabilities + CI gate) is the biggest/riskiest — land it after the smaller wins so its new CI
step is already in place to catch regressions from everything else. T-066 (tooltips) naturally lands last, or
interleaved with T-054/T-056 if those Phase 7 tasks ship first, so their new icon-only controls get tooltips
from day one instead of a second pass.

### T-061 — Enforce Content-Security-Policy + self-host fonts (security *and* a real load-speed win)
- **Objective:** Ship `Content-Security-Policy` as an enforced header once its current violations are resolved,
  instead of `Content-Security-Policy-Report-Only` — and fix the violation by switching Inter to
  `next/font/google` (self-hosted, same-origin at build time) instead of a `fonts.googleapis.com` `<link>`. This
  is a two-for-one: it closes the CSP gap *and* removes an external, render-blocking font request from every
  page's critical path — folded into one task instead of two so the font migration isn't done twice.
  **Evidence:** `next.config.ts` ships the policy as Report-Only; a live browser check this session showed real
  violations against it — Google Fonts' stylesheet (`style-src`) and font files (`font-src`) both violate the
  `'self'`-only policy on `/login` today, currently only logged, never blocked, and that same external request
  is on the loading path of every single page.
- **Spec:** this session's audit, 2026-09-01. **Deps:** none.
- **Owns:** `next.config.ts` (the header); the Inter font-loading strategy (switch to `next/font/google`, which
  self-hosts and serves same-origin, rather than a `fonts.googleapis.com` `<link>`).
- **Constraints:** must not break the Inter typeface without an equivalent same-origin fallback; do not widen
  `unsafe-inline`/`unsafe-eval` to work around a violation — fix the source, or leave that specific tightening as
  a separate follow-up rather than blocking this task.
- **Edge/failure cases:** any future third-party embed must be explicitly allowlisted, not silently broken by an
  enforced policy with no visible error.
- **Security:** this is the point of the task — meaningfully reduces XSS blast radius platform-wide.
- **Acceptance:** CSP ships without `-Report-Only`; zero CSP violations in the browser console across a spot
  check of `/login`, `/company/dashboard`, `/admin/businesses`; no visual regression.
- **Tests:** extend the existing `src/test-utils/security-headers.test.ts` to assert the header is enforced
  (no `-Report-Only` suffix) once flipped.
- **Rollback:** single header-string revert in `next.config.ts`.
- **Prohibited scope:** no broader CSP-directive redesign beyond fixing today's known font violations.

### T-062 — Dependency-vulnerability remediation + CI gate
- **Objective:** (a) add an `npm audit` step to CI so new advisories surface automatically; (b) execute the
  `firebase-admin` v14 migration this unblocks, closing the currently-known findings.
  **Evidence:** `npm audit --omit=dev` reports **21 vulnerabilities (17 moderate, 4 high)**, all transitive
  through `firebase-admin`'s use of `@google-cloud/firestore`/`@google-cloud/storage`/`google-gax`/`gaxios`/
  `teeny-request`, which pull a vulnerable `uuid` (GHSA-w5hq-g745-h8pq, buffer-bounds check). The fix requires
  `firebase-admin@14.x` — already named in `CLAUDE.md`'s "Next Steps" as a deliberately deferred major, but never
  formally scoped as a task. `.github/workflows/ci.yml` has no `npm audit` step at all today.
- **Spec:** this session's audit, 2026-09-01. **Deps:** none for (a); (b) lands after (a) exists.
- **Owns:** `.github/workflows/ci.yml` (new step); `package.json`/lockfile + every `firebase-admin` call site
  (`src/lib/firebase/admin.ts` and its consumers) for the v14 bump.
- **Constraints:** the v14 migration is evaluated for breaking API changes against every Admin SDK call site
  before merging — not a blind `npm audit fix --force`; the new CI step starts as a soft warning, not a hard
  gate, until the team commits to zero-tolerance.
- **Edge/failure cases:** a transient npm-registry/advisory-DB hiccup must not fail CI outright.
- **Security:** directly closes 21 known, currently-shipping vulnerabilities (4 high).
- **Acceptance:** CI surfaces new high/critical advisories on every PR; `npm audit` reports zero high/critical
  after the v14 migration lands.
- **Tests:** the existing suite is the regression gate for the migration itself.
- **Rollback:** the CI step is a one-line revert; the v14 migration ships as its own revertible commit.
- **Prohibited scope:** no unrelated major bumps (Next.js 16, etc. — already explicitly deferred elsewhere).

### T-063 — Rate limiting / abuse throttling on public-facing endpoints
- **Objective:** Add a per-IP/per-token request budget (429 + `Retry-After` past threshold) to the routes
  reachable without an authenticated session. **Evidence:** repo-wide grep for rate-limiting logic returns
  nothing in `src/` — none exists anywhere. Genuinely public entry points: `/api/webhooks/vapi` (guarded by a
  high-entropy secret, not a request budget), `/api/field/exchange` (one-time signed tokens, but no cap on
  exchange attempts per IP), `/api/feedback` (authenticated but uncapped per user).
- **Spec:** this session's audit, 2026-09-01. **Deps:** none.
- **Owns:** new `src/lib/auth/rateLimit.ts` primitive; wiring into `api/webhooks/vapi/route.ts`,
  `api/field/exchange/route.ts`, `api/feedback/route.ts`.
- **Constraints:** must not throttle legitimate Vapi traffic during real concurrent-call bursts — tune the
  budget from evidence (expected call volume), not a guess; no new paid dependency (Firestore-counter or
  in-memory-per-instance is fine at current scale).
- **Edge/failure cases:** a cold serverless instance's in-memory counter resets — document this as
  defense-in-depth, not a precise guarantee, rather than overselling it.
- **Security:** reduces brute-force/DoS surface on the only endpoints reachable without an authenticated
  session.
- **Acceptance:** a scripted burst past threshold on each of the three routes gets 429s; normal traffic is
  unaffected.
- **Tests:** unit tests simulating burst traffic per route.
- **Rollback:** additive wrapper; remove the wrapper call to revert per-route.
- **Prohibited scope:** no new paid rate-limiting service (Upstash/Cloudflare) without a separate justification.

### T-064 — Secrets hygiene: mark every server-side key Sensitive in Vercel
- **Objective:** Audit every server-only secret in Vercel's env settings and mark it "Sensitive" (write-only,
  unreadable even by `vercel env pull`). **Evidence:** this session found `VAPI_API_KEY`/`VAPI_WEBHOOK_SECRET`
  already marked Sensitive, but `OPENAI_API_KEY` pulled back in plaintext during the same `vercel env pull` —
  confirming the flag isn't applied consistently across equivalent secrets (`DEEPSEEK_API_KEY`,
  `RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET` unverified, likely the same gap).
- **Spec:** this session's audit, 2026-09-01. **Deps:** none — dashboard/CLI-only, no code change.
- **Owns:** no source files; Vercel project settings only.
- **Constraints:** `NEXT_PUBLIC_*` vars stay untouched (already public in the client bundle; marking them
  Sensitive only hurts local dev for no security gain) — only true server secrets are in scope.
- **Edge/failure cases:** confirm a Sensitive var still accepts `vercel env add` overwrites before rolling out
  broadly, so a rotation is never blocked by this change.
- **Security:** closes the exact gap this session used to notice the Vapi mismatch — any secret not marked
  Sensitive is one `vercel env pull` away from leaking to anyone with read access to the Vercel project.
- **Acceptance:** `vercel env pull` on production returns empty values for every true secret; `NEXT_PUBLIC_*`
  vars still pull fine.
- **Tests:** n/a — operational change, verified by hand.
- **Rollback:** toggle Sensitive back off if it ever blocks a legitimate workflow.
- **Prohibited scope:** no key rotation as part of this task — that's incident response (see NH-1); this is
  the visibility flag only.

### T-065 — Alerting on Vapi webhook auth-failure spikes
- **Objective:** A lightweight scheduled check that counts recent 401s on the Vapi webhook route and notifies
  the owner past a threshold. **Evidence:** this session discovered **100% of `/api/webhooks/vapi` calls were
  failing 401 in production** purely by manually running `vercel logs` after a user's bug report ("she didn't
  say hello") — nothing automated had caught it. `src/lib/vapi/verify.ts` already logs structured diagnostic
  data (`console.warn("Vapi webhook auth mismatch", ...)`) on every mismatch; nothing consumes it.
- **Spec:** this session's audit, 2026-09-01. **Deps:** none.
- **Owns:** `src/lib/vapi/verify.ts` (increment a counter doc on mismatch), a new
  `src/app/api/cron/webhook-health/route.ts`, `vercel.json` (new schedule entry).
- **Constraints:** reuse `src/lib/comms/send.ts` for the alert email (T-041's unified comms service) — no new
  notification channel; the counter must not grow unbounded (TTL/reset-on-read, matching existing
  `src/lib/audit` retention patterns).
- **Edge/failure cases:** a single transient 401 (e.g. a secret rotation in progress) must not fire a false
  alarm — require sustained failures over a window, not one occurrence.
- **Security:** must never log or email the actual secret values (`verify.ts` already avoids this — keep it
  that way).
- **Acceptance:** a synthetic burst of failed webhook-auth attempts in a test environment triggers exactly one
  alert, not a flood; a single isolated 401 triggers none.
- **Tests:** unit test for the threshold/dedup logic.
- **Rollback:** additive cron + counter; delete both to revert.
- **Prohibited scope:** no full observability platform (Sentry/Datadog) — that's a bigger, separate decision.

### T-066 — Reusable Tooltip primitive + a targeted hover-guidance pass
- **Objective:** Build one small, consistent Tooltip component (short delay, instant dismiss, keyboard/focus
  accessible) and apply it **only** where a control's purpose isn't already obvious from a visible label —
  explicitly not a blanket sweep. **Evidence:** repo-wide grep confirms no `Tooltip` component exists anywhere
  in `src/`; several icon-only controls (e.g. the sidebar's mobile-shortcut icons in `company/layout.tsx`)
  already lean on the native `title` attribute, which is inconsistent, slow to appear, and unstylable.
- **Spec:** owner request, 2026-09-01 ("tooltips where applicable or helpful... not annoying or invasive").
  **Deps:** none, but natural to land after T-054/T-056 if those ship first, so their new icon-only controls get
  tooltips from day one.
- **Owns:** new `src/components/ui/Tooltip.tsx`; targeted application to an explicit, reviewed list of existing
  icon-only controls (sidebar shortcuts, calendar drag handles, `icon-del` buttons) — not every button on the
  platform.
- **Constraints:** **guideline, not a mandate** — a tooltip is for a control whose function isn't already
  stated in visible text; a labeled button ("Sign out", "+ Manage crews") gets none. ~400-600ms show delay, no
  tooltip on touch/mobile (hover doesn't exist there — keep `title`/`aria-label` for those), respect
  `prefers-reduced-motion` for any fade transition.
- **Edge/failure cases:** a keyboard-focused (not just hovered) element must still reveal its tooltip; the
  tooltip must never trap focus or block the control underneath.
- **Security/accessibility:** this *is* an accessibility improvement — use `aria-describedby`, not a styled
  `div` alone, so screen readers get the same information sighted users do.
- **Acceptance:** every icon-only control in the reviewed list shows a short, accurate label on hover (desktop)
  and on keyboard focus; no tooltip appears on a control that already has a visible text label; nothing shows
  on tap/touch.
- **Tests:** a component test for the Tooltip primitive (show-on-hover, show-on-focus, delay, dismiss); no
  per-site tests needed.
- **Rollback:** the component is additive; each application site's tooltip can be removed independently.
- **Prohibited scope:** no tooltip-everywhere sweep; no rewrite of existing `title=` usage on non-interactive
  elements that already works fine; no onboarding/product-tour system (a separate, bigger feature).

### T-067 — Cut the auth-gate latency before any page can render
- **Objective:** Every route in the app is client-rendered and gated behind `AuthContext`'s `loading` flag,
  which only clears after two sequential async steps run inside one `onIdTokenChanged` callback — cut this to
  the minimum and cache the resolved profile so an in-app navigation never re-pays it. **Evidence:** repo-wide
  check confirms **26/26 pages under `src/app` are `"use client"`** — there is no server-rendered/prefetched
  path. `src/contexts/AuthContext.tsx:52,66` runs `firebaseUser.getIdToken()` then a Firestore
  `getDoc(doc(db,'businessUsers', uid))` read, in sequence, before `loading` ever becomes `false` — every full
  page load shows nothing but "Loading…" until both finish, every time, even when nothing about the user's
  session has changed since the last page.
- **Spec:** this session's audit, 2026-09-01 (owner: "make each screen load ultra fast, no lag"). **Deps:**
  none.
- **Owns:** `src/contexts/AuthContext.tsx`.
- **Constraints:** this is a client-side UX cache only — it must never become a security boundary. Every server
  API route already independently re-verifies the real Firebase ID token (unaffected by this task), so a stale
  cached profile can only affect what the UI *shows*, never what the backend *allows*.
- **Edge/failure cases:** a role change (e.g. promoted to owner) must reflect within one token-refresh cycle,
  not stick forever on a stale cache — invalidate on sign-out/sign-in and on Firebase's own hourly token
  refresh, matching the pattern `useBusinessModules()` already uses for its own sessionStorage cache.
- **Security:** no regression — read-path optimization only, per Constraints above.
- **Acceptance:** navigating between two already-visited company pages in the same tab shows content without a
  new "Loading…" flash; a fresh sign-in still resolves correctly on first load.
- **Tests:** unit test for the cache hit/miss/invalidation logic.
- **Rollback:** revert the caching addition; behavior returns to today's always-fresh read.
- **Prohibited scope:** no auth-model changes; no relaxing of any server-side verification.

### T-068 — Code-split heavy per-route bundles (starting with Calendar's drag-and-drop)
- **Objective:** Lazy-load `@dnd-kit`-dependent Calendar UI (and any other route carrying a disproportionate
  library) via `next/dynamic` with a lightweight loading skeleton, so a route's initial JS payload only pays
  for what its first paint needs. **Evidence:** this session's `npm run build` shows `/company/calendar`
  shipping **276kB First Load JS** against a **102kB shared baseline** — the heaviest page in the app — while a
  repo-wide grep confirms **zero `next/dynamic` calls exist anywhere in `src/`**, so every route-specific
  library loads eagerly regardless of the route's own critical-path needs. Other pages sitting near/above
  250kB in the same build output: `/admin/onboarding`, `/admin/businesses/[businessId]/config`,
  `/company/jobs/[jobId]`.
- **Spec:** this session's audit, 2026-09-01. **Deps:** none.
- **Owns:** `src/app/company/calendar/page.tsx` (dynamic-import boundary) first; the three other flagged
  routes as a follow-up audit within the same task.
- **Constraints:** no behavior change — drag-and-drop must work identically once loaded; the loading skeleton
  (reuse the existing `.skeleton` CSS pattern) must not cause layout shift once the real component mounts.
- **Edge/failure cases:** a slow connection shows the skeleton, never a blank white flash.
- **Security:** n/a.
- **Acceptance:** `npm run build`'s First Load JS for `/company/calendar` drops measurably below today's 276kB;
  no functional regression in drag-and-drop.
- **Tests:** existing calendar tests continue to pass unchanged (behavior, not implementation, is under test).
- **Rollback:** revert the dynamic-import wrapper back to a static import.
- **Prohibited scope:** no calendar feature changes — bundle size only.

### T-069 — Serve static images through `next/image`; verify the base64 photo path is already right-sized
- **Objective:** Switch static/branding images to `next/image` for automatic sizing/lazy-loading; separately
  confirm (don't assume) that the existing base64 job-photo compression is tight enough that a thumbnail grid
  never ships a full-resolution blob. **Evidence:** repo-wide grep finds **zero `next/image` usage** — every
  image (13 `<img>` occurrences across 9 files, including the `/logo.png` brand mark on login/company/admin) is
  a plain tag. Separately, `src/lib/photos/store.ts` stores job photos as base64 directly in Firestore
  documents (the documented free-Spark-plan constraint) — fetched as raw JSON/text, which `next/image` cannot
  optimize regardless, making this a related but genuinely distinct cost from the static-image gap.
- **Spec:** this session's audit, 2026-09-01. **Deps:** none.
- **Owns:** every `<img>` call site for static assets (login, company layout, admin layout brand marks);
  `src/lib/photos/clientResize.ts` and the photo-grid rendering call sites (audit — likely no change needed if
  the existing thumb/full caps are already tight, but confirm with evidence, not assumption).
- **Constraints:** `next/image` needs known dimensions or `fill` mode — verify each call site's layout before
  switching; a base64 data-URI is a legitimate `next/image` `unoptimized` case (there's no remote/local file for
  it to re-encode), so the photo half of this task is an audit, not a migration.
- **Edge/failure cases:** a business with no `logoUrl` set must keep rendering the default Luxor logo unchanged.
- **Security:** n/a.
- **Acceptance:** static brand images use `next/image`; the job-photo thumbnail path is confirmed, with
  evidence, to never ship a full-resolution image where a thumbnail is displayed.
- **Tests:** visual spot-check for the brand-mark swap; no new automated test needed for a plain `<img>` →
  `next/image` change.
- **Rollback:** trivial per-call-site revert.
- **Prohibited scope:** no photo-storage architecture change (the already-documented Firebase Storage
  migration is separate, out of scope here).

---

## Integration order (integrator-enforced)

1. T-000/001/002 (batch B) → 2. T-010/011 (batch A, rebase on B) → 3. T-020, T-021, T-022 →
4. T-030 → T-031 → {T-032, T-033, T-034, T-035 in any order, parallel} →
5. T-040 (company → admin), T-041 (after T-031), T-042 (after T-031), {T-043, T-044, T-045 — parallel with
   each other and with T-040/041/042, no file overlap, deps only on T-020} → 6. T-050 → T-051 → T-052 →
7. **Phase 6 (T-046, T-047, T-048, T-049 — no file overlap between any pair, all parallel-safe) — starts only
   after step 6 is fully merged**, per owner decision 2026-07-23.
8. **Phase 7 (T-053–T-060, owner-added 2026-08-27) — queued, no assigned order yet; owner prioritizes before any
   task starts.** T-054 depends on T-053 landing first (voice-field decision before the new provisioning UI is
   built on top of it); T-058 soft-sequences after T-053/T-054. T-055, T-056, T-057, T-059, and T-060 are
   independent of each other and of every other task in this phase.

`src/lib/tools/agentTools.ts` merge order (never concurrent): T-011 → T-030 → T-031 → T-032(createLead) → T-041(email lines).
`src/app/api/webhooks/vapi/route.ts`: T-010 → T-011 → T-031 → T-042.
`package.json`: T-000 only; later dep additions go through the integrator.
