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

## T-035 � Demo/production isolation guards
- Date: 2026-07-21 � branch: task/demo-isolation � commit: 8ab0b5c
- **Allowlist (a):** Added DEMO_BUSINESS_IDS: ReadonlySet<string> = new Set(["demo-roofing"]) code constant with isAllowedDemoBusiness() guard in pplyVertical, returning { ok: false, error: "..." } before any write when LIVE_LINE_BUSINESS_ID is not in the set.
- **isDemo marker (b):** Added isDemo: true to the seed script (scripts/seed-demo-business.mjs:108). The route now reads existing.data()?.isDemo !== true after the business doc fetch and returns an error before any mutation when the marker is absent or false.
- **Backup export (c):** Before any collection deletion, all docs from calls, leads, ppointments, crews, jobs are read once into memory, serialized as { id, ...data } per doc, and written to usinesses/demo-roofing/backups/{timestamp}. The backup write gates the delete � if it fails, no data is deleted. The same in-memory snapshots are then used for the delete batch, avoiding a second read.
- **Transactional lock (d):** A lock doc at usinesses/demo-roofing/backups/lock is atomically claimed via 
unTransaction before any backup/delete/re-seed. A locked doc younger than LOCK_TTL_MS (120s) results in an error response. Stale locks are reclaimed. The lock is released in a inally block regardless of success or failure.
- **Confirm field (e):** The DELETE handler now parses the request body and requires confirm: "RESET". Missing or wrong values return 400. The UI (src/app/admin/demo/page.tsx) replaced the browser confirm() dialog with a modal overlay requiring the user to type "RESET" before the "Yes, reset demo" button enables. The etch call sends { confirm: "RESET" } in the JSON body.
- **Superadmin gate retained:** The existing erifySuperadmin(request) check at the top of both POST and DELETE handlers is unchanged.
- **Files changed:** src/app/api/admin/demo-customize/route.ts (full restructure: allowlist, isDemo marker, lock, backup export, finally-block lock release, DELETE body parsing); src/lib/verticals/demoSeed.ts (unchanged � isDemo is on the seed script's business doc, not in demoSeedFor); scripts/seed-demo-business.mjs (added isDemo: true line); src/app/admin/demo/page.tsx (replaced reset function with typed-confirm modal). New: src/app/api/admin/demo-customize/__tests__/route.test.ts (12 tests: 3 confirm-field, 2 isDemo-marker, 2 transactional-lock, 3 backup export, 1 superadmin gate, 1 full valid POST).
- **Evidence:** 
pm run type-check green; 
pm run lint 0 errors / 26 baseline warnings; 
pm test 14 files / 138 tests passing (existing 126 + 12 new T-035 tests); 
pm run build green; git diff --check green. No removals.
