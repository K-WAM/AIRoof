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

## Integration order (integrator-enforced)

1. T-000/001/002 (batch B) → 2. T-010/011 (batch A, rebase on B) → 3. T-020, T-021, T-022 →
4. T-030 → T-031 → {T-032, T-033, T-034, T-035 in any order, parallel} →
5. T-040 (company → admin), T-041 (after T-031), T-042 (after T-031), {T-043, T-044, T-045 — parallel with
   each other and with T-040/041/042, no file overlap, deps only on T-020} → 6. T-050 → T-051 → T-052.

`src/lib/tools/agentTools.ts` merge order (never concurrent): T-011 → T-030 → T-031 → T-032(createLead) → T-041(email lines).
`src/app/api/webhooks/vapi/route.ts`: T-010 → T-011 → T-031 → T-042.
`package.json`: T-000 only; later dep additions go through the integrator.
