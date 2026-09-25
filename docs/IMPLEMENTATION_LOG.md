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
- **Integrator review — APPROVE, merged with one trivial fix:** independently reproduced in the worktree.
  `npm run type-check` initially failed (`TS2790`: `delete` on a non-optional property in the new test file,
  `route.test.ts:224`) — Deepseek's own report of "type-check green" predated this; fixed by switching to a
  destructure-omit pattern instead of `delete` (test-only, zero behavior change), then independently
  reconfirmed clean. One test (`example-lib.test.ts`, unrelated to this task's files) timed out on a full
  concurrent run and passed cleanly in isolation and on a full solo rerun (266/266) — flaky under parallel
  load, not a regression; Codex's independent T-040 review hit the same flake in the same file, corroborating.
  `npm run build` green. Merged into `main` (`Integrate T-043`).

## T-040 — UI truthfulness + form guards
- Date: 2026-07-23 · branch: `task/ui-truthfulness` · commit: this commit
- Added one shared `PageError` component using the existing panel, design-token, and `.button` system. It
  always renders as `role="alert"` and uses generic, PII-free failure copy.
- Replaced silent or false-empty initial-load behavior on company dashboard, calls, pipeline, jobs, calendar,
  library, and settings pages plus admin businesses, usage, invoices, and business config. Every load now
  keeps the existing `PageSkeleton` while pending, checks response status where applicable, and renders a
  visibly distinct failure state before any empty-success copy.
- Calendar scope stayed limited to load truthfulness: crew/job/settings fallbacks no longer convert failed
  requests to empty arrays. Existing T-030 optimistic rollback helpers and mutation contracts were preserved.
- Removed swallowed library mutations. Pricing/document changes and resource deletion/color changes now show
  an alert and restore the prior UI state on persistence failure; job creation and pipeline mutations also
  report failures explicitly.
- Invoice save and send are separate actions. Send is disabled until an invoice has a confirmed ID and no
  unsaved edits, invalid client/recipient emails and missing client names focus the offending field, all
  response statuses are checked, and a synchronous single-flight guard prevents two sends from a double-click.
- Added required/format validation for invoice client name/email, settings notification email/contact phone,
  onboarding business name/owner email/main phone, and config business name/notification email/main phone.
  Optional contact/escalation email/phone fields are format-checked when present. Validation failures use
  `role="alert"` status text and either explicit focus or native required/type/pattern focus management.
- Invoice, onboarding, and config forms register `beforeunload` plus in-app link guards only while dirty and
  clear their dirty state after a confirmed save/create.
- Failure-path evidence:
  - Admin businesses loader test injects HTTP 503 and asserts the discriminated result is `error` with no
    businesses payload; the shared failure component is asserted to expose `role="alert"`.
  - Invoice loader test injects a partial HTTP 503 and asserts it cannot become empty success.
  - Invoice-flow tests cover unsaved/stale/invalid-email send denial, one-send single-flight behavior under
    concurrent calls, and dirty-invoice unload warning activation.
- Manual route checklist: confirmed each owned page orders states as skeleton → failure alert → loaded
  content/empty copy; no page renders its “No … yet” copy from a caught load failure; no new pagination,
  search, toast dependency, or visual redesign was introduced.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 26 baseline warnings; `npm test`
  26 files / 264 tests green (one unrelated harness timeout on the first parallel run, isolated test and full
  rerun green); `npm run build` green; `git diff --check` green.
- **Integrator review — APPROVE, merged without rework:** independently reproduced in the worktree —
  type-check clean, lint 0/26, 264/264 tests, build green, matching Codex's report exactly. Spot-checked
  `src/app/company/dashboard/page.tsx`: the prior `.catch(() => ({ jobs: [] }))` on the jobs fetch (a silent
  false-empty state — CIB-012's core failure mode) now throws and is caught at the top level into
  `loadError`/`<PageError role="alert">`, never a misleadingly-empty dashboard. `invoiceFlow.ts`'s
  `canSendSavedInvoice`/`runSingleFlight`/`guardUnsavedInvoiceUnload` cleanly implement save-before-send,
  single-flight double-click protection, and the dirty-form warning as three small testable pure functions —
  good extraction, not scope creep (both `invoiceFlow.ts` and `loadBusinesses.ts` are new files but only
  contain logic extracted from already-owned pages, needed to satisfy the task's own component-test
  requirement). `PageError` correctly reuses `.button`/panel/design tokens (one-teal system preserved). Merged
  into `main` (`Integrate T-040`); `TODO.md`/`IMPLEMENTATION_LOG.md` were the only conflicts (both workers' own
  status-row/log entries, kept both sides), zero code conflicts as designed.

## T-045 — Icon consistency sweep
- Date: 2026-07-23 · branch: `task/icon-sweep` · commit: this commit
- Audited all 21 current `page.tsx` files under `src/app/company/**` and `src/app/admin/**`. The four pages
  left without a `lucide-react` import are redirect-only routes with no rendered actions, navigation rows,
  or section headers; `company/guide/page.tsx` was already the reference implementation and did not need a
  change.
- Added restrained lucide icons to page titles, primary actions, and panel/section headers across the 16
  rendered pages that had coverage gaps. Reused existing button/panel styling and inline flex alignment;
  no component, dependency, navigation, data-flow, or page-layout changes were introduced.
- Replaced the remaining icon-like emoji, Unicode arrows, and the hand-authored microphone SVG in company
  field, job-detail, library, invoice, and calendar controls with lucide icons. A targeted repository grep
  found no remaining `📝`/`📦`/`🕝`/`👷`/`📝`/`📄`/`📅`/`📧`/`🖨`/`🗑`/`✎`/`⤺`/`⬇` icon glyphs in the scoped
  page files.
- Preserved every existing lucide choice and all `useBusinessModules()` vocabulary. Dynamic job/resource
  action labels still use `vocab.jobNoun`, `vocab.resourceNoun`, and plural variants; no industry-specific
  noun was newly hardcoded.
- Playwright evidence: captured before/after screenshots for `/admin/businesses`, `/company/jobs`, and
  `/company/field` under `C:\Users\karee\AppData\Local\Temp\air-t045-screenshots`. All three correctly
  redirected to the unchanged login screen because no signed Firebase browser session was available.
  This verifies the protected-route boundary but does not constitute an authenticated visual comparison;
  reviewer should repeat the three-route spot-check in a signed-in browser.
- Verification: `git diff --check` clean; `npm run type-check` clean; `npm run lint` 0 errors / 27 repository
  warnings; `npm test` 27 files / 271 tests green after one existing Vapi smoke-test timeout passed in
  isolation and on the immediate full rerun; `npm run build` green.

## T-044 — Self-serve feedback form → connect@luxordev.com
- Date: 2026-07-23 · branch: task/feedback-form · commit: (pending)
- **Files created:**
  - `src/app/api/feedback/route.ts` — POST handler: parses `{businessId, message, category?}`, validates
    message required + length-capped (max 2000 chars), rejects empty/whitespace-only messages, passes through
    `verifyAuthAndRole` with roles `[owner, staff, viewer, superadmin]`, calls `sendFeedbackEmail` from
    `src/lib/notify.ts`, returns 200 on delivered, 503 on unconfigured, 502 on send failure. No anonymous
    endpoint — authentication cookie required.
  - `src/app/api/feedback/__tests__/route.test.ts` — 16 tests: success with/without category, missing
    message/businessId, empty/whitespace-only/too-long message, too-long category, non-JSON body, 401 missing
    session, 403 wrong role, 503 unconfigured Resend, 502 delivery failure, correct role pass-through, uid
    fallback when email missing, trimmed whitespace.
  - `src/components/ui/FeedbackForm.tsx` — Controlled dialog component receiving `open`/`onClose` props; reads
    user from `useAuth()`, pre-fills sender info, renders message textarea (2000-char cap with counter),
    optional category dropdown (Bug report/Feature request/Usability/Performance/Documentation/Other), send
    button with `runSingleFlight`-style ref-based single-flight protection, explicit error/success states
    using existing `.button` design tokens and `var(--accent)` color. No new dependencies.
- **Files modified:**
  - `src/lib/notify.ts` — Added `buildFeedbackEmail()` (subject convention `[Feedback] <businessName> — <first ~40
    chars>` per T-043's `[Category]` pattern, branded Luxor AI shell, submitter contact + tenant in body) and
    `sendFeedbackEmail()` (delegates to T-041's `sendEmail`, hardcoded `connect@luxordev.com` recipient).
  - `src/app/company/company-nav.tsx` — Added `MessageSquareText` icon import + `FeedbackForm` import + trigger
    button matching existing `<a>` link pattern (`size={16} strokeWidth={1.75}`) + `<FeedbackForm>` mounting.
  - `src/app/admin/admin-nav.tsx` — Added `MessageSquareText` icon + `FeedbackForm` import + trigger button
    in Tools section matching `nav-link`/`nav-link-icon` pattern (`size={15} strokeWidth={1.75}`) +
    `<FeedbackForm>` mounting.
- Edge cases covered: Resend not configured → 503 explicit error (never false success); empty/whitespace-only
  message rejected client + server; send button disabled during flight via ref-based lock; message length capped
  at 2000 chars server + client; category length capped at 100 chars; superadmin allowed alongside regular roles.
- No unauthenticated endpoint, no general support-ticket system, no new dependencies, no raw Resend call.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 27 warnings (baseline drifted to 27
  pre-existing — none from T-044 files, confirmed via targeted grep); `npm test` 28 files / 287 tests green
  (271 baseline + 16 new feedback route tests); `npm run build` green with `/api/feedback` route confirmed in
  build output.
- **T-041 migration note:** Currently calls `sendEmail` directly from `sendFeedbackEmail` (same pattern
  `notify.ts` already uses for `sendCrewAssignment`/`sendCustomerConfirmation`/`sendBusinessWelcomeEmail`).
  When T-041's `sendWithLedger` is adopted more broadly, migrate this call site onto it for delivery tracking.
- Co-Authored-By: Claude <noreply@anthropic.com>

## T-044/T-045 — Integrator review
- Date: 2026-07-24 · reviewed in worktrees `air-wt-feedback-form` (`task/feedback-form`) and `air-wt-icon-sweep`
  (`task/icon-sweep`) before merge.
- **T-045: APPROVE, merged without rework** (commit `d8e9c35`). Independently reproduced: type-check clean,
  lint 0/27, build green; `verify.test.ts` timed out once under concurrent load, passed 15/15 in isolation
  immediately after (same known-flaky pattern documented in AGENTS.md, not a regression). Spot-checked the
  three largest diffs (`jobs/[jobId]/page.tsx` 173 lines, `admin/businesses/[businessId]/config/page.tsx` 79
  lines, `company/field/page.tsx` 80 lines, incl. a hand-rolled mic `<svg>` replaced by lucide's `Mic`) — all
  proportionate icon-only additions, no text/vocab/layout changes. Verified the "4 pages have no lucide import"
  claim: all four (`company/agent`, `company/appointments`, `company/leads`, `admin/page.tsx`) are genuinely
  content-free redirect stubs. Repo-wide scan for leftover icon-shaped emoji found a handful of inline `✓`/`🎉`
  characters inside toast/status *sentences* (e.g. "✓ Settings saved successfully.") rather than nav
  rows/buttons/headers — outside the task's own scope definition; one borderline case, a button label
  `"✓ Confirm + email"` in `calendar/page.tsx`, could reasonably have been swapped too. Cosmetic, non-blocking,
  not sent back for rework.
- **T-044: two real defects found and fixed directly** (commit `eaeb606`, small/unambiguous/same-pattern-as-
  existing-code — not sent back). (1) `route.ts` called `sendFeedbackEmail` with `businessName: businessId`,
  never looking up the business doc — every other email call site in this repo (`send-confirmation/route.ts`,
  `agentTools.ts`) resolves the real `businessName` from Firestore, and the whole point of the subject
  convention (`[Feedback] <businessName> — ...`) is triage-friendly identification, not a slug. The route's
  own test had baked the bug in as an expected value. Fixed by fetching `businesses/{businessId}`, falling
  back to `businessId` only if the doc/field is genuinely absent; added a test for that fallback path. (2) The
  new Feedback `<button>` in `company-nav.tsx` had no `className`, but `.company-nav a` in `globals.css` is
  scoped to anchor tags only — the button would have rendered with default browser chrome next to properly
  styled nav links (the admin-nav.tsx version was fine; it correctly reused `className="nav-link"`). Fixed
  with a new `.company-nav-trigger` class mirroring `.company-nav a`'s rules — deliberately not a
  `.company-nav button` descendant selector, which would have leaked flex/gap styling into `FeedbackForm`'s
  own Cancel/Send buttons rendered inside the same `<nav>` subtree. **Residual gap, documented not blocking:**
  MASTER_PLAN's T-044 "Tests" line asks for "component test for the form's submit/disable/error states";
  only the route-level test exists, no `FeedbackForm.tsx` component test — the feature is otherwise fully
  covered at the route level and is simple enough to spot-check manually; not worth blocking Phase 4's close
  over. Re-verified after both fixes: type-check clean, lint 0/27, **288/288 tests**, build green.
- Merged both into `main` locally (`Integrate T-045` then `Integrate T-044`); `TODO.md`/`IMPLEMENTATION_LOG.md`
  were the only conflicts (both workers' own status-row/log entries, kept both sides), zero code conflicts as
  designed — file-overlap prediction (both touching `company-nav.tsx`/`admin-nav.tsx`) did not materialize:
  T-045's diff never touched either nav file.

## T-050 — Deterministic release suite + merge gating
- Date: 2026-07-25 · branch: `task/release-suite` · commit: this commit
- Added a dedicated 16-test release gate under `tests/release/**`, invoked with its own config so the owned
  scope remains intact and the root `vitest.config.ts` include pattern is unchanged. The suite runs files
  sequentially with retries disabled and mocks provider boundaries; it performs no live network or browser
  automation.
- Route-handler acceptance evidence:
  - Vapi: real `NextRequest` → real webhook `POST`; missing/wrong/unconfigured secrets stop before
    Firestore or booking work, while a valid booking executes once and the replay returns `{duplicate:true}`.
  - Cron: all four protected routes (`daily-call-summary`, `faq-suggestions`, `follow-up-calls`, and
    `retention`) return 401 for missing and wrong Bearer tokens before Firestore or provider work.
  - Duplicate effects: two distinct webhook deliveries for the same logical escalation traverse the real
    webhook handler, real `agentTools.escalateCall`, and real operation ledger; mocked Resend is called once
    and the ledger finishes with one successful attempt.
  - Calendar rollback: an injected appointment-create failure after scheduling-lock writes are staged leaves
    neither locks nor an appointment in the transactional Firestore fake.
  - Provider readiness: `/api/transcribe` and `/api/jobs/[jobId]/field-audio` return explicit 503 “not
    configured” responses with no OpenAI construction, upload conversion, provider call, or persistence when
    `OPENAI_API_KEY` is absent.
- Extended `.github/workflows/ci.yml` rather than replacing it: the existing `npm test` step remains, followed
  by `npx vitest run --config tests/release/vitest.config.ts`. Added `tests/release/README.md` with the
  no-retry flaky-test quarantine policy and owner instructions for NH-7 branch protection requiring
  **CI / gate** on `main`; no GitHub repository setting was changed.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 27 existing warnings; `npm test`
  28 files / 288 tests green; release suite 5 files / 16 tests green; `npm run build` green; `git diff --check`
  green. No production code or dependencies changed; no removals.

## T-051 — Remove dead Settings import
- Date: 2026-07-25 · branch: `task/cleanup-sweep` · commit: this commit
- Removed the unused `useSearchParams` import from `src/app/company/settings/page.tsx`; the page already gets
  its tenant context from `useBusinessId()` and never read search params directly.
- Repo-wide evidence: `rg -n -F useSearchParams` found the Settings occurrence only at the import while every
  other importing module also had a call; `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` reported
  this as the sole unused source symbol. After removal, lint warnings dropped from 27 to 26.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 26 existing warnings; isolated
  `src/test-utils/example-lib.test.ts` 2/2 and full `npm test` 28 files / 288 tests green. The first full-suite
  run had one unrelated timeout in that smoke-test file after its expected auth-mismatch path completed; the
  isolated rerun and immediate full rerun both passed.

## T-051 — Remove unreferenced after-hours wrapper
- Date: 2026-07-25 · branch: `task/cleanup-sweep` · commit: this commit
- Removed `isAfterHoursNow()` and its comment from `src/lib/tools/agentTools.ts`. The wrapper was never called;
  the live scheduling paths continue to call `isScheduleWithinBusinessHours()` directly.
- Repo-wide evidence: exact symbol grep across tracked and hidden text found only the declaration. Graphify
  showed a degree-2 node with only its containing file and its outgoing call to
  `isScheduleWithinBusinessHours()`—no incoming caller, import, route-table entry, or string/dynamic reference.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 26 existing warnings; `npm test`
  28 files / 288 tests green.

## T-051 — Deduplicate notification delivery state
- Date: 2026-07-25 · branch: `task/cleanup-sweep` · commit: this commit
- Removed the duplicate four-value `NotificationDeliveryState` union from `src/lib/tools/agentTools.ts`.
  `src/lib/comms/send.ts` remains the single definition; `agentTools.ts` imports that type for its own return
  annotation and re-exports it so the two live scheduling routes keep their existing import path.
- Repo-wide evidence: exact symbol grep found only the two identical definitions, their local return/status
  annotations, the two route imports, and historical documentation. The follow-up import audit confirmed the
  routes consume the `agentTools.ts` export, so the type-only re-export was retained as compatibility code;
  no runtime import, lookup, notification implementation, or route contract changed.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 26 existing warnings; `npm test`
  28 files / 288 tests green.

## T-051 — Remove unused configuration declarations
- Date: 2026-07-25 · branch: `task/cleanup-sweep` · commit: this commit
- Removed the unused `Capability` export from `src/lib/config/env.ts`; the capability registry remains live
  through `getCapabilityStatus()` and `getCapabilityReport()`.
- Removed unused `.env.example` declarations for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the three
  Google Calendar OAuth variables. No source or script reads any of them; the lone remaining
  `TWILIO_AUTH_TOKEN` mention is a historical onboarding instruction to implement a future integration, not a
  runtime consumer. Removed the stale `.env.example` `VAPI_AUTH_BYPASS` comment because T-010 already removed
  that behavior; negative tests still set the name deliberately to prove it cannot bypass webhook auth.
- Repo-wide evidence: exact identifier searches plus a complete scan of static `process.env.X`, indexed
  `process.env["X"]`, `getEnv("X")`, and `requireEnv("X")` reads found no live reader for any removed
  declaration. `Capability` appeared only at its declaration. Live model, Firebase, Vapi, Resend, cron, demo
  seed, and optional `VAPI_BASE_URL` names remain documented.
- **Retained after evidence review:** the protected T-034 legacy `?key=` path is still consumed by
  `src/app/field/page.tsx`, posted to `/api/field/exchange`, routed to `exchangeLegacyFieldKey()`, and covered
  by route/guard tests, so `src/lib/auth/verifyRole.ts` was not touched. Redirect-only `/company/agent`,
  `/company/appointments`, and `/company/leads` remain compatibility routes because there is no migration
  evidence for external bookmarks. Four pairs of byte-identical local helpers found by AST hashing are all
  called; consolidating them would require an additive shared-module refactor, prohibited by this
  subtractive-only task. Module-import reachability found no orphan component/hook/lib file, and TypeScript
  with `allowUnreachableCode=false` found no unreachable branch. `CallSession`, `UserBusinessMembership`, and
  `SuperadminProfile` remain intact as required.
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 26 existing warnings; `npm test`
  28 files / 288 tests green; release suite 5 files / 16 tests green; `npm run build` green.

---

## T-052 — Documentation reconciliation

- **Date:** 2026-07-25 · **Branch:** `task/doc-reconciliation` · **Worker:** Worker D (Deepseek V4 Pro)

### CLAUDE.md updates

- Updated "Remaining" items (line 85): mobile responsiveness marked done (2026-07-04); SMS/Twilio noted
  as deferred post-T-051 Twilio-env-removal (no active Twilio integration in source).
- Architecture layers (line 93): replaced `logAgentAction` (internal audit function, not a Vapi-exposed
  tool) with the canonical seven-tool list.
- Core Routes table (line 136): `DELETE /api/calls/:callId` description updated — T-042 changed it from
  "end call without deleting audit trail" to real PII redaction with audit-skeleton retention.
- Admin onboarding deploy step (line 174): Twilio webhooks superseded by Vapi (T-010); Google Calendar
  reference removed (not implemented).
- Key Files listing (line 186): `verify.ts` description updated — VAPI_AUTH_BYPASS removed by T-010,
  now fail-closed with timing-safe compare + Firestore-based replay guard.
- Key Files listing (line 234): `notify.ts` description updated — SMS seam removed by T-041 unified
  comms service; now a thin BizBranding wrapper around `src/lib/comms/send.ts`.
- Known Limitations (line 291): SMS entry rewritten — no active SMS seam in source post-T-051 cleanup;
  Twilio integration is superseded, env declarations removed.

### HANDOFF.md updates

- Root `HANDOFF.md` (line 142): marked VAPI_AUTH_BYPASS posture as superseded by T-010 with a pointer
  to `src/lib/vapi/verify.ts` (fail-closed webhook auth).
- `docs/HANDOFF.md`: added superseded notice at top. This doc is from 2026-05-28, pre-release-plan,
  describing a Twilio/Claude-Haiku architecture that was superseded by Vapi months ago. Retained for
  historical reference per task rules (never delete history, mark it superseded instead).

### .env.example

- Added `ENABLE_LEGACY_FIELD_KEY_FALLBACK` with a comment. This env var is read by
  `src/lib/auth/verifyRole.ts:182` (T-034 legacy `?key=` path) and was the only runtime env var
  missing from `.env.example` when cross-checked against every `process.env.X` read in `src/` and
  the capabilities map in `src/lib/config/env.ts`.
- `TWILIO_PHONE_NUMBER=` left in place — T-051 removed `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` but
  preserved this one (it is referenced by the older `scripts/seed-demo-business.ts` script).

### Onboarding guide (public/guides/onboarding-guide.html)

- Cover page: bumped version from 2.0 to 2.1 (July 2026).
- Vapi Step 7 (line 962): replaced the `VAPI_AUTH_BYPASS=true` / "leave secret blank" instruction with
  proper webhook secret configuration (generate a strong random value, set in both Vapi dashboard
  Server URL → Secret and Vercel `VAPI_WEBHOOK_SECRET`).
- Go-live checklist (line 1185): replaced "Secret field left blank (VAPI_AUTH_BYPASS=true)" with
  "Webhook secret configured and matching between Vapi dashboard and Vercel."
- Phase 4 Step 1 (line 1087): updated to mention the password-reset welcome email sent by T-043
  (from `no-reply@luxordev.com`) alongside the temp password shown on the wizard success screen.
- Phase 4 Step 3 (line 1108): updated to reference the password-reset email.

### docs/SESSION_HANDOFF.md (read-only — flag only)

- The file references the branch as `task/feedback-form` (line 21); the actual branch name is
  `task/doc-reconciliation`. Flagged for integrator reconciliation at merge time.
- The file still shows T-051 as unmerged ("pending reviews: none — T-050 reviewed and merged") —
  predates the T-051 merge in this same session cycle. Also flagged for integrator.

### Verification

- `npm run type-check` — clean (docs-only task; no code changed).
- `graphify . --update` — incremental update invoked (docs-only scope, no full rebuild warranted).

Co-Authored-By: Claude <noreply@anthropic.com>

## T-046 — Demo Studio richness + parity audit

- **Date:** 2026-07-25 · **Branch:** `task/demo-polish` · **Commit:** `356285b` · **Worker:** Worker D (Deepseek V4 Pro)

### Seed richness

- **Expanded RESOURCES from 3 to 5 per vertical** per the HANDOFF.md roster (2026-07-15 backlog entry):
  - Roofing: Carlos Crew, Tyler Crew, Storm Response, Gutter Team, Repair Crew
  - HVAC: Marco R., Denise K., Luis T., Raj P., After-hours On-call
  - Landscaping: Luis Crew, Ana Crew, Tree & Removal, Design & Install, Irrigation Team
  - Cleaning: Team A — Rosa, Team B — Nadia, Team C — Gina, Deep Clean Crew, Post-Construction Crew
  - Dental: Dr. Rivera, Dr. Chen, Dr. Park, Hygiene — Sam, Hygiene — Jess
  - Property Management: Ace Plumbing, BrightSpark Electric, CoolBreeze HVAC, On-call Manager, Turnover Crew
  - General Contractors: Dave's Crew, Framing Crew, Finish Carpentry, Drywall Crew, Concrete Crew
- **Expanded jobs from 3 to 14** for field-service verticals with mixed stepper statuses: 3 inspection, 3 quoted,
  3 in_progress, 2 invoiced, 2 open, 1 complete — so the Dashboard + Jobs tabs show variety at a glance.
- **Expanded appointments from 3 to 15** for all verticals: 8 confirmed + assigned (solid), 3 provisional/requested
  (grey-dashed), 2 unassigned (drag targets), 1 after-hours pendingConfirmation with email (Dana Cole — Dashboard
  approval demo persists), plus 1 more unassigned.
- **Expanded CALLERS from 6 to 18, ADDRESSES from 5 to 13** to support the larger dataset without repetition.

### Collision fix re-verified

- jobCounter set to `1000 + seed.jobs.length` (=1014); seeded jobs use `J-1001` through `J-1014`; next real
  job starts at `J-1015` — no collision possible at higher volume.

### Parity audit

- Code-level audit confirmed **zero** conditionals in `src/app/company/**/page.tsx` or `src/app/admin/**/page.tsx`
  that check for `demo`/`isDemo` to render a different component. The `/admin/demo` launch button leads to
  `https://ai-roof.vercel.app/company/dashboard?preview=demo-roofing` — the identical route, layout, and
  components a real tenant uses. The only difference is which Firestore `businessId` data is loaded, resolved
  by `useBusinessId()` treating the `?preview=` value as an alias with no special rendering path.

### Verification

- Throwaway per-vertical seed script confirmed all 7 verticals pass: resources ≥ 5, jobs ≥ 12, appointments ≥ 12,
  unassigned ≥ 1, provisional ≥ 2, pendingConfirmation ≥ 1.
- `npm run type-check` clean; `npm run lint` 0 errors / 26 baseline warnings; `npm test` 290/292 (2 known
  concurrent-load flake); `npm run build` green. All 12 existing `demo-customize` route tests pass.

### Prohibited scope untouched

- `calendarMode`/`vocab`/`disabledModules` semantics unchanged (protected, `templates.ts` untouched). No new
  features, no separate demo environment, no visual redesign.

---

## T-049 — Outbound email consistency + branding pass

- **Date:** 2026-07-25 · **Branch:** `task/demo-polish` · **Commit:** `b7001db` · **Worker:** Worker D (Deepseek V4 Pro)

### Subject-line standardization

Standardized every outbound email subject onto the `[Category] Specific detail` convention, extending the
`[Category]` pattern T-043 (`[Luxor AI]`) and T-044 (`[Feedback]`) already established.

| File | Before | After |
|---|---|---|
| `notify.ts` `buildCrewAssignmentEmail` | `New assignment: <title> — <when>` | `[Assignment] <title> — <when>` |
| `notify.ts` `buildCustomerConfirmationEmail` | `Appointment confirmed — <when>` | `[Appointment] Confirmed — <when>` |
| `agentTools.ts` bookAppointment (L538) | `New Appointment Request — <name>` | `[Appointment] New Request — <name>` |
| `agentTools.ts` escalateCall (L772) | `URGENT: Call Escalation — <biz>` | `[Escalation] <biz>` |
| `send-confirmation/route.ts` (L70) | `Appointment Confirmed — <name> · <date>` | `[Appointment] Confirmed — <name> · <date>` |
| `admin/invoices/[invoiceId]/send/route.ts` (L101) | `Invoice <id> from Luxor AI` | `[Invoice] <id> from Luxor AI` |
| `jobs/[jobId]/invoice/send/route.ts` (L165) | `Draft Invoice #<id> from <biz>` | `[Invoice] Draft #<id> from <biz>` |
| `jobs/[jobId]/report/send/route.ts` (L100) | `Job Report — <title> from <biz>` | `[Report] <title> from <biz>` |

Already-compliant (unchanged): `buildBusinessWelcomeEmail` (`[Luxor AI]`), `buildFeedbackEmail` (`[Feedback]`).

### Tests

- Extended `src/lib/comms/__tests__/send.test.ts` with 4 subject-format assertions:
  `buildCrewAssignmentEmail` (`[Assignment]` prefix), `buildCustomerConfirmationEmail` (`[Appointment]` prefix),
  `buildBusinessWelcomeEmail` (`[Luxor AI]` prefix), `buildFeedbackEmail` (`[Feedback]` prefix). All 4 pass.

### Protected scope untouched

- Tenant-facing `logoUrl` logic (`agentTools.ts:853-859`) — not touched. Luxor-authored system emails already
  correctly carry the Luxor mark. No email body/template redesign. No send-logic changes (T-041 delivery-status
  contract untouched).

### Documentation

- Created `docs/EMAIL-CONVENTIONS.md` documenting the full convention, all 10 call sites with file:line
  references, the 7 category prefixes, and the tenant-branded vs system-email distinction.

### Verification

- `npm run type-check` clean; `npm run lint` 0 errors / 26 baseline warnings; `npm test` 290/292 (2 known
  concurrent-load flake, confirmed clean in isolation, 4 new subject-format assertions all pass); `npm run build`
  green.

Co-Authored-By: Claude <noreply@anthropic.com>

---

## T-048 — Voice-note retry + parse-field-update model comparison

- **Date:** 2026-07-25 · **Branch:** `task/ux-resilience` · **Commit:** this commit
- Added one bounded, in-memory retry to the recorded-audio upload in `useFieldAudio.ts`. The hook serializes
  the recorded blob once and reuses the same URL, headers, and JSON body for one automatic re-POST after either
  a network exception or a non-success HTTP response. A second failure returns to the existing honest
  `error` state; there is no persistence, background queue, reload recovery, correction-card change, or
  Whisper-prompt change.
- Added unit coverage for fail-then-succeed, fail-then-fail, and HTTP-failure-then-success. The assertions
  prove exactly two calls and byte-for-byte-equivalent request arguments across attempts.
- Added a fixture-driven comparison gate using four anonymized field-note transcripts already captured in
  repository documentation/tests, plus all four adversarial `fieldUpdate` output fixtures from
  `src/lib/schemas/__tests__/fixtures/adversarial.ts`. The scorer detects missing or incorrect extracted facts,
  and the adversarial corpus remains fail-closed through the production schema parser.
- **Live model comparison (same production prompt, temperature `0.1`, 2026-07-25):**
  - `gpt-4o`: **14/15 facts (93.3%)**, 3,363 input + 464 output tokens, measured batch cost **$0.013048**.
  - `gpt-4o-mini`: **13/15 facts (86.7%)**, 3,363 input + 635 output tokens, measured batch cost
    **$0.000885** (93.2% less for this run).
  - Both models missed the fixture's expected medium severity for the stated drip-edge follow-up; mini also
    downgraded the explicitly rotted roof decking instead of retaining the expected high severity. That is a
    **6.6 percentage-point regression**, so `src/lib/ai/registry.ts` deliberately remains on `gpt-4o`.
    The cheaper-model swap was not forced and is recorded as a finding, per acceptance criteria.
- Cost basis: OpenAI's model pages list standard text-token prices per 1M tokens as `gpt-4o`
  $2.50 input/$10.00 output and `gpt-4o-mini` $0.15 input/$0.60 output (94% lower unit rates):
  <https://developers.openai.com/api/docs/models/gpt-4o> and
  <https://developers.openai.com/api/docs/models/gpt-4o-mini>.
- Verification: targeted T-048/registry suite **33/33**; `npm run type-check` clean; `npm run lint`
  0 errors / 26 baseline warnings; isolated rerun of two known timeout-prone unchanged files **18/18**;
  immediate solo `npm test` **30 files / 294 tests green**. No API key or model output containing credentials
  was written to source; temporary pulled environment files were removed after the comparison.

---

## T-047 — Navigation friction, first-login Guide nudge, and onboarding stepper

- **Date:** 2026-07-25 · **Branch:** `task/ux-resilience` · **Commit:** this commit
- Reordered the desktop/mobile company nav around common workflows (Dashboard → Jobs → Calendar → Calls)
  without changing `MODULE_ROUTES`, `useBusinessModules()`, auth logic, or API role gates. Added compact
  module-gated mobile header shortcuts for Jobs, Calendar, Calls, and the Crew roster; the full hamburger nav
  remains available and still closes on route changes.
- Added a one-time `Start here` Guide nudge for non-superadmin company users. It links to `/company/guide`,
  marks itself seen in `localStorage` using a per-user/versioned key when first presented, can be dismissed,
  and does not recur on reload or a later login in the same browser. Superadmin preview sessions are excluded.
- Converted admin onboarding from six simultaneously displayed panels plus a passive list into one connected
  six-step form: visible `Step N of 6` progress, progressbar semantics, per-step validation, Back/Next,
  completed-step revisiting, keyboard-native buttons, retained form controls while panels are hidden, and
  tenant creation only on the final Launch Readiness step. The existing `/api/admin/businesses` URL, POST
  payload construction, inactive-tenant default, success/error states, dirty-navigation guard, and
  one-time credential display are unchanged.

### Click-path audit

Counts start from an authenticated company page. A click/tap or drag/drop gesture counts as one interaction;
typing does not. Management flows apply to owner/staff and superadmin-in-preview; field workers remain on the
field-key-gated `/field` capture surface and receive no new management navigation.

| Flow | Desktop before → after | Mobile before → after | After path |
|---|---:|---:|---|
| Create job | 3 → 3 | **4 → 3** | Jobs shortcut → New job → Create job |
| Schedule | 3 → 3 | **4 → 3** | Calendar shortcut → drag/drop → Confirm + email |
| Send invoice | 4 → 4 | **5 → 4** | Jobs shortcut → open job → Generate invoice → Send invoice |
| Add crew | 3 → 3 | **4 → 2** | Crew roster shortcut → Add crew |
| View call | 2 → 2 | **3 → 2** | Calls shortcut → select call |

- Added six deterministic tests recording all five before/after paths, asserting no desktop regression and a
  mobile reduction for every flow, documenting role scope, verifying the per-user Guide storage key, proving
  all six onboarding panels remain connected, and checking all 23 existing POST-contract form fields remain.
- **Playwright deviation:** a live local server reached HTTP 200, but the installed browser-control runtime
  exposed no in-app or Chrome browser backend (`browsers.list()` returned empty), and this repo has no
  Playwright dependency. Per scope, no dependency was installed and no browser run is claimed. The same 2–3
  representative paths remain recorded as deterministic click-path fixtures above; an authenticated live
  Playwright replay is the sole environment-limited verification item for reviewer follow-up.
- Verification: focused T-047 suite **6/6**; `npm run type-check` clean; `npm run lint` 0 errors /
  26 baseline warnings; initial full suite had only the documented unchanged `example-lib.test.ts` import
  timeout, isolated rerun **2/2**, immediate solo `npm test` **32 files / 300 tests green**; final batch
  `npm run build` green (48 static pages generated, `/admin/onboarding` and company routes included).

---

## 2026-08-23 — Evidence-driven maintenance cleanup and documentation reconciliation

- **Baseline:** fast-forwarded local `main` from `f865c99` to the verified remote tip `cfa6102`. Preserved the
  owner's existing `.claude/settings.local.json` Playwright permission additions. No commit or push performed.
- **Static evidence:** repo-wide exact-identifier/script-name searches, strict TypeScript unused/unreachable
  checks, and `knip` were run before removal. Dynamic Next routes, manual operational scripts, Firestore domain
  types, and compatibility redirects were reviewed rather than treated as automatically dead.

### Removed files

- `scripts/seed-demo-business.ts` — broken/superseded TypeScript duplicate; active docs and `AGENTS.md` already
  directed operators to `seed-demo-business.mjs`.
- `scripts/demo-customize.mjs` — bypassed the guarded universal Demo Studio route and duplicated obsolete
  direct-Firestore/Vapi customization behavior.
- `scripts/seed-demo-activity.mjs`, `scripts/seed-demo-clients.mjs`, and the five per-vertical seeders
  (`seed-demo-dental.mjs`, `seed-demo-general-contractors.mjs`, `seed-demo-hvac.mjs`,
  `seed-demo-landscaping.mjs`, `seed-demo-property-management.mjs`) — replaced by `demoSeedFor()` and the one
  `demo-roofing` universal launch/reset route, which now seeds rich calls/leads/appointments/resources/jobs.
- `scripts/grant-superadmin.mjs` — partial UID-only duplicate of retained `provision-superadmin.mjs`, which also
  manages the required custom claim.
- `scripts/cleanup-test-businesses.mjs` — unreferenced one-time destructive script with three hardcoded IDs.
- `src/lib/vapi/__tests__/vitest.config.ts` — unreferenced nested config; root Vitest discovers the suite.

### Removed code and declarations

- Deleted the uncalled `sendCrewAssignment()` wrapper and stale unrelated module-mock exports. The assignment
  API uses `buildCrewAssignmentEmail()` with the ledger-backed comms service.
- Removed unused default exports from both Firebase initialization modules; made `getFirebaseApp()` private.
- Made internal-only timezone/photo/scheduling/replay constants, job projection helpers, ledger error classes,
  Zod schema instances, schema utilities, AI/audit/fixture types, and the release fake-query class private.
  This removes unused public surface without changing runtime logic.
- Kept live collection/domain types (`CallSession`, `CallMessage`, `UserBusinessMembership`,
  `SuperadminProfile`, `FieldAuditEntry`, operation state/failure types) despite static-tool reports, per the
  repository cleanup rule.
- Removed direct `tailwindcss`, `autoprefixer`, and `postcss` dev dependencies: no config, CSS directive, import,
  or build consumer exists. Added direct `@eslint/eslintrc` because `eslint.config.mjs` imports it. Retained
  `pptxgenjs` for the committed pitch-deck generator.
- Removed stale Twilio/script-only variables from `.env.example` after confirming no runtime or retained script
  reads them.

### Dependency maintenance

- Applied the non-breaking audit update set, including Next.js `15.5.18 → 15.5.23`, eliminating the critical
  advisory and reducing the full audit from 30 findings (1 critical/12 high/17 moderate) to 23
  (0 critical/6 high/17 moderate).
- Remaining findings require breaking upgrades (Next.js 16, Firebase 12, Firebase Admin 14) or are isolated to
  the development-only pitch-deck generator. `npm audit fix --force` was deliberately not run.

### Documentation

- Rewrote `docs/README.md`, `docs/TESTING.md`, and `docs/SESSION_HANDOFF.md` as current sources of truth.
- Reconciled `TODO.md`, root `HANDOFF.md`, `CLAUDE.md`, and `.env.example`; marked the pre-Vapi admin/demo plans
  historical instead of deleting them.
- Updated production status using the 2026-08-23 live health check and separated scoped implementation
  completion from the remaining authenticated/provider/legal sign-offs.

### Verification

- `npm run type-check` clean; strict unused/unreachable compiler clean.
- `npm run lint`: 0 errors / 24 warnings (down from 26).
- `npm test`: 32 files / 304 tests green.
- Release acceptance suite: 5 files / 16 tests green.
- `npm run build`: green on Next.js 15.5.23; 48 routes generated.
- Follow-up `knip`: only three documented operational scripts, two explained manual/dynamic dependencies
  (`pptxgenjs`, `eslint-config-next`), and eight protected/domain types remain.
- `git diff --check`: clean.

---

## 2026-08-25 — Owner review, push, and 3-vertical expansion

- **Reviewed and committed** the 2026-08-23 maintenance cleanup exactly as left by Codex (`c8487ed`) — the
  owner's local `.claude/settings.local.json` Playwright permission change was excluded, per the standing rule
  that it belongs to the owner's tooling and isn't part of the app diff.
- **Added three verticals** (`1d2f840`) to close the gap against the owner's requested industry spread
  (roofing, dental, babysitting, contractors, landscaping, electricians, appliance repair, "and other service
  companies"): `electricians`, `appliance-repair` (jobs-mode, same shape as Roofing/HVAC/GC), and `childcare`
  (appointments-mode, same shape as Dental/Property Mgmt). Confirmed via `Object.values(VERTICAL_TEMPLATES)`
  in the onboarding wizard and admin config page that no vertical is ever hardcoded outside
  `src/lib/verticals/templates.ts` — adding one is a template-block edit, not a UI change. The only other
  touch points were `RESOURCES` in `demoSeed.ts` (demo seed already derives jobs/calls/leads/appointments
  generically from the template) and `VERTICAL_ICONS` in `admin/demo/page.tsx`.
- **Updated `public/guides/onboarding-guide.html`** — industry count and card list (seven → ten), quick-reference
  table gained three rows, guide version bumped to 2.2.
- **Verification:** `npm run type-check` clean; `npm run lint` 0 errors / 24 warnings (unchanged baseline);
  `npm test` 32 files / 304 tests, one known concurrent-load flake in `example-lib.test.ts` (confirmed clean on
  isolated rerun, matches the documented pattern from the 2026-08-23 entry); `npm run build` green, 48 routes
  (unchanged route count — no new pages were needed).
- **Pushed** both commits to `origin/main`.

## 2026-09-23 — T-098 Care Homes vertical

- **Commit:** `T-098: add Care Homes vertical` (this commit, on `task/care-homes`).
- Added the care-homes template immediately after Dental: appointments-mode admissions and tour intake, care-family styling, Family/Tour/Coordinator vocabulary, and no Jobs or materials pricing catalog. No demo phone number or clinical workflow was added.
- Resident health, medication, diagnosis, named-resident confirmation, falls, elopement, and alleged neglect have explicit privacy and immediate live-escalation rules. The prompt test checks that those rules reach `buildAgentPrompt`.
- Demo Studio has its own icon; five coordinator rows and the shared appointment seed provide draggable tours and an after-hours pending-confirmation booking with email. The onboarding guide has a Care Homes quick-reference row and pitch card; the industry-count wording remains for the integrator's combined T-098/T-099 update.
- **Verification:** `npm run type-check` passed; `npm run lint` passed with 0 errors / 32 existing warnings; `npm test` passed 78 files / 646 tests; `npm run build` passed; `git diff --check` passed. Care Homes card color `#7f3f55` is distinct from the existing palette and passes 4.5:1 white-text contrast in the palette test.
- **Removals:** none.

---

## T-099 — New vertical: Daycares

- Date: 2026-09-23 · branch: `task/daycares` · commit: `T-099: add Daycares vertical` (single commit,
  this entry ships inside it — hash via `git log --grep "T-099"`).
- Added `daycares` to the `VerticalId` union and a full `VerticalTemplate` block in
  `src/lib/verticals/templates.ts`, inserted immediately after `childcare` (per the merge-cleanliness
  instruction). Shape: `calendarMode: "appointments"`, `family: "care"`,
  `disabledModules: ["jobs","pricing"]`; vocab `customerNoun` Family/Families, `jobNoun` Tour/Tours,
  `resourceNoun` Director/Directors (never "Sitter"); tours/enrollment visits book onto a director or
  enrollment coordinator. Front-office scope only (Brightwheel/Procare/HiMama's enrollment side): openings
  by age group/classroom, tuition, hours, curriculum, required enrollment documents (immunization records),
  waitlist, tour booking, existing-parent routing, staff call-outs. The agent never checks a child in/out,
  never says which children are present, never discusses a named child's day/health/behavior.
- Safety boundaries (daycare equivalent of dental's PHI discipline): `disallowedTopics` includes
  "arranging or authorizing the release of a child… verified by staff in person only", "confirming or
  denying that a specific child is at the center to an unverified caller", "a named child's health,
  behavior, meals, naps, or daily-report details", medical/medication advice, and tuition negotiation;
  `emergencyRules` escalate child injury/allergic reaction immediately (911 if severe), unauthorized-pickup
  attempts / child-whereabouts pressure immediately with no presence confirmation, and unaccounted-for-child
  as urgent immediate escalation.
- Identity: agent "Wren", tone "warm, calm, and safety-first", icon `School`, color `#7c3aed` (verified
  distinct from all 11 existing template colors and from childcare's name/color/icon). No
  `DEMO_LINE_PHONE` entry added; Vapi tools, `agentTools.ts`, and the webhook untouched.
- Consumers fixed: `VERTICAL_ICONS` in `src/app/hub/demo/page.tsx` (School, inserted after childcare) and
  `RESOURCES` in `src/lib/verticals/demoSeed.ts` (Director — Ms. Alvarez, Enrollment Coordinator, Infant
  Room Lead, Toddler Room Lead, Pre-K Room Lead, inserted after childcare). `demoSeedFor("daycares")` yields
  draggable/unassigned appointments plus an after-hours `pendingConfirmation` booking with email.
- Tests: `family-palette.test.ts` care-family membership updated to
  `["childcare","daycares","dental"]` (T-099's gates only — integrator reconciles with T-098's value at
  merge). New `src/lib/verticals/__tests__/daycares.test.ts`, 19 tests, negative-first: (a) disallowedTopics
  cover pickup-release, child-presence confirmation, named-child details; (b) emergencyRules cover
  injury/allergy, unauthorized pickup, unaccounted child; (c) `buildAgentPrompt` output carries those
  boundaries; (d) `demoSeedFor("daycares")` rows > 0, draggable > 0, pendingConfirmation + email present;
  (e) `daycares` and `childcare` remain separate templates with different `vocab.resourceNoun`.
- `public/guides/onboarding-guide.html`: daycares added to the cover industry list, the "Eleven cards" list
  ("eleven" wording left intact for the integrator's final count), the quick-reference table (Wren · Tours →
  Directors · dashboard QR), and the per-industry pitch-card grid (after childcare).
- Verification: `npm run type-check` clean; `npm run lint` 0 errors / 32 warnings (no new warnings — none
  in touched files); `vitest run` 656/658 with the two failures being known concurrent-load timeouts
  (`example-lib.test.ts` verifyVapiWebhook, `company/team/route.test.ts` PATCH outside business) — both
  18/18 clean on isolated rerun; targeted `family-palette.test.ts` + `daycares.test.ts` 23/23;
  `npm run build` green (76 routes, `/try/[vertical]` SSG now 12 verticals including daycares).

---

## T-082 — Honest onboarding line status copy

- Branch: `task/honest-copy`; commit: this T-082 commit.
- Evidence: onboarding wizard and go-live guide now state that inactive is a portal flag, while attached Vapi IDs allow live-call routing. `resolveBusinessId()` remains untouched.
- Owner decision: NH-19 records the risk of silently dropping live calls if an `active` gate is added.
- Verification: `npm run type-check` passed; `npm run lint` passed (0 errors, 32 existing warnings); `npm test` passed (79 files, 663 tests).
- Removals: none.

---

## T-085 — Distinguish customer invoices from Luxor billing

- Branch: `task/honest-copy`; commit: this T-085 commit.
- Evidence: the Job Invoice tab has a muted `.no-print` helper line, outside `.invoice-doc`, and the onboarding demo guide explains the separate Stripe links under `/admin/invoices`.
- Scope: invoice totals, persistence, letterhead, and emailed HTML unchanged.
- Verification: `npm run type-check` passed; `npm run lint` passed (0 errors, 32 existing warnings); `npm test` passed (79 files, 663 tests).
- Removals: none.

---

## T-086 — Keep the revived persisted invoice route

- Branch: `task/honest-copy`; commit: this T-086 commit.
- Evidence: `src/app/api/jobs/[jobId]/invoice/route.ts` exports GET, POST, PATCH; POST returns an existing invoice unless `force` rebuilds a still-draft invoice. `src/app/company/jobs/[jobId]/page.tsx` calls GET for hydration, POST for generation/regeneration, and PATCH for draft autosave.
- Decision: TODO marked stale and closed. No route or caller was deleted.
- Verification: `npm run type-check` passed; `npm run lint` passed (0 errors, 32 existing warnings); `npm test` passed (79 files, 663 tests); the once-per-batch `npm run build` passed (77 static pages).
- Removals: none.

---

## T-083 � Add "Create Job" to the Leads side of Pipeline
- Date: 2026-09-23 � branch: task/pipeline-links � commit: 48fe6f3
- Lead Detail gains the same Create action Appointments has, sharing ONE prefill handshake
  (new pure src/lib/pipeline/jobPrefill.ts � buildJobPrefillUrl) used by both createJob(appt) and
  createJobFromLead(lead): same /company/jobs route, name/phone/address/service params, plus the lead's
  notes and leadId (the form's auto-open trigger, additive in jobs/page.tsx alongside ?notes).
- Label is vocab-driven (\Create \\ � Pickup/Service call/Job/�) and gated on
  \modulesReady && isEnabled("jobs")\ exactly like company/layout.tsx's MODULE_ROUTES, so
  jobs-disabled tenants (dental, childcare, care homes, daycares, property management) see no dead
  button; the Appointments tab's previously hardcoded, ungated "Create Job" button was gated/labeled
  identically (same owned file, kills its pre-existing dead button for those tenants).
- Customer-snapshot rule preserved: prefill copies lead fields flat into the Jobs form; no leadId
  stamped on Job (type has no such field, and no jobs API change was in scope).
- Deviation (logged): minimal 6-line change to src/app/company/jobs/page.tsx (not in the owned list,
  but strictly needed � the shared mechanism only prefills notes and auto-opens if the receiver reads
  ?notes/?leadId; file is owned by no parallel worker and jobs/[jobId]/page.tsx was untouched).
- Evidence: tsc clean; eslint 0 errors / 32 warnings (no new warnings in touched files); vitest 673/673
  (+5 jobPrefill tests); next build green.

## T-084 � Link a call's transcript forward to the lead/appointment it produced
- Date: 2026-09-23 � branch: task/pipeline-links � commit: d0bcdcc
- Calls page now fetches the leads+appointments lists (both routes already return full docs incl.
  sourceCallId � no API field added) and resolves the selected call via new pure
  src/lib/pipeline/callLinks.ts (findCallLinks, matches sourceCallId); renders "View lead" /
  "View appointment" .button links deep-linking to Pipeline with ?preview= preserved. Nothing renders
  when the call produced neither (no dead link); the link lookup is best-effort and can never fail the
  transcript view.
- Pipeline: added the matching ?lead=<id> deep link � lead- anchor id + accent ring highlight +
  scrollIntoView, mirroring the existing appt- pattern (the ?lead= selection logic already existed).
- Evidence: tsc clean; eslint 0 errors / 32 warnings (no new warnings in touched files); vitest 673/673
  (+5 callLinks tests); next build green.

## T-100 — Structured per-industry intake fields
- Date: 2026-09-23 · branch: task/intake-fields · commit: 3021d58
- VerticalTemplate gains a required `intakeFields: IntakeField[]` block (key, label,
  type text|select|yesno|date, optional options, appliesTo lead|appointment|both, required?: false —
  the only legal value is false/absent so a field can never be marked required). All 13 verticals
  declare 2–4 fields (dental: new-vs-returning + insurance + provider; hvac: system type/age/issue;
  property mgmt: unit #, issue type, urgency, permission-to-enter (appointment-only); roofing: roof
  type, insurance claim, active leak; cleaning: home size/bathrooms/frequency/pets; care homes &
  daycares: front-office only — see hard rule below). Record<VerticalId, …> exhaustiveness made tsc
  fail until every vertical declared it.
- buildAgentPrompt now emits a config-driven "## Intake Details" section (from the business's
  industry template; unknown industry fails open to no section): ask one at a time, never an
  interrogation, never required / never stall — skip if the caller is in a hurry or it's an
  emergency — and record answers into the existing "notes" parameter as parseable "Label: value"
  lines. No Vapi tool schema change (the dashboard schema is NH-1 human-verified): intake rides the
  existing notes param.
- agentTools: new pure helpers intakeFieldsForIndustry / parseIntakeFromNotes / mergeIntake /
  resolveIntake; bookAppointment and createLead persist an optional
  `intake: Record<string,string>` on the lead/appointment, parsed from "Label: value" notes lines
  keyed against that business's template labels (explicit input.intake map wins; free-text notes are
  kept untouched, so legacy docs render exactly as before). Lead/Appointment types gain the optional
  intake field — backward compatible.
- Pipeline lead detail + appointment cards render intake as labeled rows using the template's labels
  (dental sees "Insurance", property management sees "Unit number"); jobPrefill's buildJobPrefillUrl
  merges intake into the job notes param as "Label: value" lines via formatIntakeLines, and the
  appointment→job path now also carries the appointment's free-text notes (previously dropped).
- Hard rule: care-homes + daycares intake is front-office only — care level / room preference /
  desired move-in date, and child age RANGE / program / desired start date; no free-text fields, and
  tests assert no health or identifying terms (diagnoses, allergies, medications, conditions,
  presence/whereabouts, names, DOB) in their labels/options or prompt sections.
- Tests: intake-fields.test.ts (completeness/validity/hard rules, 13 verticals), tools intake.test.ts
  (parse/merge/precedence + createLead/bookAppointment persistence via an in-memory Firestore fake +
  legacy-doc behavior), agentPromptBuilder intake-section tests (per-vertical output, hurry/emergency
  skip, Label: value instruction, care-homes/daycares section scan, every vertical renders a
  section), jobPrefill intake-lines tests.
- Evidence: tsc clean; eslint 0 errors / 32 warnings (baseline unchanged, no new warnings in touched
  files); vitest run 717/717 (up from 673); next build green (77 routes, /company/pipeline 129 kB
  unchanged).

---

---

## T-101 — Per-industry starter kits and dashboard tiles

- Date: 2026-09-23 · branch: `task/starter-kits` · commit: this T-101 commit.
- All 13 verticals declare a StarterKit and 2–3 dashboard tiles through typed Record<VerticalId, …> values. Pricing-disabled verticals have no starter material or labor entries; every price is labeled "placeholder — edit to match your rates". Every vertical has downloadable document templates; care-home and daycare copies stay at the front office.
- Library's Load starter kit button calls an owner/staff/superadmin-gated route. A Firestore transaction merges only missing catalog and document entries, preserves tenant edits and prior deletions via import markers, and returns no-store responses. Unknown industries get no kit. The dashboard uses existing lead, appointment, and job records; unknown industries retain the generic tiles.
- Evidence: type-check green; lint 0 errors / 32 existing warnings; full vitest run 683/683 after final edits, focused starter-kit tests 10/10; next build green with /api/company/library/starter-kit present. No files removed.

---

## T-102 — Per-tenant call-recording disclosure

- Date: 2026-09-23 · branch: `task/recording-notice` · commit: this T-102 commit.
- New `recordingDisclosure?: { enabled: boolean; text?: string }` on BusinessConfig (additive, own hunk in `src/types/index.ts`). Missing field = DEFAULT ON with a drafted default sentence — English and a Spanish variant (used when `agentLanguage` is "es") — no migration, existing tenants get it. The default wording is labeled a draft, not legal advice, in both code comments and the settings UI.
- New pure module `src/lib/recordingDisclosure.ts`: `resolveRecordingDisclosure` (fail-open — malformed stored values never throw, stay default-on), `composeGreetingWithDisclosure` (one sentence spoken FIRST, before any custom greeting — deterministic, no greeting parsing), `validateRecordingDisclosureText` (300-char cap, no HTML), shared by server and the settings page so the live preview and the live line can never drift.
- Composed into BOTH greetings at every render/push site: the webhook `assistant-request` path (`src/app/api/webhooks/vapi/route.ts`), the settings persona push (`src/app/api/company/settings/route.ts` — now also pushes when the disclosure changes, without touching the transcriber on a disclosure-only save), and the demo-customize persona push (`src/app/api/admin/demo-customize/route.ts`). `updateAssistantPersona`'s speaking-plan preservation is untouched (no edit to vapiClient); voices.ts and the admin business-config page are not touched (T-103's files).
- `buildAgentPrompt` gains a short `## Call Recording` section: calls may be recorded and transcribed, and if a caller asks, answer honestly in one short sentence — present in both the on and off states (off adds "do NOT volunteer").
- Company Settings gets a "Call Recording Notice" panel (owner/superadmin only, matching the TeamPanel gate): toggle, wording textarea with live character count, a live preview of the composed business-hours and after-hours greetings, and a note that wording should be reviewed by counsel. `GET /api/company/settings` now also returns `greeting`/`afterHoursGreeting`/resolved `recordingDisclosure` (semiStatic tier, private — no caching change). `PUT` validates shape/text (400 on >300 chars or HTML) and 403s staff on this field only.
- Evidence: type-check green; lint 0 errors / 32 warnings (baseline, none in touched files); `vitest run` 760/760 (36 new across three suites: recordingDisclosure module 17, agentPromptBuilder T-102 block 4, settings recording-disclosure route tests 15); `next build` green, `/company/settings` 111kB -> 116kB (the new panel). No files removed.

---

## T-103 — Per-tenant and per-language voice override

- Date: 2026-09-23 · branch: `task/voice-override` · commit: this T-103 commit.
- Added optional English and Spanish `VoiceRef` overrides to `BusinessConfig`. The superadmin config page can save or clear each one; the PUT route validates the exact provider, voice ID, and model shape before storage. No hardcoded Savannah default remains.
- Persona pushes choose only the configured voice for the pushed language. With no override, the PATCH omits `voice`, preserving the dashboard-selected live voice. The existing speaking-plan readback and PATCH fields remain unchanged.
- Tests cover no override, exact English override, Spanish/English flips, no stale voice on an unset language, speaking-plan preservation, invalid override rejection, and the superadmin gate.
- Evidence: type-check green; lint 0 errors / 32 existing warnings; focused Vitest 12/12; full `vitest run` 739/739; `next build` green. No files removed.

---

## T-105a � Work catalog � Library side

- Date: 2026-09-24 � branch: `task/work-catalog-library` � commit: this T-105a commit.
- New `src/lib/verticals/workCatalogStarter.ts`: `WORK_CATALOG_STARTER: Record<VerticalId, WorkCatalogItem[]>` (tsc-enforced) � 28 roofing items across leaks/flashing/shingles-tile/ventilation/gutters-drainage/storm-damage/penetrations-skylights/decking/inspection-notes; 6�8 items each for HVAC, electricians, landscaping, cleaning, general contractors, appliance repair, junk removal; the five jobs-disabled verticals declare `[]`. All wording is real tradesperson copy � test-asserted to contain no placeholder text (`placeholder|todo|tbd|\[�\]` etc.) and no guarantees/warranty/code claims; example prices live in the `starter` flag, never in the wording (the T-101 lesson). Pure `mergeWorkStarter(existing, starterItems, now)` in the same file: idempotent, skips ids already in `starterKitImported` (a deleted starter item stays deleted), never overwrites tenant edits, stamps `createdAt`/`updatedAt` only on real additions.
- `GET /api/company/work-catalog?businessId=` ? `{ catalog }` (empty catalog when none) and `PUT /api/company/work-catalog { businessId, items }` (replace items). Both owner/staff/superadmin via `verifyAuthAndRole`, `jsonWithCache("noStore")` only � never public/s-maxage, and auth-error responses get the no-store header too. PUT validates: array ? `WORK_CATALOG_MAX_ITEMS`, unique ids, required category/problem/solution, 60/160/1200-char caps, plain-text only (HTML tags/comments rejected via `<!--|<\/?[a-z][^>]*>`), severity in {low,medium,high}, ?12 lines per item with quantity>0, unitPrice?0, kind in {material,labor,other}, defensive description/unit caps. Server stamps `updatedAt` and clears nothing else (`set(..., { merge: true })` preserves `starterKitImported`).
- `POST /api/company/work-catalog/starter { businessId }`: idempotent import in a Firestore transaction. The kit is picked from the tenant's CURRENT industry server-side (never client input); 409 when the industry has no starter catalog, 403 when the tenant's `jobs` module is disabled. Stored at `businesses/{bid}/library/workCatalog` � its own doc, never merged into `library/pricing`; `firestore.rules` already covers `match /library/{docId}` (read for members, write false) so no rules change was needed.
- Library UI: new `src/app/company/library/WorkCatalogSection.tsx` behind a "Work catalog" tab that renders only when `isEnabled("jobs")` (useBusinessModules) and is reachable from the Library tab strip. Items grouped by category with collapsible sections, a search box (problem/category/solution/lines), add/edit in a `Sheet` (problem/solution/severity segmented control/suggested-lines editor with description-qty-unit-price-kind rows, ?12 lines), severity chips, a "Starter" badge until the first edit (editing clears `starter`), delete with confirm, an empty state with the "Load starter kit" button, and a plain note that suggested prices/wording are examples to edit. Vocab via useBusinessModules (no hardcoded "Job"); one-teal design system only (`.button`/`.panel`/`.field`, no `#2563eb`); single-column on mobile.
- Tests: `workCatalogStarter.test.ts` (10 � per-vertical completeness jobs-disabled?empty/others?non-empty, roofing ?20 items across required categories, caps/shapes, unique ids, no placeholder/unsafe wording, idempotent merge, deleted-stays-deleted + edits-preserved, import-time stamping, by-id tenant preservation, unknown-industry null); `work-catalog/__tests__/route.test.ts` (15 � GET/PUT auth pass-through, 400 shapes, >300 cap, missing/blank fields, over-length caps, HTML rejection in every text field, bad severity, unsound lines incl. 13-line cap, valid replace + updatedAt + starterKitImported preserved via the fake's new `{ merge: true }` support, no-store header); `starter/__tests__/route.test.ts` (7 � 400/403 auth, 409 unknown industry, 403 jobs-disabled, happy import, idempotent second run, deleted-starter-never-re-added at the route level).
- Removals: none. One additive extension to a shared test util: `src/test-utils/fakeFirestore.ts`'s `set()` now honors the optional `{ merge: true }` (doc ref, store, and transaction paths) so the PUT route's merge contract is observable in tests � the file's own header invites deliberate extension; no existing caller passes the option so nothing else can change.
- Evidence: `npm run type-check` clean; `npm run lint` 0 errors / 32 warnings (unchanged baseline, none in touched files); `npm test` full run 813/816 � the 3 failures are the long-documented pre-existing concurrent-load timeouts (`example-lib.test.ts`, `send.test.ts`, `team/route.test.ts` � none touch these files), all 3 reconfirmed clean in isolation; `next build` green with `/api/company/work-catalog` and `/api/company/work-catalog/starter` in the route table (`/company/library` 15.5 kB page, 135 kB First Load JS with the new section statically imported alongside its sibling sections).

---

## T-105b - Job findings, report, invoice, and quote

- Date: 2026-09-24; branch: task/work-catalog-jobs; commit: this T-105b commit.
- Added validated Job.findings snapshots (up to 60) and a Findings tab that reads the shared Work catalog API, groups and searches items, copies selections, supports one-off findings, and edits per-job wording and report/quote inclusion. The shared src/types/workCatalog.ts contract was not changed.
- Included selected findings in the in-app and emailed reports while retaining crew issues and Scope & Resolution notes. Added an idempotent draft-invoice import that uses exact Library material prices, preserves crew rows and line IDs, and recomputes with shared computeTotals. New invoices no longer include an unnamed labor placeholder row.
- Added persisted job quotes with a separate Q-1000+ counter, bill-to and finding snapshots, editable draft lines, manual status recording, valid-until date, hide-materials customer view, and a manual Resend send gate. The quote email escapes free text and states that online acceptance and payment are unavailable. Sending advances only open/inspection jobs to quoted.
- Tests: finding copy/untick and catalog independence, validation, report HTML inclusion and escaping, invoice idempotency and math, quote numbering/status/email, route auth and validation. Full Vitest: 95 files / 798 tests passed with --maxWorkers=2; initial unrestricted run hit two known concurrent-load timeouts in unrelated tests, both passed in isolation. npm run type-check green; npm run lint 0 errors / 32 existing warnings; npm run build green with quote routes present. Mobile layout reviewed for wrapping and horizontal tab scrolling. No files removed.

---

## T-111a — Voice provider seam and ElevenLabs client

- Date: 2026-09-24 · branch: `task/voice-provider` · commit: this T-111a commit.
- Added `getVoiceProvider` with a thin Vapi wrapper retaining existing persona PATCH and outbound argument shapes. The shared voice contract gained only optional `OutboundCallInput.metadata`, needed to keep Vapi call metadata separate from assistant variables.
- Added the ElevenLabs agent PATCH and Twilio outbound client using the documented endpoints and `xi-api-key` header. Persona pushes include the T-102 greeting and T-103 voice only when configured for the selected language. Scheduled outbound calls throw before fetch. Rewired settings, demo customization, persona sync, manual outbound, and follow-up cron through the provider seam. Cron places due callbacks only inside the tenant's allowed window.
- Added ElevenLabs agent and E.164 phone lookups with warm-process caching, superadmin provider config with server validation and retained IDs for both providers, and an `elevenlabs` health capability. No files removed.
- Evidence: type-check green; lint 0 errors / 32 existing warnings; full Vitest 805/805, including mocked exact ElevenLabs bodies, Vapi argument preservation, provider selection, sync planning, lookup caches, admin validation/auth, health flag, and cron window; production `next build` green.

---

## T-111b - ElevenLabs inbound webhooks and test provisioning

- Date: 2026-09-24; branch task/elevenlabs-hooks; commits db80550, cf1c65e, f117f8f, e29beaf, 3752636, ee85b0c, and this gate/log commit.
- Live Vapi decision: restored src/app/api/webhooks/vapi/route.ts byte-for-byte from main after reviewing the WIP extraction. Equivalence of the 454-line refactor could not be proven across every live path. Only ElevenLabs uses the shared dispatcher/writer. Eight characterization tests pin all seven Vapi tool outputs and the old end-of-call document. git diff main -- that route is empty.
- Replaced and removed businessLookupShim.ts using T-111a lookup exports after checking all references. Corrected empty-greeting override, ElevenLabs agent transcript mapping, and test typing.
- Security: missing/wrong secrets return detail-free 401; fixed-length hashes plus timingSafeEqual; raw-body HMAC with bounded timestamp and Firestore replay guard. Replay is complete only after the call write; unfinished processing gets 503 and a one-minute reclaim lease. Rate limiting matches Vapi at 300/minute per IP. Unknown called numbers get tenant-free data; a missing business doc makes no conversation record. Model identity fields are removed before dispatch; ElevenLabs caller identity comes only from the stored record. expiresAt is a Firestore Timestamp for TTL. Tests cover spoofing, expiry, unknown tenant, rate limit, HMAC failure/replay, and unfinished claims.
- Rewrote docs/ELEVENLABS-SETUP.md from zero with agent/voice, API key, secrets, script/manual tools, Security settings, and initiation/post-call webhook steps. Linked current ElevenLabs docs and called out UI labels not verified. Script is dry-run by default, requires --apply for writes and ELEVENLABS_API_KEY, reuses resources by name, never prints secret values or provider error bodies, and requires an explicit HTTPS origin. Moved response_timeout_secs to the documented tool_config level. post_call_audio storage stays T-112 follow-up.
- Gates: npm run type-check green; npm run lint -- --quiet 0 errors (plain lint/build show only existing unrelated warnings); vitest run 110 files / 931 tests passed; npm run build green after final code change; node --check and script offline dry run green. No live service called. Removal: obsolete businessLookupShim.ts; no cleanup outside task scope.

---

## T-114 � Feedback fix + app-shell UX pass

- Date: 2026-09-24 � branch: `task/ux-pass` � commits: `60e184e` (product), `c4f86e9` (tests), this evidence commit. `main` was merged in first (fast-forward).
- **Feedback is client-only.** `admin-nav.tsx`, `hub-nav.tsx` and `company-nav.tsx` now read `useAuth()` and render the Feedback control + mount `FeedbackForm` only when `!loading && !user?.superadmin` � so a superadmin (including one previewing a client via `?preview=`) never sees it, and nothing renders before the profile resolves (no flash). `FeedbackForm` itself also bails out for `user.superadmin` as a second guard. The admin/hub shells are superadmin-only, so in production those two navs no longer carry Feedback at all; a client user still sees it in the company nav.
- **Client-facing form** (`src/components/ui/FeedbackForm.tsx`, rewritten onto the shared `Modal`): title "Send feedback to Luxor"; the misleading "From <email>" row replaced by a read-only "We'll reply to" row (muted) plus "This message goes to the Luxor team � not to your own company."; category + message + 2000-char counter kept; success state "Thanks � we read every message" (+ Done); `role="alert"` error state. The API contract (`POST /api/feedback { businessId, message, category? }`) is untouched; the existing route tests still pass unchanged.
- **One nav treatment for Feedback.** The pale-box bug was the UA `<button>` background/border showing through `.nav-link` (which never reset them) on the dark sidebar; `.nav-link` now resets `background/border/border-left/width/text-align/cursor/font-family` and sets `min-height: 40px`, so the Feedback button reads exactly like Clients/Usage/Invoices, with hover, `:focus-visible` (a brighter `--ring-dark` on `.admin-sidebar`) and `data-state="open"` active states. The company nav groups **Help ? Guide + Feedback** in `.company-nav-secondary` with a new `.company-nav-section-label`; Guide stays reachable (Navigation Completeness Rule), and the `?preview=` suffix is kept.
- **Bounded shell pass.** (a) Tokens in `globals.css`: `--text-muted` and `--c-neutral-fg` darkened `#64748b ? #5f6f85` (was 4.34:1 on `--background`, now 4.67:1 / 5.12:1 on white � WCAG AA); the SUPERADMIN badge was already 6.2:1 (unchanged); `.chip.warn` uses the warn tokens; the active company-nav accent is now `var(--accent)`/`var(--accent-soft)` instead of a hard-coded `#0f766e`; Modal/Sheet share a `--backdrop` token. (b) Global `:focus-visible` rings already existed; added the brighter dark-sidebar ring. (c) `.nav-link`, `.nav-divider-link`, `.company-nav a/trigger`, `.mobile-menu-btn`, `.logout-btn`, `.admin-signout-btn` are ?40px, and `.button.small`/`.modal-close` grow to 40px on coarse pointers; new `useFocusTrap` gives Modal, Sheet and the company mobile nav sheet focus-in, Tab cycling, Escape-to-close and focus return (skipped when the close came from a link navigation). (d) FeedbackForm now uses `Modal` (shared spacing/close/backdrop), and Modal/Sheet gained the shared focus contract, so the Quick Add modals and PhotoEditSheet are consistent too; the in-dialog success action was renamed "Done" so no two buttons share the name "Close". (e) `SyncPersonasPanel` actions are left-aligned with the copy, and preview/skipped/result rows are `.sync-list` name+detail rows (icon status, warning chip when the recording notice is off) instead of one run-on line.
- Tests: `FeedbackForm.test.tsx` (6 � client wording incl. absence of "From", disabled Send class/state, success wording, error alert, superadmin unmounted, pre-resolution render), `nav-feedback.test.tsx` (6 � client sees Feedback in all three navs, superadmin never does, superadmin `?preview=` hidden, no flash while loading, company nav keeps every destination + Help grouping, preview suffix preserved), `globals-tokens.test.ts` (5 � computes real WCAG contrast for `--text-muted`/`--c-neutral-fg`, disabled rule uses tokens with no opacity fade, `.nav-link` button reset + 40px, tokenized active accent, shared backdrop), Modal focus tests (+3). 27/27 focused.
- No files removed. No new dependencies.
- Screenshots reviewed (before/after), captured with the globally-installed `agent-browser` (repo has no Playwright dependency) against a temporary CSS harness (outside the repo, `%TEMP%\kilo\t114-harness`) that links `main`'s `globals.css` vs this branch's and reproduces the shell markup: `before-{375,768,1280}.png` / `after-{375,768,1280}.png` (+`after-375b.png` with the mobile sheet sample). Confirmed visually: the old Feedback control rendered as a white/pale box with near-invisible label on the dark sidebar, and the old disabled buttons were pale teal with white text; after, Feedback is a normal icon+label nav item in both sidebars, disabled buttons are muted-grey on light and readable, the amber "Recording notice off" chip and the modal render consistently, and the company nav rows are full-width ?40px with the Help group at 375px. **Not checked:** the real authenticated app pages themselves � no Playwright in-repo, no live Firebase credentials in this session, so the harness is a CSS/DOM proxy for the shell, not a screenshot of `/admin` or `/company`; keyboard Tab/Escape behaviour was verified by the jsdom tests above, not by hand in a browser.
- Evidence: `npm run type-check` clean; `npm run lint` 0 errors / 32 warnings (unchanged baseline; touched files lint clean); `npm test` 869/871 with the 2 failures being the long-documented concurrent-load timeouts (`src/test-utils/example-lib.test.ts`, `src/app/api/company/team/__tests__/route.test.ts`), both reconfirmed green in isolation (18/18); `next build` green.

---

## T-116 � Refresh the demo/onboarding playbook (docs/HTML only)

- Date: 2026-09-24 � branch: `task/guide-refresh` (cut from main `b163ac7`) � commits `6f4c5d0` (onboarding guide), `a73cc24` (field-ops guide), this evidence commit. No `src/`, `scripts/` or other `docs/` file touched.
- **`public/guides/onboarding-guide.html`** � content-only edits, existing structure/CSS/print styling kept. Every claim re-verified by grep against the code in this worktree:
  - Demo Playbook: industry count corrected to **thirteen** (`11 of them` ? `13 of them`); cover subtitle gained the missing *junk removal*; added the **call-recording notice** note + the **Admin ? Clients ? �Sync live phone assistants� ? Preview changes ? Apply** step (Part 2, Phase 5); added **Findings** and **Quote** steps to the live-demo cheat sheet and the job walkthrough; the **intake demo** now covers five verticals � added **Care Homes (Elena)** and **Daycares (Wren)** to the heading, call scripts and calendar rows; the job-detail demo now lists the **nine tabs** (was �six tabs�); the `<2s` stat's source label changed from �Vapi + Cartesia stack� to �Vapi live line� (the number itself untouched).
  - Client Onboarding: **live voice config corrected** to `gpt-4o-mini` + **Vapi Voices v2 �Savannah�** + **Deepgram Flux** (removed the false `gpt-realtime-2025-08-28` / `cedar` statements in Phase 1 and the Go-Live checklist) with the do-not-switch-to-`gpt-realtime-*` warning; **voice providers** stated (Vapi live; ElevenLabs Agents dormant, per-tenant switch, not answering real calls); **recording notice** (default ON when config missing, editable Company ? Settings ? Call Recording Notice, draft pending counsel � NH-4); **per-industry intake fields**, **starter kits** and the Library **Work catalog**; **job Findings**; **quotes** (send by email, cannot be accepted or paid online � staff record the answer); **client-only Feedback**; Twilio scoped plainly to a bring-your-own-number provider with no live app integration (and the demo line noted as Vapi-owned); Phase 3 industry list and the troubleshooting industry-ID list expanded to all **thirteen**; **T-113 request review/decline labelled �coming soon � not shipped�** (TODO.md still shows T-113 assigned and `[ ]`; no `RequestReviewCard` in the tree); a **�not yet live-tested�** warning on the recording notice / sync / quote / feedback; version bumped to 2.7; the raw `&` in `<title>` escaped.
  - Demo line **+1 (754) 283-7658** and the public **`/try/<industry>`** tap-to-call + read-only sandbox (�See it in the real app�) text kept � verified against `DEMO_LINE_PHONE` (only `roofing` has a number) and `src/app/api/demo/sandbox-token/route.ts` (hardcoded `demo-roofing`, `role: "viewer"`, writes excluded).
- **`public/guides/field-operations-guide.html`** � one clearly-stale fix: the job-detail tab list now reads Timeline, Materials, Labor, Issues, **Findings, Photos, Invoice, Quote, Report** (verified against the `TABS` array in `src/app/company/jobs/[jobId]/page.tsx:635`).
- Verification: both files re-read around every edit; a tag-balance check (div/section/ul/ol/li/table/tr/td/p/span/h*/a/button/strong/em/code/label/html/head/body/style) matched open/close counts for both files; no external resources added; one-teal styling and print CSS untouched. No code, tests or run needed (HTML-only change). No files removed. Nothing pushed.
- Not verified (labelled as such in the guide): whether callers actually hear the recording notice on a live line, and the end-to-end sync/quote path on a real phone � owner checks NH-4/NH-8.

## 2026-09-25 — T-113 + C2 merged; email deliverability; call/superadmin fixes (integrator)
- Merged task/request-review (T-113: shared RequestReviewCard/Dialog in Pipeline+Calls, idempotent decline routes for leads+appointments with neutral decline email, job prefill; tests: route matrix, card interactions) and task/guide-refresh-2 (C2 guides).
- Gates on merged main: tsc clean; vitest 987/989 under full load (send.test + company/team are known load timeouts; both pass in isolation); Codex reported next build passed (83 static pages).
- Integrator fixes: comms/prepare.ts (CID inline images, text part, tenant From name, Reply-To); invoice/quote/report routes no longer mark sent on failed delivery; ElevenLabs calls store startedAt (were invisible in Calls); /api/auth/profile derives superadmin from the token claim only; Usage phone-line column provider-aware; Demo Studio optional business phone; production RESEND_FROM = Luxor CRM <crm@luxordev.com>.
- Not verified: T-113 on a live phone/email; email headers (dkim/spf/dmarc) on a received message.

## 2026-09-25 — T-107a document core (invoice + quote) merged (Codex + integrator)
- Built: src/lib/documents/ (groups, letterhead, emailBlocks, validation, DocumentPreview); hideMaterials/hideLabor/showTechnicians/technicians/narrative on invoice + quote (in-app, print, email); licenseNumber in Company Settings; library logo via the letterhead resolver in confirmation/assign/notify emails.
- Worker stopped on its usage limit with uncommitted work; integrator committed it, then verified: tsc clean, eslint 0 errors, vitest 1002/1002 (2 known load-flaky tests passed on re-run), next build passed.
- Email rules preserved: invoice/quote send routes pass fromName/replyTo and return 502 (not marked sent) on failed delivery.
- Not verified: a real emailed invoice/quote received in an inbox; Report is still T-107b.

## T-107b — Report suite on the shared document layer

- Branch: task/report-suite (worktree D:/Apps/air-wt-report). Added a shared report customer-copy model with truthful labor/material subtotals, persisted report options and technicians, and deterministic narrative drafting.
- The in-app and print/PDF report now use resolveLetterhead + DocumentPreview; emailed reports use the shared letterhead/email blocks and preserve fromName/replyTo plus failed-delivery 502 behavior.
- Report photos remain governed by includeInReport; established before/after metadata is rendered as paired Problem / Corrective action columns. Email selection is capped at 12 full-resolution photos to remain below approximately 15 MB under the existing photo-size cap.
- Tests cover every hide-materials/hide-labor combination, total preservation, hidden detail exclusion, deterministic narratives, photo pairing, and report route validation/persistence. No files removed; no dependencies added.
- Evidence: npm.cmd run type-check passed; npm.cmd run lint completed with 0 errors / 33 existing warnings; npx.cmd vitest run passed 125 files / 1,011 tests; npm.cmd run build completed and produced .next/BUILD_ID.
- Mobile: customer-copy layout uses the shared responsive DocumentPreview padding and two-column photo grid; no live authenticated browser session was available to capture a 375px screenshot.

## C5 - Offline demo-path smoke test

- Branch: task/e2e-smoke (worktree D:/Apps/air-wt-smoke). Added src/e2e/demo-path.test.ts plus narrowly extended fakeFirestore query/transaction/batch operations required by the real route handlers.
- Evidence: the shared offline database covers ElevenLabs initiation, tool booking, post-call records, lists, request confirmation/decline, job creation, Spanish typed field projection, report/quote/invoice sends, failed invoice delivery, session rejection, and cross-tenant rejection. docs/SMOKE-REPORT.md records partial/not-coverable portions honestly.
- No production code or dependencies changed; no live services called.

---

## C6 — Field-audio offline smoke coverage

- Date: 2026-09-25 · branch: `task/e2e-smoke`.
- Added `src/e2e/field-audio.test.ts`, using the real `POST /api/jobs/[jobId]/field-audio` handler, real `NextRequest` objects, and the shared `makeFakeDb()` store. Auth, Whisper/OpenAI transcription, and GPT-4o field parsing are the only mocked boundaries; no provider, storage, credential, or production-data call occurred.
- Coverage: English audio ledger + projection recomputation; Spanish source transcript retention with `rawTextEn` and canonical English projection; empty/oversized audio rejection with zero writes; transcription failure with zero writes; cross-tenant session rejection; and allowed/rejected job-scoped field-session behavior.
- The production client sends JSON/base64, not multipart. A multipart `NextRequest` probe is intentionally `it.fails`: the route calls `req.json()` and does not currently support multipart. This is recorded only; no production code was changed.
- Smoke report step 6 is now pass and its superseded human-only field-audio integration-test item was removed. No files removed and no dependencies added.
- Gates: `npx.cmd tsc --noEmit --incremental false` clean (plain `--noEmit` could not overwrite the sandbox-owned `tsconfig.tsbuildinfo`); `npx.cmd eslint src/e2e/field-audio.test.ts` clean; focused test 6 passed + 1 expected failure; full `npx.cmd vitest run` 1,018 passed + 1 expected failure with the documented `example-lib` and `company/team` load timeouts, both clean in isolated rerun (18/18).

## D2 Stage 1 — Live intake to job

- Branch: 	ask/job-loop. Added visibility-aware, single-flight live refresh on Dashboard, Calls, Pipeline, and job detail; hidden documents and unsaved inline edits do not refresh.
- Added the human-triggered, idempotent request-to-job route. It preserves email and call provenance, resolves the customer server-side, and shares the manual job counter helper. Manual job creation now keeps clientEmail.
- Evidence: 
px.cmd tsc --noEmit clean; changed-file eslint 0 errors (existing warnings only); refresh-hook tests 2/2; full 
px.cmd vitest run 128 files, 1,022 passed and 1 expected failure.
- Correction for the preceding checkpoint: branch task/job-loop. Evidence: npx.cmd tsc --noEmit clean; changed-file eslint had 0 errors; refresh-hook tests 2/2; full npx.cmd vitest run passed 128 files, 1,022 tests, plus 1 expected failure.
- Status correction: despite the checkpoint commit title, D2 Stage 1 is not ready to merge. Remaining Stage 1 acceptance items are new-row highlights, Calls Live/Ended labels, and request-route coverage.
## 2026-09-25 — D3 / T-132 South Florida roofing content (Deepseek V4 Flash, integrator-reviewed)
- Commits f963e81 (template), 94b35bc (catalog), 7568149 (seed), 3abc104 (test) + an integrator fix commit; merged to main.
- Roofing template: 8 services (inspection, leak, tile, flat, replacement, emergency tarping, storm damage inspection, gutter), 6 spoken-friendly FAQs
  (roof types, insurance documentation without coverage advice, storm prep/tarping, wind-mitigation/four-point = "team decides or refers a licensed
  inspector", inspection length, permits), 3 new emergency rules (active leak in rain, exposed deck, tree on roof). No license/code/price claims.
- Starter catalog: +8 roofing items (slipped/missing tile, flat membrane blister + split, fascia/soffit rot, failed sealant, drip edge, emergency tarp,
  wind-feature documentation); existing itemIds unchanged.
- src/lib/verticals/demoSeedRoofing.ts: ROOFING_WORKED_JOB (WorkedJobSeed contract, consumed by D1 step 4) = an inspection visit, EN + ES updates,
  3 h labor, findings tile-cracked + flashing-pipe-collar.
- Gates: tsc clean; vitest src/lib/verticals + ai + jobs 162/162; Deepseek's full run 1025 passed (company/team load-flaky, passed alone).

### D1 Part 1 checkpoint — 2026-09-25
- Branch: task/demo-line. Steps 1, 2, 3 and 5 committed: 39dca9e, 2b0c4af, 3afa6ac, 1637d8c.
- Step 4 pending D3's demoSeedRoofing.ts; git merge main was already up to date at 76a2042.
- Evidence: migration defaults to dry run and was not executed; launch makes no provider request; reset keeps allowlist, isDemo, lock and backup while clearing nested and stale demo data; Studio uses the ElevenLabs line.
- Gates: tsc noEmit passed; changed-file eslint 0 errors, 1 image warning; focused tests 21 passed; full vitest 127 files, 1019 passed and 1 expected fail.
- Removals: replaced the two-line Demo Studio/runbook and removed obsolete provider-push status copy.

## 2026-09-25 — D1 Part 2 (Codex A Sol medium, integrator-reviewed): call quality, live call row, audio, test call, J-1001
- Merged from task/demo-line (5e3014d..41a33ac): prompt "How you speak" rules; sayToCaller on booking/lookup/cancel results; duplicate timezone read removed; initiation webhook writes an in_progress call row (call_elevenlabs_<conversationId>) that post-call merges into (keeps startedAt, adds appointmentIds/providerIds/recordingUrl); GET /api/calls/[callId]/audio private streaming proxy (nothing stored); POST /api/admin/demo-customize/test-call (superadmin, 3 per 10 min); roofing worked job J-1001 (inspection, EN+ES ledger, 2 findings) seeded on launch, regular seeded jobs start at J-1002.
- Integrator fixes: booking tool result no longer says "(ID: ...) Save this ID" — it now labels the reference "NEVER read aloud or spell out" and points to phone lookup; the ElevenLabs bookAppointment tool description (toolSchemas.json) said the same and was rewritten.
- Applied to the live agent: scripts/setup-elevenlabs-agent.mjs --apply — checkAvailability + bookAppointment now pre_tool_speech "force" (verified via the MCP: force_pre_tool_speech true, headers intact); tool descriptions refreshed.
- Gates: tsc clean; vitest 130 files / 1040 passed + 1 expected fail; next build OK.
- Not verified: no real call has been placed since the change (needs the Twilio upgrade, NH-21, then the owner's scripted calls).

## D2 Stage 1 verified

- Request-to-job creation now uses an atomic request marker and shared counter transaction, with customer and call provenance retained.
- Live refresh highlights newly arrived rows on Calls, Pipeline, and Dashboard; Calls shows Live or Ended status.
- Gates: TypeScript passed; focused route and hook tests passed; full Vitest passed 131 files, 1,032 tests, plus 1 expected failure.

## 2026-09-25 — D2 finished by the integrator (Claude): Stages 2-4 + guide/docs
- Codex B stalled after Stage 1 (only a pure suggestFindings commit + an uncommitted partial); the integrator built the rest directly on main. Commits 42f1372, 15305d3, dc0c10c, 312cb55 (+ 82e7d5f cherry-picked from Codex B).
- Stage 2: POST /api/company/work-catalog (append one item, server id, 300 cap, transaction); /api/jobs/[jobId]/findings (grant-scoped: GET names only, POST server-side snapshot, idempotent, 60 cap); suggestFindings hardened (stopwords, de-pluralising, weighted, score >= 2); FindingsPanel (suggestions, picker, one-off price + Save to Library, autosave); QuotePanel rewrite (auto-draft when findings exist, + Add item / + Custom item, Issue->Work->Price cards, live total on quoteTotal, intro from draftQuoteIntro, options under "What the customer sees" with shared copy, autosave, send saves first); FindingPickerSheet + FieldFindingsButton on both field screens; DocumentOptionToggles shared by quote/invoice/report.
- Stage 3: POST /api/jobs/[jobId]/complete (grant-scoped, idempotent, never downgrades invoiced) + Job.statusHistory (arrayUnion on the status PATCH); WorkCompleteButton (two taps); job page polls ONE document (pollJobOnce) and refetches updates/photos only when updatedAt moves; photo upload/delete bump job.updatedAt; field-audio timing log + elapsed-time status text; plain-word time-clock labels. Voice-model swap deliberately NOT done (needs live numbers + Spanish check).
- Stage 4: draftReportNotes (deterministic, no prices, honors hide options) + Report tab auto-generates on open; GET /api/jobs/[jobId]/history + buildJobHistory + JobHistory panel; JobStepper + reordered tabs; Customers top-level page/nav (industry vocab); Jobs filters named for the next action + empty state; agent name / Vapi wording removed from company pages; dashboard phone-line status counts ElevenLabs.
- Also: onboarding guide updated (demo number +1 (689) 204-2643, single line, 20-minute running order, provider paragraph); tab-balance verified unchanged.
- Gates: tsc clean; eslint 0 errors; vitest 146 files / 1128 passed + 1 expected fail; next build OK.
- Refresh-hook fixes on main (earlier the same day): selection preserved by id after first load, only a failed FIRST load shows the error state, load promises returned.
