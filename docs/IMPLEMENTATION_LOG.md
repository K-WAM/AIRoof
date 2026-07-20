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
