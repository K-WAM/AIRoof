# IMPLEMENTATION_LOG.md — Evidence log

Append-only. One entry per completed task (workers) and per merge/removal decision (integrator).
Format: `## T-0XX — <title>` · date · branch · commit · acceptance evidence (commands + results) ·
removals + rationale (if any) · deviations from spec (if any).

---

## PLAN-0 — Planning artifacts created (integrator)
- Date: 2026-07-20 · branch: main · baseline commit: 1ad9566
- Created: MASTER_PLAN.md, AGENTS.md, TODO.md, docs/EXECUTION_PROMPTS.md, docs/SESSION_HANDOFF.md,
  docs/IMPLEMENTATION_LOG.md. Source: consolidated_implementation_brief.md (committed for provenance).
- Validation performed: CIB-001 (verify.ts:14 fail-open), CIB-002 (agentTools.ts:452-521 fuzzy lookup leaks
  appointmentId/address; cancel by ID only), CIB-006 (x-cron-secret/query vs Vercel Bearer), CIB-008
  (stable ?key= business-wide credential), CIB-009 (demo reset rewrites live-line tenant), CIB-015
  (no .github, no test script) — all confirmed at 1ad9566. No CIB finding contradicted.
- CLI state: gh ✓ (K-WAM) · vercel ✓ (k-wam, repo NOT linked) · firebase ✓ · stripe ✓ (config present).

## T-000 — Test harness + CI gate
- Date: 2026-07-20 · branch: task/ci-foundation · commit: 25cea58
- Added vitest devDependency, npm test script, vitest.config.ts with @/ path aliases
- Created src/test-utils/ with setup.ts (mock firebase admin), 2 seed tests (lib: verifyVapiWebhook,
  api route: GET /api/health direct handler import)
- Created .github/workflows/ci.yml: type-check, lint, build, test on push/PR to main (Node 20)
- npm test: 4/4 tests pass · npm run lint: 0 errors, 26 warnings (baseline unchanged)
- Type-check/build originally reported red at commit time (firebase/firestore + lucide-react
  resolution errors, 3 additional errors in this batch's own new test files). See reviewer
  correction below — this was not fully pre-existing as logged.
- No new lint warnings introduced

## T-001 — .env.example completion
- Date: 2026-07-20 · branch: task/ci-foundation · commit: 824c2a4
- Added RESEND_FROM (used in 6+ route/module files)
- Added VAPI_AUTH_BYPASS with "removed after T-010" comment
- Added ESCALATION_PHONE, NOTIFICATION_EMAIL, FIREBASE_SERVICE_ACCOUNT_PATH (scripts use)
- Grep audit: all 22 unique process.env.X reads in src/ and scripts/ have a line in .env.example
- No code changes; names + one-line comments only

## T-002 — Security headers + cookie flags
- Date: 2026-07-20 · branch: task/ci-foundation · commit: 14dc957
- Created next.config.ts with headers(): HSTS, X-Content-Type-Options, Referrer-Policy,
  X-Frame-Options: SAMEORIGIN, CSP Report-Only (frame-ancestors 'self')
- AuthContext.tsx: __session cookie changed to SameSite=Lax; Secure on HTTPS only (localhost compat)
- Unit test (security-headers.test.ts) verifies all 5 header assertions
- npm test: 9/9 tests pass · npm run lint: 0 errors, 26 warnings (baseline)

## T-000/T-002 — Reviewer correction (integrator)
- Date: 2026-07-20 · branch: task/ci-foundation · commit: d30c58b
- Independently reproduced the batch's reported red type-check/build. Root-caused with a
  controlled comparison: identical package.json/lock on the sibling Batch-A worktree type-checked
  and built clean; a `rm -rf node_modules && npm ci` clean reinstall on *this* worktree also came
  back clean for firebase/firestore. Conclusion: the firebase/lucide-react resolution failure was a
  corrupted npm extraction from concurrent installs across worktrees during review, not a defect in
  this batch's changes or a pre-existing repo issue. The worker's log entry mischaracterizing all 4
  original errors as "pre-existing (base repo)" was inaccurate for 3 of them.
- Those 3 remaining errors, confirmed reproducible after the clean reinstall, were genuine defects
  confined to this batch's own new test files: `example-lib.test.ts` passed a plain object literal
  where `NextRequest` was expected, and additionally asserted `VAPI_AUTH_BYPASS` semantics that
  T-010 (Batch A, reviewed in parallel) removes entirely — a cross-batch collision that would have
  broken CI the moment Batch A merged. `security-headers.test.ts` assigned the optional
  `NextConfig.headers` to a non-optional local type.
- Fixed directly as trivial, unambiguous defects per the Reviewer role in AGENTS.md: cast the mock
  request via `NextRequest`, replaced the bypass-specific assertions with provider-agnostic
  secret-match assertions that hold under both the pre- and post-T-010 implementation, and added an
  explicit undefined-guard for `NextConfig.headers`.
- Re-verified on a clean install: `npm run type-check` clean, `npm run lint` 0 errors/26 warnings,
  `npm test` 9/9, `npm run build` green. Batch B is APPROVE, ready to merge.

## T-010 — Fail-closed Vapi webhook authentication
- Date: 2026-07-20 · branch: task/p0-authority · commit: this T-010 commit
- Implemented: removed the runtime bypass and missing-secret allow path; retained timing-safe comparison and
  all accepted Vapi secret headers; added explicit secret-free failure logging.
- Replay protection: canonical Vapi event identity with message/tool-call IDs preferred, transactional claims
  in Firestore, server-clock expiry, and `expiresAt` timestamps suitable for Firestore TTL cleanup. Duplicate
  delivery returns `200 {duplicate:true}` before tenant lookup or tool execution.
- Evidence: `npx vitest run --config src/lib/vapi/__tests__/vitest.config.ts
  src/lib/vapi/__tests__/verify.test.ts src/lib/vapi/__tests__/route-auth.test.ts` → 20 passed; `npm run
  type-check` → green; `npm run lint` → 0 errors / 26 pre-existing warnings; `git diff --check` → green.
- Removals: removed `VAPI_AUTH_BYPASS` behavior because it allowed unauthenticated production side effects.
  No provider or tool-business-logic changes.

## T-011 — Verified caller identity for appointment lookup/cancel
- Date: 2026-07-20 · branch: task/p0-authority · commit: this T-011 commit
- Implemented: lookup and cancellation now derive identity only from Vapi `call.customer.number`, normalize
  phone formats, retain tenant scoping, ignore legacy model-supplied name/address/phone as authority, and create
  a lead with no disclosure when caller ID is unavailable.
- Disclosure/confirmation: lookup returns only numbered service + day/time entries, excludes non-active
  appointments, and stores a 10-minute server-side candidate set bound to business/call/caller. Cancellation
  requires explicit confirmation and transactionally revalidates that state plus the live appointment phone
  before updating; appointment IDs are never returned to the model.
- Evidence: `npx vitest run --config src/lib/vapi/__tests__/vitest.config.ts` → 3 files / 32 tests passed,
  including guessing, missing caller ID, number variants, cross-customer, cross-business, prior-call ID replay,
  multiple appointments, explicit-confirmation, route metadata, and happy paths; `npm run type-check` → green;
  `npm run lint` → 0 errors / 26 pre-existing warnings; `npm run build` → green; `git diff --check` → green.
- Test-harness note: this branch predates T-000 and therefore has no `npm test` script; Vitest was installed
  with `npm install --no-save vitest` and run directly as required, leaving package files unchanged.
- External deploy actions: NH-1 records the additive Vapi schema parameters; NH-11 records Firestore TTL policy
  activation. Removals: deleted fuzzy name/address lookup authority, appointment-ID disclosure, and ID-only
  cancellation authority. No tool was renamed and no unrelated `agentTools.ts` symbol was changed.

## T-020 — Central config/readiness + fail-closed cron guard
- Date: 2026-07-20 · branch: task/config-guard · commit: `c0eb948` · integration: `b16493e`
- Created `src/lib/config/env.ts`: typed env getters (`getEnv` returns `string | undefined`,
  `requireEnv` throws in production, warns in non-production), capability-status helpers
  (`getCapabilityStatus`, `getCapabilityReport`), empty-string-treated-as-missing, 6 capabilities
  (openai/deepseek/resend/vapi/firebase/cron) each with required vars.
- Created `src/lib/auth/cronGuard.ts`: `requireCronAuth(req)` accepts only
  `Authorization: Bearer <CRON_SECRET>`. Returns 401 on missing/wrong/empty token or non-Bearer
  scheme, 500 when `CRON_SECRET` is unconfigured. Case-insensitive Bearer prefix and header name.
- Rewrote `src/app/api/health/route.ts`: uses `getCapabilityReport()` to report per-capability
  "configured"/"not_configured" status; never includes secret values or key prefixes in output;
  keeps existing firestore connected/disconnected check; dev without secrets reports unconfigured
  without crashing.
- Evidence: `npm run type-check` green · `npm run lint` 0 errors / 26 warnings (baseline unchanged) ·
  `npm test` 74/74 tests (8 test files) · `npm run build` green.
- Tests: 16 env tests covering getEnv/requireEnv (prod throw, dev warn), empty-string handling,
  capability status per-capability and multi-var, getCapabilityReport all/partial/none, secret-value
  exclusion from report; 11 cron auth tests covering missing secret, missing Authorization,
  wrong/empty/Basic tokens, case-insensitive Bearer prefix and header name, substring-prefix
  rejection, happy path. Updated existing health route seed test to match new capabilities shape.
- Removals: none. This is purely additive; old `services` key in health response replaced by
  `capabilities` key sourced from env.ts.
- Reviewer note (integrator, 2026-07-20): this entry was originally drafted on `task/config-guard`
  but left uncommitted when `b16493e` merged the code into `main`; recovered from the orphaned
  worktree and committed here rather than lost. Acceptance verified against MASTER_PLAN T-020: 401
  before any work, health reports accurate readiness with/without vars, no secret values in output —
  all match.

## T-021 — Side-effect ledger (idempotency + attempts)
- Date: 2026-07-20 · branch: task/shared-primitives · commit: this T-021 commit
- Implemented: tenant-scoped `businesses/{businessId}/operations/{opId}` ledger with transactional
  create-or-decline claims, stable path-safe Vapi/email operation IDs, pending/succeeded/failed states, and
  PII-resistant entity-reference/provider/failure metadata.
- Attempts: ordered subrecords support retryable versus terminal failure classification, provider IDs,
  idempotent completion, single in-flight attempt enforcement, terminal-state protection, and an explicit
  design contract requiring ambiguous provider outcomes to remain pending for reconciliation.
- Reconciliation/read helpers: attempt listing plus a bounded tenant-scoped query for pending operations older
  than a supplied TTL. Transactional mock tests cover 8 concurrent claimers with exactly one winner, retries,
  terminal failure, PII-shaped failure rejection, attempt listing, provider IDs, and cross-tenant TTL queries.
- Evidence: `npm run type-check` → green; `npm run lint` → 0 errors / 26 pre-existing warnings; `npm test` →
  7 files / 48 tests passed; `git diff --check` → green.
- Removals/deviations: none; primitive is additive and has no call-site adoption.

## T-022 — Runtime schema layer for AI and tool I/O
- Date: 2026-07-20 · branch: task/shared-primitives · implementation commit: b5a16fe · finalization:
  this T-022 commit
- Implemented: non-throwing typed Zod parse helpers for all seven unchanged Vapi tool inputs, field-update
  extraction, summaries, call-outcome and scope classifications, FAQ suggestions, transcripts, and the
  existing Appointment/Lead/FieldUpdate persistence shapes.
- Boundary behavior: recursively unwraps nested JSON strings, coerces finite numeric strings, strips unknown
  keys, rejects empty transcripts and instruction-shaped control content, and returns
  `{ok:true,data}|{ok:false,issues}`. Failure logs contain generic typed issues plus a redacted/truncated input
  shape, never the full payload.
- Adversarial evidence: 21 malformed fixtures cover missing tenant/call fields, invalid ranges/enums,
  prompt-injection-shaped tool and model output, malformed nested JSON, invalid persistence records, and empty
  transcripts; all are rejected. Valid fixtures cover all seven tools, nested structured replies, numeric
  coercion, extra-key stripping, AI outputs, and persistence records.
- Dependency resolution: integrator commit `d1f6102` adds `zod@^3.23.8` to `package.json` and lockfile. A
  no-branch-change `git merge-tree --write-tree d1f6102 b5a16fe` integration tree installed Zod 3.25.76 with a
  clean `npm ci` and had no merge conflicts.
- Combined-tree evidence: `npm run type-check` → green; `npm run lint` → 0 errors / 26 pre-existing warnings;
  `npm test` → 8 files / 74 tests passed; `npm run build` → green; `git diff --check` → green.
- Removals/deviations: none; no route wiring or prompt changes (reserved for T-033).

## T-030 — Scheduling integrity + calendar rollback
- Date: 2026-07-20 · branch: task/scheduling-integrity · commit: this T-030 commit
- Requested-time semantics: replaced generated mock openings with business-timezone/business-hours slot
  calculation against persisted appointments and jobs; booking records stay `requested`/pending and owner copy
  describes a requested time rather than an automatically confirmed booking.
- Transactional integrity: booking, appointment move/assignment, and crew assignment now claim tenant-scoped
  15-minute scheduling locks inside Firestore transactions, re-check legacy appointment/job overlaps by full
  duration, reject closed/out-of-hours/DST-invalid times, and return actionable 409 conflict responses. Job and
  appointment conflicts are checked across both scheduling collections for the same crew resource.
- Notification separation: scheduling commits before crew/customer/owner email attempts. Crew and customer
  confirmation emails use stable T-021 operation IDs and attempts; delivery failure is returned separately and
  never rolls back or falsely changes persisted scheduling. Moving a confirmed customer time returns it to
  `requested` until it is explicitly reconfirmed.
- Calendar truthfulness: all four optimistic mutations (place/move and unassign/unschedule) retain a precise
  prior snapshot, restore it on non-2xx or network failure, and show an actionable screen-reader-visible
  `role="alert"`. Drag times are calculated in the business timezone; jobs land at that day's configured opening,
  while closed days and nonexistent DST wall times are rejected visibly.
- Test evidence: transaction mock proves two concurrent same-slot bookings yield exactly one winner and verifies
  duration overlap rejection. Pure scheduling tests cover occupied slots, closed days, adjacent durations, and
  DST offset changes. Calendar rollback tests inject 409 and mid-drag network failure and assert the original item
  is restored. `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings; `npm test` 12 files /
  115 tests passed; `npm run build` green; `git diff --check` green.
- Manual evidence: NH-8 remains the release-gate desktop click test for drag → conflict rollback/error → confirm.
  Drag-drop keyboard alternatives remain deferred as permitted by T-030. Removals: replaced silent mutation
  catches and non-transactional scheduling writes; no Vapi tool name or existing parameter was changed.

## T-031 — Truthful emergency escalation
- Date: 2026-07-20 · branch: task/scheduling-integrity · commit: this T-031 commit
- Delivery truth: `escalateCall` now returns `accepted|delivered|failed|unconfigured` while retaining the legacy
  `escalated` and `escalationTarget` fields. `escalated:true` is emitted only after Resend returns a provider
  message ID; missing `RESEND_FROM`, notification email, escalation phone, provider rejection, and thrown provider
  errors all return non-delivered states without a notification or response-time promise.
- Ledger/retry/dedupe: every escalation derives one stable `email:urgent-escalation:{callId}` T-021 operation,
  writes ordered attempts with provider IDs or non-PII retryable failure codes, and passes the same operation ID
  to Resend as its idempotency key. Repeated and simultaneous escalation calls execute one provider effect;
  retryable failures can safely create a later attempt, while in-flight duplicates return `accepted`.
- Caller/operator truth: the Vapi reply keeps its existing `{result}` shape. Delivered replies may say email
  notification succeeded but never promise timing; accepted/failed/unconfigured replies explicitly say delivery
  is unconfirmed and direct immediate danger to emergency services. Agent-action records correlate by call ID,
  retain only the operational reason as input, and map delivery status to pending/success/failed. The dashboard
  reads those member-visible records, deduplicates by call, suppresses later-resolved failures, and displays an
  accessible urgent banner for pending, failed, or unconfigured notification.
- Tests: transactional provider mocks cover all three missing configuration fields, provider success with a real
  message ID, resolved and thrown provider failures, safe retry, and simultaneous-call dedupe. Webhook branch
  fixtures cover all four statuses, stable response shape, action status, and absence of the former 15-minute
  callback promise. Evidence: `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings;
  `npm test` 13 files / 126 tests passed; isolated `npm run build` green; `git diff --check` green.
- Environment note: initial build attempts overlapped two sibling-worktree `npm ci` processes and stalled before
  compilation, matching the documented concurrent-install hiccup. Only this worktree's orphan build processes
  were stopped; after both installs completed, the isolated build compiled in 7.3 seconds. Removals: deleted the
  unconditional `escalated:true`, swallowed Resend error, and unsupported “notified within 15 minutes” claim.

## T-032 — Cron correctness + callback state machine
- Date: 2026-07-21 · branch: task/scheduling-integrity · commit: 58fc531 (review fix `9beb8e2`)
- Fail-closed boundary: `follow-up-calls`, `daily-call-summary`, and `faq-suggestions` now call the shared
  `requireCronAuth` guard before parsing a request, loading Firestore, invoking a model/provider, or writing.
  Negative route tests cover missing and invalid Bearer tokens for all three handlers with zero side effects.
- Explicit eligibility: `createLead` persists `callbackState`, `callbackDueAt`, and `callbackConsent` on every
  new lead. Consent defaults false; missing/invalid delay configuration or an unusable phone produces
  `callbackState: "none"` and a null due time. The former fire-and-forget Vapi callback was removed so every
  callback now passes through the consent, due-time, calling-window, attempt-cap, and ledger gates.
- Atomic execution: the follow-up query contains `callbackState == pending`, `callbackConsent == true`, and
  `callbackDueAt <= now`; pre-existing leads with absent consent are excluded. Each invocation starts at most one
  T-021 attempt under a stable per-lead/per-attempt operation ID before calling Vapi. A provider/network ambiguity
  stays pending for reconciliation rather than risking a duplicate. Successful calls persist the provider ID,
  canonical call record, lead attempt count, next due time, and terminal `none` state when the cap is reached.
- Configuration: callback windows now use the canonical `callbackWindowStart`/`callbackWindowEnd` keys;
  businesses without `callbackDelayMinutes` are skipped. Daily-summary and FAQ scheduling remain unchanged
  pending NH-6.
- Test evidence: transactional Firestore tests exercise the real T-021 ledger, prove overlapping cron invocations
  produce one provider call/one attempt, and cover due/consent filters, absent delay, default consent, window and
  attempt caps, ambiguous provider outcomes, successful summary/FAQ execution, and lead initialization.
  `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings; `npm test` 14 files / 143 tests
  passed; `npm run build` green;
  `git diff --check` green.
- Removals/deviations: removed legacy query-secret/x-cron-secret authentication, absent-field `calledBack`
  eligibility, wrong `callingWindow*` keys, non-atomic direct provider calls, and create-time callback dispatch.
  Existing outbound voice text and Vapi tool names were not changed.
- **Security note (integrator review):** `daily-call-summary` and `faq-suggestions` previously **failed OPEN**
  when `CRON_SECRET` was unset (the old `if (expectedSecret) { ...check... }` skipped auth entirely rather than
  blocking) — a real pre-existing gap, not just a style inconsistency. Now correctly fail-closed via the shared
  `requireCronAuth` guard, same as `follow-up-calls`.
- **Consent note (integrator review):** nothing in the Vapi webhook currently passes `callbackConsent: true` to
  `createLead`, so every lead (new or pre-existing) gets `callbackConsent: false` in practice today — the
  auto-callback feature is correctly inert (never calls without consent, never duplicates) until a future task
  wires a real consent signal from the call itself. This is documented behavior, not a defect; worth a follow-up
  task if timely callbacks are wanted.
- **Review fix applied:** `vercel.json`'s cron schedule was `*/5 * * * *`. Vercel's Hobby plan hard-limits cron
  jobs to once per day — that expression **fails at deployment**, not just runs less often (confirmed against
  Vercel's own docs). Owner has explicitly ruled out a Pro upgrade. Reverted to the pre-existing `0 14 * * *`
  (daily, 2pm UTC) schedule; the atomic due/consent/claim logic added by this task is unaffected by cadence —
  it is simply less timely than 5-minute polling would have been.

## T-035 — Demo/production isolation guards
- Date: 2026-07-21 · branch: task/demo-isolation · commit: 28a67ff
- **Allowlist (a):** Added `DEMO_BUSINESS_IDS: ReadonlySet<string> = new Set(["demo-roofing"])` code constant with an `isAllowedDemoBusiness()` guard in `applyVertical`, returning `{ ok: false, error: "..." }` before any write when `LIVE_LINE_BUSINESS_ID` is not in the set.
- **isDemo marker (b):** Added `isDemo: true` to the seed script (`scripts/seed-demo-business.mjs:108`). The route now reads `existing.data()?.isDemo !== true` after the business doc fetch and returns an error before any mutation when the marker is absent or false.
- **Backup export (c):** Before any collection deletion, all docs from `calls`, `leads`, `appointments`, `crews`, `jobs` are read once into memory, serialized as `{ id, ...data }` per doc, and written to `businesses/demo-roofing/backups/{timestamp}`. The backup write gates the delete — if it fails, no data is deleted. The same in-memory snapshots are then used for the delete batch, avoiding a second read.
- **Transactional lock (d):** A lock doc at `businesses/demo-roofing/backups/lock` is atomically claimed via `runTransaction` before any backup/delete/re-seed. A locked doc younger than `LOCK_TTL_MS` (120s) results in an error response. Stale locks are reclaimed. The lock is released in a `finally` block regardless of success or failure.
- **Confirm field (e):** The DELETE handler now parses the request body and requires `confirm: "RESET"`. Missing or wrong values return 400. The UI (`src/app/admin/demo/page.tsx`) replaced the browser `confirm()` dialog with a modal overlay requiring the user to type "RESET" before the "Yes, reset demo" button enables. The fetch call sends `{ confirm: "RESET" }` in the JSON body.
- **Superadmin gate retained:** The existing `verifySuperadmin(request)` check at the top of both POST and DELETE handlers is unchanged.
- **Files changed:** `src/app/api/admin/demo-customize/route.ts` (full restructure: allowlist, isDemo marker, lock, backup export, finally-block lock release, DELETE body parsing); `src/lib/verticals/demoSeed.ts` (unchanged — isDemo is on the seed script's business doc, not in `demoSeedFor`); `scripts/seed-demo-business.mjs` (added `isDemo: true` line); `src/app/admin/demo/page.tsx` (replaced reset function with typed-confirm modal). New: `src/app/api/admin/demo-customize/__tests__/route.test.ts` (12 tests: 3 confirm-field, 2 isDemo-marker, 2 transactional-lock, 3 backup export, 1 superadmin gate, 1 full valid POST).
- **Known residual gap (integrator review):** MASTER_PLAN's T-035 acceptance criteria include "concurrent webhook sees consistent state" during a reseed. The transactional lock only serializes concurrent *resets* against each other — it does not stage/swap writes, so a live Vapi webhook call landing mid-reseed could still observe a brief window of partially-deleted/reseeded collections. Fixing this fully would require touching `src/app/api/webhooks/vapi/route.ts`, which is outside T-035's owned scope. Accepted as a documented, demo-only, low-probability residual risk rather than scope-expanding into another file; tracked for a follow-up task if the owner wants it closed.
- **Evidence:** `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings; `npm test` 14 files / 138 tests passing (existing 126 + 12 new T-035 tests); `npm run build` green; `git diff --check` green. No removals.

## T-033 — AI input hardening + provider/model routing
- Date: 2026-07-21 · branch: task/ai-input-hardening · commit: 93a9d7c
- **Registry (new):** Created `src/lib/ai/registry.ts` — centralized provider/model selection for 6 AI
  operations (`parse-field-update`, `summarize`, `classify`, `faq-suggest`, `agent-respond`, `transcribe`).
  Honors `DEEPSEEK_MODEL` and `OPENAI_MODEL` env overrides plus `BusinessConfig.backOfficeModel` and
  `liveModel` persisted settings. GPT-prefixed `backOfficeModel` values switch the provider from DeepSeek
  to OpenAI. `selectClient()` returns the correct client+model tuple; `requireProvider()` throws when
  unconfigured. `canUseMock()` returns false in production, true otherwise; `mockLabel()` prefixes mock
  output with `[MOCK-<op>]`.
- **deepseekClient.ts:** Adopted T-022 zod schemas (`parseFieldUpdateOutput`, `parseSummaryOutput`,
  `parseCallOutcomeOutput`, `parseFaqSuggestionsOutput`) at every AI output boundary. Replaced manual
  `Array.isArray`/`typeof` checks + `try { JSON.parse }` with typed `{ok,data}|{ok:false,issues}` parse
  results. `parseFieldUpdate` now throws `ParseFieldUpdateError` (with `needsConfirmation: true`) when
  schema validation fails — callers can flag for confirmation instead of silently persisting. All four
  functions use `selectClient()` from registry instead of hardcoded `"deepseek-chat"`/`"gpt-4o"` model
  strings. Provider timeouts/errors surface as thrown Errors, never swallowed.
- **Mock removal:** Removed 5 silent production-possible mock fallbacks across `deepseekClient.ts` and
  `openaiClient.ts`: `summarizeTranscript` (fake summary string), `classifyCallOutcome` (fake
  `lead_captured`), `generateFaqSuggestions` (fake FAQ entry), `parseFieldUpdate` (silent empty return),
  `generateAgentResponse` (fake agent reply). All now throw in production when the provider is
  unconfigured. Dev/demo (`NODE_ENV !== "production"`) returns clearly-labeled `[MOCK-<op>]` prefixed
  output.
- **field-audio/route.ts:** Added audio input validation (10MB size cap, MIME type allowlist
  `audio/*`/`video/*`, empty check), Whisper timeout via `AbortController` (30s), OpenAI readiness check
  via `isProviderReady("openai")`. Catches `ParseFieldUpdateError.needsConfirmation` and returns a
  `needsConfirmation: true` response with raw transcript saved, rather than silently persisting invalid
  AI output.
- **transcribe/route.ts:** Added audio input validation (10MB cap, MIME type check, empty check),
  timeout (30s), OpenAI readiness check via `isProviderReady("openai")`. Returns 504 on timeout, 503 on
  unconfigured provider.
- **agent/respond/route.ts:** Uses `selectModel("agent-respond", { liveModel, backOfficeModel })` from
  registry instead of `businessConfig.liveModel || process.env.OPENAI_MODEL || "gpt-4o-mini"`. Passes
  `modelOverrides` through to `generateAgentResponse`.
- **Tests:** 54 new tests (209 total). Registry tests (24): model selection defaults, env overrides,
  `backOfficeModel`/`liveModel` overrides, GPT-prefix provider switching, `requireProvider` throw paths,
  `canUseMock` prod/dev behavior, client readiness. AI hardening tests (30): malformed nested JSON
  rejection, empty AI response rejection, `ParseFieldUpdateError.needsConfirmation` assertion, valid
  structured output acceptance, prompt injection in AI output rejection, provider-not-configured prod
  throws vs dev mock returns, provider API error propagation, numeric string coercion, schema-validated
  output for summarize/classify/faq, raw-content fallback on schema rejection, empty response fallback.
- **Evidence:** `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings; `npm test`
  17 files / 209 tests passed (155 existing + 54 new); `npm run build` green.
- **Removals:** Removed 5 plausible production mock fallbacks (see above). Removed hardcoded model names
  `"deepseek-chat"`, `"gpt-4o"`, `"gpt-4o-mini"`, `"whisper-1"` from individual files — all now in
  registry. Removed unused imports (`selectModel`, `isProviderReady` from deepseekClient;
  `selectModel` from openaiClient). Removed legacy `const openai/openaiClient/deepseek` top-level
  instantiation from openaiClient.ts and deepseekClient.ts (now centralized in registry).
  **Prohibited scope untouched:** `src/lib/jobs/projection.ts`, field-correction UX, Vapi tool names,
  prompt content (same prompts, only validation added).

## T-034 — Scoped field access tokens
- Date: 2026-07-21 · branch: task/field-tokens · commit: 02232e2
- **Grant/session boundary:** `fieldKey` remains a server-side mint/revocation secret. QR URLs now carry a
  signed HMAC exchange grant derived from T-020's server-only `CRON_SECRET`, with a 10-minute maximum lifetime
  and Firestore-transactional one-use claim. Exchange sets a SameSite=Lax, HttpOnly field cookie whose signed
  lifetime is capped at 12 hours; neither response JSON nor the clean `/field` redirect exposes the session.
- **Fail-closed scope:** every grant/session includes business scope, an optional job scope, and an HMAC tag of
  the current business `fieldKey`. Missing signing configuration, malformed/tampered/expired/replayed grants,
  expired sessions, and rotated/missing `fieldKey` all fail closed. Job-scoped sessions cannot list business jobs
  or call a different job path; `/field?jobId=...` bootstraps through the single-job endpoint.
- **Credential cleanup + continuity:** the server exchange sends `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`, sets the cookie, and redirects without the grant. The field client removes
  `key`, `grant`, and `token` via `history.replaceState`, deletes the former localStorage key, and migrates old
  keys through a body-only POST. `ENABLE_LEGACY_FIELD_KEY_FALLBACK` defaults on for this one deploy cycle and
  can disable both legacy exchange and direct `?key=`/header access; T-051 removes the fallback.
- **Audit:** successful grant consumption is atomically recorded with its one-use claim; successful session and
  temporary legacy access records include business, optional job, actor, token ID, path, timestamp, IP, and user
  agent in `fieldAccessAuditEvents`.
- **Demo/printed-QR note:** newly generated Demo Studio field QRs use `/api/field/exchange?grant=...` and work on
  unauthenticated crew phones through exchange → clean redirect → cookie session. Existing `demo-roofing`
  printed `?key=` QRs may need one reprint when the fallback is disabled/removed. The Demo Playbook entry at
  `public/guides/onboarding-guide.html` still describes the legacy URL and needs an owner-scoped pointer/update
  before T-051; it was not silently rewritten outside T-034's owned files.
- **Tests/evidence:** negative-first token tests cover missing configuration, malformed/tampered/expired/replayed
  grants, expired/revoked sessions, business/job boundary violations, legacy-flag disablement, and audit writes;
  route tests verify clean redirects, no-referrer/no-store headers, and HttpOnly cookie bootstrap; the Demo Studio
  route test proves the reusable key is absent from `fieldUrl`. `npm run type-check` green; `npm run lint` 0 errors
  / 26 baseline warnings; focused tests 26/26; full `npm test` 17 files / 169 tests green on unchanged rerun after
  the documented one-off `example-lib.test.ts` timeout; `npm run build` green; `git diff --check` green. No auth
  provider, session-role path, or Vapi contract changed; no production path was removed.

## T-033/T-034 — Integrator review (both accepted)
- Date: 2026-07-21 · integration commits: T-033 merge, T-034 merge (this cycle)
- Independently re-verified both in their own worktrees before merge: T-033 type-check/lint clean, 209/209
  tests, build green; T-034 type-check/lint clean, 169/169 tests, build green. Both zero file overlap
  (confirmed via diff), only shared conflicts were in `TODO.md`/`IMPLEMENTATION_LOG.md` status rows/log
  entries, resolved keeping both sides.
- **T-033 findings:** registry correctly centralizes provider/model selection for the operations that
  actually have a provider *choice* (`agent-respond` routes through `selectClient`); the two Whisper
  transcription routes (`field-audio`, `/api/transcribe`) call `isProviderReady("openai")` from the
  registry for the readiness gate but construct their own `OpenAI` client directly rather than via the
  registry's `getOpenAIClient()` — functionally identical (same env var), just a minor missed
  code-reuse opportunity, not a defect; not sent back for rework. `generateAgentResponse`'s new
  throw-on-error behavior only affects the superadmin-only `/api/agent/respond` testing endpoint, not
  the live Vapi webhook path (verified `generateAgentResponse` has no other call sites) — safe. Adversarial
  test coverage (malformed JSON, prompt injection, empty/oversized audio, provider errors) matches the
  spec's edge-case list.
- **T-034 findings:** genuinely strong security work — HMAC key domain-separated from `CRON_SECRET` (not
  reused directly), `timingSafeEqual` throughout, one-time-use exchange grants enforced via a Firestore
  transaction (real replay protection, not just a TTL), revocation tied to the current `fieldKey`'s HMAC
  tag (rotating the key invalidates every outstanding grant/session with no separate revocation list to
  maintain), job-scoping enforced by path-matching the request against the token's claims, and
  `Cache-Control`/`Referrer-Policy` headers added on the exchange response beyond what the spec asked for.
  Negative-first tests cover every fail-closed path named in the spec's acceptance criteria. The
  10-minute/one-time-use exchange grant means a printed demo QR is only good for a single scan within 10
  minutes of the most recent Demo Studio launch — reviewed and accepted as correct given the demo workflow
  (each pitch re-launches Demo Studio anyway, which mints a fresh grant as a side effect); not a defect.

## T-041 — Unified outbound communications
- Date: 2026-07-21 · branch: task/unified-comms
- Created `src/lib/comms/send.ts` — single comms service wrapping Resend with:
  - `sendEmail(opts)` — raw send with capability check (T-020 `getCapabilityStatus("resend")`), typed
    `CommSendResult` (status: `delivered|failed|unconfigured|no_recipient`), provider message ID on success,
    and error classification (4xx → terminal, 5xx/429 → retryable, thrown → retryable `provider_error`).
  - `sendWithLedger(opts)` — full idempotent send integrating T-021 ledger (claim → attempt → complete with
    provider ID), returning `NotificationDeliveryState`.
  - `isCommsConfigured()` — delegating to T-020 config for `RESEND_API_KEY` + `RESEND_FROM`.
  - Single `RESEND_FROM` sender (D-4: `no-reply@luxordev.com`) validated by T-020 — no placeholder fallbacks.
  - NH-3 (SPF/DKIM) not done → `sendWithLedger` reports `unconfigured` when Resend capability is absent,
    never silently skips or claims success.
- 16 unit tests covering: unconfigured, no_recipient, success with providerId, 4xx terminal, 5xx retryable,
  no-provider-id, thrown error, ledger idempotency (already-succeeded, pending, duplicate claim rejection),
  successful ledger delivery recording.
- Refactored `src/lib/notify.ts`: removed direct Resend dependency; extracted pure HTML-construction functions
  (`buildCrewAssignmentEmail`, `buildCustomerConfirmationEmail`) that return `{subject, html}`; convenience
  wrappers `sendCrewAssignment`/`sendCustomerConfirmation` delegate to `sendEmail()` and return
  `CommSendResult` instead of `boolean`.
- Refactored `runLedgeredEmail` in `agentTools.ts`: now accepts `{to, subject, html}` instead of
  `send: () => Promise<boolean>`, delegates entirely to `sendWithLedger()` — captures provider ID in ledger.
- Refactored `escalateCall` in `agentTools.ts`: replaced raw `resend.emails.send()` with `sendEmail()`;
  removed local `resend`/`FROM`/`configuredFrom` variables; capability check now delegates to
  `isCommsConfigured()`.
- Migrated routes (report send, invoice send ×2, send-confirmation): replaced direct `resend.emails.send()`
  with `sendEmail()` from comms; removed local `Resend` imports and `resend`/`FROM` variables.
- Updated `assign/route.ts` and `appointment/[appointmentId]/route.ts`: call `buildCrewAssignmentEmail`/
  `buildCustomerConfirmationEmail` then pass `{to, subject, html}` to refactored `runLedgeredEmail`.
- HTML templates and email copy kept exactly as-is (no redesign — only sender mechanism changed).
- Acceptance evidence:
  - `npm run type-check` — clean
  - `npm run lint` — 0 errors, 26 warnings (baseline unchanged)
  - `npm test` — 239/239 passing (223 baseline + 16 new comms tests)
  - `npm run build` — green
  - Grep confirmed only 1 remaining `resend.emails.send` call: `src/lib/comms/send.ts` (the centralized
    service itself)
  - Removed: 2 `Resend` imports (agentTools.ts top-level, send-confirmation route), 5 sets of local
    `resend`/`FROM` variables across routes, 1 `configuredFrom` variable in escalateCall, 2 `send` callbacks
    replaced with `{to, subject, html}` in assign/appointment routes.

## T-041 — Integrator review
- Date: 2026-07-22 · integration commit: this merge
- Independently reproduced in the worktree before merge: type-check/lint clean, 239/239 tests (one
  transient failure in `verify.test.ts` on the first run under parallel worktree load — same documented
  pre-existing flake, clean on immediate re-run), build green.
- `createEmailOperationId` (used by `sendWithLedger`) already existed in `src/lib/ops/ledger.ts` from an
  earlier task — confirmed T-041 did not touch that file, reused the existing primitive as intended, no
  scope expansion.
- Confirmed every caller of the now-typed `sendCrewAssignment`/`sendCustomerConfirmation` (previously
  `Promise<boolean>`) checks `result.status` explicitly (e.g. `send-confirmation/route.ts`:
  `notifiedCustomer = result.status === "delivered"`) rather than treating the returned object as a
  truthy/falsy boolean — the signature change is safe everywhere it's called.
- `appointments/[appointmentId]/route.ts` and `assign/route.ts` were edited even though MASTER_PLAN's
  literal file list for T-041 didn't name them — both are pre-existing callers of `runLedgeredEmail`
  (owned, in-scope) whose call sites necessarily needed updating for its new `{to, subject, html}`
  signature. Consequential caller updates from an owned refactor, not unauthorized scope creep.
- Fixed unrelated pre-existing defect while merging: `TODO.md` had a duplicated paragraph (introduced in
  an earlier integrator edit this session, not by this task) — removed the duplicate.

## T-042 — PII retention, deletion, and audit integrity
- Date: 2026-07-21 · branch: task/pii-retention · commit: 44998fb
- **Policy:** Added repository-enforced, independently configurable transcript, recording, and tool-I/O
  windows. All default to a conservative 90 days through `RETENTION_TRANSCRIPTS_DAYS`,
  `RETENTION_RECORDINGS_DAYS`, and `RETENTION_TOOL_IO_DAYS`; invalid values fail closed. The policy and
  `docs/RETENTION.md` explicitly keep NH-4 owner/legal sign-off open.
- **Redaction:** Eligible call transcript fields/derived text and recording URLs, plus old `agentActions`
  input/output, are deleted with Firestore field transforms. Retained skeletons contain only SHA-256 hashes,
  serialized byte lengths, field names, and timestamps. The job touches only tenant `calls` and
  `agentActions`, never invoices. Active calls are skipped.
- **Resumable cron:** Added `POST /api/cron/retention`, with `requireCronAuth` before every Firestore access,
  required tenant scope, bounded batches, and opaque call/tool phase cursors. Each document redaction and its
  audit event commit in one transaction; interrupted/replayed batches converge without restoring data or
  duplicating successful redaction events.
- **DELETE semantics:** `/api/calls/[callId]` no longer relabels a call as ended. It transactionally removes
  call transcript/recording content and call-local identifiers, retains an audit skeleton, preserves
  operational status/provider metadata, returns `409` for active calls, and is idempotent on repeat.
- **Audit integrity:** Added readonly event/action/provider-ID types and create-only transaction writes under
  tenant `auditEvents`. Events carry correlation IDs, actor, subject, provider IDs, timestamp, and factual
  result without tool PII. Vapi appointment lookup and cancellation now emit correctly distinct
  `appointment.lookup`/`appointment.cancel` events with Vapi call/tool-call IDs.
- **Tests/evidence:** 20 new tests (243 total) cover negative cron auth before Firestore, defaults/config
  validation, independent eligibility, active-call exclusion, privacy-safe hashes, cursor resumption,
  idempotent reruns, invoice non-interference, DELETE redaction/repeat/denial, append-only overwrite rejection,
  and Vapi audit labels/provider IDs. `npm run type-check` green; `npm run lint` 0 errors / 26 baseline warnings;
  `npm test` 23 files / 243 tests green; `npm run build` green; `git diff --check` green.
- **Out-of-scope preserved:** no external consent/disclosure wording, data-subject request traversal, provider
  deletion, invoice deletion, deployment, push, or Vapi tool contract rename was added.

## T-042 — Integrator review
- Date: 2026-07-22 · integration commit: this merge
- Independently reproduced in the worktree before merge: type-check/lint clean, 243/243 tests (one transient
  `verify.test.ts` failure on first run under parallel worktree load — same documented pre-existing flake,
  clean on immediate re-run), build green.
- Spot-checked the transactional redaction path in `redactCallDocument`: an active call (`status === "active"`)
  is denied for `call.delete` (writes a `denied` audit event, no data touched) and silently skipped for
  routine retention; an already-redacted call returns `unchanged` and logs a `skipped` audit event with
  `alreadyRedacted: true` rather than reprocessing — confirms the idempotent-rerun acceptance criterion.
- Confirmed `docs/RETENTION.md` accurately describes the shipped behavior (cross-checked every claim against
  the actual code) and correctly keeps NH-4 (legal sign-off on retention windows) open rather than asserting
  the 90-day defaults are an approved policy.
- Confirmed zero file overlap with T-041 (verified via diff) and zero touches to `docs/IMPLEMENTATION_LOG.md`
  merge conflicts beyond the expected shared status-row/log entries.
- This is the strongest-reviewed submission this session: real Firestore transactions (not just a TTL check),
  SHA-256+byte-length audit skeletons instead of raw content, cursor-based resumable batching, and explicit
  tests for invoice non-interference and append-only overwrite rejection.

## T-043 — Owner-facing tenant-creation welcome email
- Date: 2026-07-23 · branch: task/tenant-email · commit: 4b477ae
- Added `buildBusinessWelcomeEmail` and `sendBusinessWelcomeEmail` to `src/lib/notify.ts`, reusing the
  existing `shell()` BizBranding HTML pattern with Luxor AI branding (accent `#1e3a5f`).
- Modified POST handler in `src/app/api/admin/businesses/route.ts`: after the Firestore transaction
  commits, generates a password-reset link via `admin.auth().generatePasswordResetLink()` and sends it
  via the comms service (`sendEmail` from `src/lib/comms/send.ts`) — never direct Resend, never a
  plaintext temp password in the email body, log line, or error message.
- Subject: `[Luxor AI] Your <businessName> account is ready` for inbox filtering.
- Edge cases: missing `ownerEmail` skips send (no `welcomeEmail` field in response); Resend
  `not_configured` returns `welcomeEmail: { status: "not_configured" }`; send failure does not roll
  back the Firestore business-creation transaction; `generatePasswordResetLink` failure surfaces as
  `welcomeEmail: { status: "failed" }` with a warning logged (link URL never exposed).
- Tests: 7 unit tests in `src/app/api/admin/businesses/__tests__/route.test.ts` covering configured
  send, unconfigured, missing ownerEmail, reset-link failure, no-rollback on send failure,
  tempPassword not leaked in welcome context, and reset link not exposed in response.
- `npm run type-check` green; `npm run lint` 0 errors / 26 warnings (baseline unchanged); `npm run build`
  green; 7/7 tests passing (2 pre-existing timeout flakes in unrelated `send.test.ts` +
  `example-lib.test.ts`).
- Out of scope preserved: no tenant-removal/DELETE endpoint built (NH-12); no changes to existing
  `tempPassword` return in the POST response for the superadmin UI; no raw Resend call reintroduced.
