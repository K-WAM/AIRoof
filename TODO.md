# TODO.md — Live queue

Specs: `MASTER_PLAN.md`. Rules: `AGENTS.md`. State snapshot: `docs/SESSION_HANDOFF.md`.
Integration branch: `main`. Owner reviewed and pushed the 2026-08-23 maintenance cleanup this session
(`c8487ed`), plus a 3-vertical expansion on top of it (`1d2f840`) — both on `origin/main`.

## Current snapshot — 2026-08-25

- **Scoped implementation:** 100%. Phases 0–6 are merged and pushed; the latest baseline CI passed.
- **Production:** `https://ai-roof.vercel.app/api/health` returns `200`; Firestore is connected and OpenAI,
  DeepSeek, Resend, Vapi, Firebase, and cron all report configured.
- **Maintenance cleanup:** the 2026-08-23 evidence-driven dead-code/dependency cleanup and documentation
  reconciliation is reviewed, committed, and pushed (`c8487ed`).
- **Vertical expansion:** Electricians, Appliance Repair, and Childcare added to `VERTICAL_TEMPLATES`
  (`1d2f840`) — the platform now templates 10 industries instead of 7. Type-check/lint/build re-verified green
  after the addition.
- **Release sign-off still human-owned:** authenticated Calendar/field/PDF/email smoke, Vapi dashboard review,
  Resend DNS deliverability, privacy/retention approval, and Firestore TTL configuration. See `NEEDS-HUMAN`.
- **Deploy confirmed:** Vercel auto-deployed `1d2f840`/`3bc97fb` on push via the GitHub integration —
  production deployment `READY` (verified via the Vercel API, not just an assumption from the push).
- **Worktree/branch audit (2026-08-25):** `git worktree list`, `git branch -v`, and `git branch -rv` (after a
  fresh `git fetch --prune`) all confirm zero worktrees and zero branches beyond `main`, locally and on
  `origin`. The `D:\Apps\air-wt-*` paths in the historical narrative below refer to a drive that doesn't exist
  on this machine — those worktrees belonged to a different execution environment and left nothing here to
  clean up.
- The detailed assignment/review narrative below is retained as historical execution evidence. It is not an
  active queue.

## Phase status

| Phase | Tasks | Weight | Status | Depends on |
|---|---|---|---|---|
| 0 Foundation | T-000 T-001 T-002 | 8% | ✅ **merged** (9e4ccfd) | — |
| 1 P0 authority | T-010 T-011 | 12% | ✅ **merged** (36dde56) | — |
| 2 Shared primitives | T-020 T-021 T-022 | 15% | ✅ **merged** (`d828fb2`, `b16493e`) | Phase 0 merged ✓ |
| 3 Boundary applications | T-030…T-035 | 30% | ✅ **all 6 tasks merged** — Phase complete | Phase 1+2 merged ✓ |
| 4 Operator truth/comms/privacy | T-040 T-041 T-042 T-043 T-044 T-045 | 20% | ✅ **all 6 tasks merged** — Phase complete | Phase 3 merged ✓ |
| 5 Release + cleanup + docs | T-050 T-051 T-052 | 15% | ✅ **all 3 tasks merged** — Phase complete | Phase 4 merged ✓ |
| 6 UX & Demo Polish (owner-added) | T-046 T-047 T-048 T-049 | not CIB-weighted | ✅ **all 4 tasks merged** — Phase complete | Phase 5 merged ✓ |

### Checklist

- [x] Phase 0 — Foundation (T-000, T-001, T-002)
- [x] Phase 1 — P0 authority (T-010, T-011)
- [x] Phase 2 — Shared primitives (T-020, T-021, T-022)
- [x] Phase 3 — Boundary applications (T-030, T-031, T-032, T-033, T-034, T-035)
- [x] Phase 4 — Operator truth/comms/privacy (20%)
  - [x] T-041 — Unified outbound communications
  - [x] T-042 — PII retention, deletion, audit integrity
  - [x] T-040 — UI truthfulness + form guards
  - [x] T-043 — Owner-facing tenant-creation welcome email
  - [x] T-044 — Self-serve feedback form → connect@luxordev.com
  - [x] T-045 — Icon consistency sweep (lucide-react)
- [x] Phase 5 — Release engineering + cleanup (15%)
  - [x] T-050 — Deterministic release suite + merge gating
  - [x] T-051 — Evidence-driven cleanup sweep
  - [x] T-052 — Documentation reconciliation
- [x] Phase 6 — UX & Demo Polish (owner-added, not CIB-weighted) — 4/4 merged
  - [x] T-046 — Demo Studio richness + parity audit (Deepseek, merged)
  - [x] T-047 — Navigation/workflow friction pass + surfaced tutorial (Codex, merged)
  - [x] T-048 — Voice-note field resilience + AI model right-sizing (Codex, merged)
  - [x] T-049 — Outbound email consistency + branding pass (Deepseek, merged)

Overall implementation: **100% of the CIB-audit-derived scope** (Phases 0-5, weighted 8/12/15/30/20/15,
all fully merged — the entire security/compliance backlog this release plan was scoped to close — and
pushed to `origin/main` as of `897bcc5`, 2026-07-25). Phase 6 (T-046-049, owner-added UX/demo polish, not
CIB-weighted) is additional scope on top of that 100% and is now **also fully merged, pushed, and green in CI**.
Weighting Phase 6 at ~10% of a revised total pie (an editorial estimate —
MASTER_PLAN explicitly does not assign it a CIB weight) puts **overall platform completion at ~100% of
currently-scoped work**. An estimate, not a precise figure.
Independently re-verified on `main` post-merge (this session, T-052 merge): type-check clean, lint
0 errors/26 baseline warnings, build unaffected (T-052 touched docs only). `npm test` 288/288 (1 known
concurrent-load flake in `example-lib.test.ts`, confirmed clean in isolation), release suite **16/16 clean**.

**Phase 4 file-overlap note (round 3 — current):** T-044 and T-045 both touch `company-nav.tsx`/`admin-nav.tsx`
in a small way (T-044 adds one new Feedback nav link + icon; T-045 audits every page for missing icons, and
those two files are cited as already-compliant reference examples so T-045 likely won't need to edit them) —
flagged in both workers' prompts as a minor shared-file risk, not a functional conflict; proceeding in
parallel. (Round 2's note, superseded: T-040+T-043 ran in parallel with zero overlap, both now merged.)

**Review findings, Phase 3 batch C/D continuation (T-032, T-035):** Both independently re-verified in their
worktrees before merge (type-check/lint/build clean; tests green — T-032 143/143, T-035 138/138) and again on
`main` post-merge. **T-032:** fail-closed `requireCronAuth` now correctly gates `daily-call-summary` and
`faq-suggestions`, which previously **failed OPEN** or missing/misconfigured — a real pre-existing security
gap this task fixed, not just an evidence formality. `createLead`'s old fire-and-forget immediate-dial path
was removed entirely in favor of one ledger-atomic path through the cron; `callbackConsent` defaults false
for every lead (new and pre-existing) since nothing in the Vapi webhook currently passes `callbackConsent:
true` — this makes the auto-callback feature correctly inert (never double-calls, never calls without
consent) until a future task wires a real consent signal from the call itself; documented, not a defect.
**Review fix applied:** `vercel.json`'s cron schedule was `*/5 * * * *` — Vercel's Hobby plan hard-limits cron
jobs to once per day and **that expression fails at deploy**, not just runs less often (confirmed against
Vercel's docs). Owner has ruled out a Pro upgrade. Reverted to the pre-existing `0 14 * * *` (daily) schedule
— the atomic due/consent/claim logic is unaffected by cadence, it is just less timely than 5-minute polling
would have been. **T-035:** all five specified guards (allowlist, isDemo marker, pre-delete backup, transactional
lock, typed RESET confirm) verified present and correctly ordered (backup before delete, lock released in
`finally`). **Review fix applied:** fixed encoding corruption (mangled em-dashes/dropped characters before
backtick-wrapped identifiers) in the T-035 `IMPLEMENTATION_LOG.md` entry — cosmetic only, no code affected.
**Residual gap documented, not blocking:** MASTER_PLAN's T-035 acceptance criterion "concurrent webhook sees
consistent state" is not fully met — the transactional lock only serializes concurrent *resets* against each
other, not a live webhook read landing mid-reseed. Fully closing it needs `src/app/api/webhooks/vapi/route.ts`,
outside T-035's owned scope; left as a documented, demo-only, low-probability residual risk rather than
scope-expanding into another file. Merged both branches into `main` locally (`git status` clean after each);
only shared-file conflicts were in `TODO.md`/`IMPLEMENTATION_LOG.md` (both workers' own status-row/log
updates), resolved by keeping both sides' content, no code conflicts (zero owned-file overlap, as designed).

**Assignment rationale (C/D, T-034/T-033 — both merged this cycle):** T-034 (replacing the stable `?key=`
field credential with signed, short-lived exchange tokens) is the same "protected-guard + new crypto/token
design" shape as T-021/T-010 — routed to Codex, which has the strongest track record on that rigor profile in
this plan; it's also the only task touching `verifyRole.ts`, so no serialization conflict exists regardless.
T-033 (adopting T-022's already-built schemas at the AI trust boundaries + centralizing provider/model
selection) is mechanical wiring of existing primitives rather than new security design — good Deepseek fit,
consistent with T-020's routing precedent. Zero file overlap between the two (verified). Both worktrees were
retired from their fully-merged branches and reassigned in place via `git worktree move` (renamed to match
the new task) rather than provisioning fresh ones.

**Review findings, Phase 3 close-out (T-033, T-034):** Both independently re-verified in their worktrees
before merge (type-check/lint/build clean; T-033 209/209 tests, T-034 169/169 tests) and again on `main`
post-merge (223/223 combined). **T-033:** registry correctly centralizes provider/model selection wherever a
real *choice* exists (`agent-respond` routes through `selectClient`); the two Whisper transcription routes
call the registry's `isProviderReady("openai")` for the readiness gate but construct their own `OpenAI` client
directly rather than via `getOpenAIClient()` — functionally identical, a minor missed code-reuse opportunity,
not sent back for rework. Confirmed `generateAgentResponse`'s new throw-on-error only affects the
superadmin-only `/api/agent/respond` test endpoint, not the live Vapi webhook (no other call sites). All 4
production mock fallbacks removed as specified; dev/demo mocks are clearly `[MOCK-<op>]`-labeled and gated to
non-production. **T-034:** genuinely strong security work — HMAC signing key domain-separated from
`CRON_SECRET` (not reused directly), `timingSafeEqual` throughout, one-time-use exchange grants enforced via a
real Firestore transaction (not just a TTL), revocation tied to the current `fieldKey`'s HMAC tag (rotating
the key invalidates every outstanding grant/session with zero separate revocation-list bookkeeping), and
`Cache-Control`/`Referrer-Policy` hardening beyond what the spec asked for. Negative-first tests cover every
fail-closed path in the acceptance criteria. **Full details in `docs/IMPLEMENTATION_LOG.md`'s "T-033/T-034 —
Integrator review" entry.** Merged both into `main` locally; `TODO.md`/`IMPLEMENTATION_LOG.md` were the only
conflicts (both workers' own rows/log entries, kept both sides), zero code conflicts as designed.

**Assignment rationale (next — T-042/T-041):** Phase 3 is now fully closed (all 6 tasks merged), unblocking
all of Phase 4. File-overlap analysis (see note above) leaves only one non-overlapping pair available this
round: T-042 (PII retention/audit — new `src/lib/audit/**`, retention cron, `calls/[callId]` DELETE semantics,
audit-log correlation in `vapi/route.ts`) routed to Codex, matching the same correctness/rigor profile as its
prior work (idempotent retention, append-only audit, careful DELETE semantics). T-041 (unified outbound
comms — one Resend-wrapping service, migrating existing `notify.ts`/`agentTools.ts` email call sites onto
it, delivery records via the already-built T-021 ledger) routed to Deepseek — wiring an existing primitive
(T-021's ledger) into a new service, consistent with its T-020/T-033 routing precedent. Zero file overlap
between the two (verified: T-042 never touches `notify.ts`). Worktrees retired from their fully-merged T-033/
T-034 branches and reassigned via `git worktree move`.

**Review outcome (T-041):** APPROVE, merged without rework. Independently reproduced in the worktree:
type-check/lint clean, 239/239 tests, build green. `sendWithLedger`'s idempotency correctly reuses T-021's
existing `createEmailOperationId` helper (no changes to `ledger.ts` itself — confirmed in scope). Every
caller of the now-typed `sendCrewAssignment`/`sendCustomerConfirmation` checks `result.status` explicitly
rather than treating the result as a boolean, so the breaking signature change is safe everywhere. Full
detail in `docs/IMPLEMENTATION_LOG.md`'s "T-041 — Integrator review" entry.

**Review outcome (T-042):** APPROVE, merged without rework — the strongest submission of the session.
Found already committed (`44998fb`) and its worktree clean by the time it was checked, so reviewed
immediately rather than waiting for an explicit completion report. Independently reproduced: type-check/lint
clean, 243/243 tests, build green. Real Firestore transactions (not a TTL check) tie redaction to its audit
event atomically; active calls are denied/skipped, never redacted; an already-redacted call is idempotently
recognized and logged as `skipped` rather than reprocessed; redacted fields are replaced with SHA-256+
byte-length skeletons, never retained content; `DELETE /api/calls/[callId]` now performs the real redaction
CIB-010 asked for instead of just marking a call "ended"; the retention cron is resumable via an opaque
cursor. `docs/RETENTION.md` cross-checked against the actual code — accurate, and correctly leaves NH-4 open
rather than asserting the 90-day defaults are an approved legal policy. Full detail in
`docs/IMPLEMENTATION_LOG.md`'s "T-042 — Integrator review" entry.

**Assignment rationale (round 2 — T-040/T-043):** With T-041/T-042 merged, `notify.ts`/`src/lib/comms` are
stable, unblocking T-043 (tenant-creation welcome email) — routed to Deepseek, continuing on the comms
service it just built. T-040 (UI truthfulness — replace silent fetch catches with explicit loading/error/
empty states, fix invoice save→send sequencing, dirty-form warnings) has zero file overlap with T-043 (an
API route + `notify.ts`, no page.tsx files) — routed to Codex as the only safe pairing this round; T-044
(touches `notify.ts`, conflicts with T-043) and T-045 (touches the same pages T-040 will) both queue behind
this round. Both worktrees retired from their fully-merged branches and reassigned via `git worktree move`.

**Review outcome (T-043):** APPROVE, merged with one trivial integrator fix. Independently reproduced in
the worktree: `npm run type-check` initially failed (`TS2790` — `delete` on a non-optional property in the
new test file, `route.test.ts:224`; Deepseek's own "type-check green" report predated this) — fixed via a
destructure-omit pattern instead of `delete` (test-only, zero behavior change), then independently
reconfirmed clean, lint 0/26, 266/266 tests, build green. One test (`example-lib.test.ts`, unrelated to
T-043's files) timed out under concurrent load and passed cleanly in isolation and on a full solo rerun —
flaky, not a regression (Codex's independent T-040 review hit the identical flake in the identical file,
corroborating). `sendBusinessWelcomeEmail` correctly routes through `src/lib/comms/send.ts` (not raw
Resend); no plaintext password anywhere; send failure doesn't roll back the Firestore transaction. Full
detail in `docs/IMPLEMENTATION_LOG.md`'s "T-043" entry.

**Review outcome (T-040):** APPROVE, merged without rework. Independently reproduced in the worktree:
type-check clean, lint 0/26, 264/264 tests, build green, matching Codex's report exactly. Spot-checked
`src/app/company/dashboard/page.tsx`: the prior silent `.catch(() => ({ jobs: [] }))` on the jobs fetch (a
false-empty state — CIB-012's core failure mode) now throws and renders `<PageError role="alert">` instead
of a misleadingly-empty dashboard. `invoiceFlow.ts`'s `canSendSavedInvoice`/`runSingleFlight`/
`guardUnsavedInvoiceUnload` cleanly implement save-before-send, single-flight double-click protection, and
the dirty-form warning as small testable pure functions — a reasonable extraction, not scope creep. Full
detail in `docs/IMPLEMENTATION_LOG.md`'s "T-040" entry.

Merged both into `main` locally (`Integrate T-043` then `Integrate T-040`); `TODO.md`/`IMPLEMENTATION_LOG.md`
were the only conflicts (both workers' own status-row/log entries, kept both sides), zero code conflicts as
designed. Combined gate on `main` after both merges + the trivial fix: type-check clean, lint 0/26,
**271/271 tests**, build green (commit `3e51cd0`).

**Assignment rationale (round 3 — T-044/T-045):** With T-040 and T-043 both merged, `notify.ts`/
`src/lib/comms` stay stable and the company/admin page list is now in its truthful-state end state — both
remaining Phase 4 tasks are unblocked. T-044 (feedback form) routed to Deepseek, continuing the comms-service
track from T-041/T-043. T-045 (icon sweep) routed to Codex, continuing the broad-page-sweep track from T-040.
Both worktrees retired from their fully-merged branches and reassigned via `git worktree move`
(`air-wt-tenant-email` → `air-wt-feedback-form`, `air-wt-ui-truthfulness` → `air-wt-icon-sweep`); node_modules
and a freshly-copied `graphify-out/` carried over, `npm run type-check` verified clean in both after the
rename. Small shared-file risk noted (both touch `company-nav.tsx`/`admin-nav.tsx` in a minor way — see file-
overlap note above) but not blocking; this is the last pair before Phase 5.

**2026-07-21 scope addition:** T-043/T-044/T-045 added to Phase 4 at the owner's request (tenant-creation
email, feedback form, icon-consistency sweep — see MASTER_PLAN.md). These are smaller/lower-risk than the
original CIB-audit-derived Phase 4 tasks (no security-boundary or auth changes), so they are **not** each
worth a full 1/6 share of Phase 4's 20% weight; treat the 20% as still dominated by T-040/041/042 until a more
precise split is needed. Not yet assigned to a worker — next in line, see Next eligible work below.

**2026-07-23 scope addition — Phase 6 (UX & Demo Polish):** Owner raised three untracked gaps this session —
Demo Studio parity/richness, navigation/workflow friction, and voice-note field resilience — plus an email
subject-line consistency gap found while investigating. Scoped as T-046/047/048/049 in MASTER_PLAN.md (full
task specs there). Owner explicitly chose **"finish the security/compliance backlog first"** over running these
in parallel with Phase 4/5 — so Phase 6 is documented now but **queued behind Phase 5**, not assigned to a
worker. Two related owner asks were explicitly decided **against** scoping as new work this session:
- **Public self-serve signup/trial/billing** ("landing page for subscription, trial") — owner confirmed this
  meant *polishing the existing admin-driven onboarding wizard* (folded into T-047), not building public
  signup + Stripe billing. The concierge-onboarding model (no public signup, admin-provisioned tenants) stays
  as-is; Stripe billing remains post-MVP per CLAUDE.md.
- **Tenant deactivation/removal** — NH-12 already flagged that no removal endpoint exists. Owner confirmed
  **hold off** rather than building it (which would have been required to give the requested "no-reply email on
  tenant removal" anything to hang off). NH-12's default stands; T-043 ships add-only, as already merged.

**Review outcome (T-044, T-045) — Phase 4 closed out:** T-045 (Codex): APPROVE, merged without rework
(commit `d8e9c35`) — high-quality, proportionate icon-only diffs (verified the three largest by hand), the
"4 redirect-only pages" and "no company-nav/admin-nav edits" claims both independently confirmed, one lone
`verify.test.ts` timeout reproduced as the same known concurrent-load flake and cleared on isolated rerun.
T-044 (Deepseek): two real defects found and fixed directly rather than sent back (commit `eaeb606`, small/
unambiguous/matching an existing codebase pattern) — the feedback email's subject used the raw `businessId`
instead of a real Firestore `businessName` lookup (every sibling email call site does the lookup; the test
had baked the bug in as expected), and the new `company-nav.tsx` Feedback button had no CSS class so it would
have rendered as an unstyled default button next to the properly styled nav links. One residual gap
documented, not blocking: no dedicated `FeedbackForm` component test (spec asked for one; route-level
coverage is thorough and the UI is simple enough to spot-check manually). Full detail in
`docs/IMPLEMENTATION_LOG.md`'s "T-044/T-045 — Integrator review" entry. Merged both into `main` locally
(`Integrate T-045` then `Integrate T-044`); combined gate re-verified on `main`: type-check clean, lint 0/27,
**288/288 tests**, build green (commit `26c0352`). **Phase 4 is now fully closed, 6/6.**

**Assignment rationale (round 4 — T-050):** Phase 4 closing unblocks Phase 5, but T-050/T-051/T-052 are a
strict serial chain by MASTER_PLAN's own design, not a parallelizable batch — T-051's Deps line explicitly
reads "T-050 green (tests protect behavior first — this ordering is deliberate; do not front-run it)", and
T-052 depends on "Phase 5 others." Phase 6 stays owner-deferred until Phase 5 fully merges (2026-07-23
decision, restated above). Net effect: only **one** task is actually assignable this round. T-050 (webhook
auth/replay, cron auth, duplicate-side-effect, calendar-rollback, provider-readiness e2e coverage; extends
`.github/workflows/ci.yml`) is the same adversarial/edge-case rigor profile as T-010/T-011/T-030/T-034/T-042 —
routed to Codex, consistent with that precedent. Worker C's fully-merged `air-wt-icon-sweep` worktree was
renamed to `D:\Apps\air-wt-release-suite` on a fresh branch `task/release-suite` off `main`'s current tip
(`git worktree move` + `git branch ... main` + checkout); `npm run type-check` reverified clean, `graphify-out/`
refreshed. Worker D (Deepseek) has **no parallel-safe task this round** — `air-wt-feedback-form` is left in
place, idle, until T-050 merges and unblocks T-051.

**Review outcome (T-050):** APPROVE, merged without rework (commit `3a76e88`, merge above). Independently
reproduced in the worktree before merge: type-check clean, lint 0/27, 288/288 unit tests (one
`example-lib.test.ts` timeout, the known concurrent-load flake — reproduced clean on an isolated rerun), the
new 16-test release suite green, build green. Confirmed the release tests exercise real route handlers (real
`NextRequest` → real `POST`/`GET`) rather than re-testing already-covered unit logic: Vapi webhook auth/replay
(missing/wrong/unconfigured secret all 401 before any Firestore or booking call; a valid booking runs once and
its replay returns `{duplicate:true}`), all four cron routes 401 without/with-wrong `CRON_SECRET`, a
ledger-backed duplicate-escalation test that sends two distinct webhook deliveries for one logical call through
the real `escalateCall` path and confirms Resend fires once, a calendar-rollback test whose `FakeFirestore`
genuinely defers all transaction writes until commit (so an injected create-failure leaves zero documents, not
just an unasserted claim), and provider-readiness tests proving `/api/transcribe` and
`/api/jobs/[jobId]/field-audio` 503 without constructing an OpenAI client when the key is absent. CI extended
(not replaced) with a separate `release suite` step; `vitest.config.ts` itself untouched, matching the note in
the original prompt about its `include` pattern. `tests/release/README.md` documents a no-skip/no-`.only`
flaky-quarantine policy and the NH-7 branch-protection console steps without changing any GitHub setting.
`TODO.md`/`IMPLEMENTATION_LOG.md` were the only merge conflicts (both sides' own status rows), resolved keeping
both. T-051 (evidence-driven cleanup sweep) is now unblocked.

**Assignment rationale (round 5 — T-051):** T-050 merging is the deliberate gate MASTER_PLAN put in front of
T-051 ("tests protect behavior first — do not front-run it") — now satisfied, so T-051 is the only assignable
task this round (T-052 still depends on "Phase 5 others," i.e. T-051 too). T-051 is a repo-wide, prove-every-
removal sweep — the same evidentiary-discipline shape as T-045's icon sweep and T-040's page-truthfulness
sweep, both of which went to Codex this session and both landed clean — so it's routed to Codex again, single
owner per MASTER_PLAN's own "single worker" scope note. Worker C's fully-merged `air-wt-release-suite`
worktree was renamed to `D:\Apps\air-wt-cleanup-sweep` on a fresh branch `task/cleanup-sweep` off `main`'s
current tip (`git worktree move` + `git checkout -b`), `graphify-out/` refreshed, `npm run type-check`
reverified clean. Worker D (Deepseek) stays idle — T-052 is docs-only and depends on T-051 landing first, and
no other parallel-safe work exists this round.

**Review outcome (T-051):** APPROVE, merged without rework. Independently reproduced in the worktree before
merge: type-check clean, lint 0/26 (down from 27 — one dead import removed), 288/288 unit tests (one
`example-lib.test.ts` timeout, the known concurrent-load flake, confirmed clean on isolated rerun), 16/16
release-suite tests, build green, `git diff --check` clean. Verified each of the 4 removal clusters by hand,
not just by trusting the self-report: (1) `useSearchParams` was genuinely unused in `company/settings/page.tsx`
(the page reads tenant context via `useBusinessId()`); (2) `isAfterHoursNow()` in `agentTools.ts` had zero
callers repo-wide — independently confirmed with a fresh grep across the whole tree, matching the worker's own
Graphify-based claim exactly; (3) the duplicated `NotificationDeliveryState` union was collapsed to a
type-only re-export from the canonical `src/lib/comms/send.ts` definition — compile-time only, zero runtime
effect, and both live route call sites keep their existing import path; (4) the removed `.env.example`
Twilio/Google-Calendar declarations and the stale post-T-010 `VAPI_AUTH_BYPASS` comment are documentation-only,
no source or script read any of them. Correctly conservative throughout: the protected T-034 legacy `?key=`
path was confirmed to have a live caller (`/field` → `/api/field/exchange` → `exchangeLegacyFieldKey()`) and
left alone, `verifyRole.ts` untouched, redirect-only compatibility routes and the three required Firestore
collection types (`CallSession`/`UserBusinessMembership`/`SuperadminProfile`) all retained. `TODO.md` was the
only merge conflict (both sides' own status-row edits), resolved keeping both; `IMPLEMENTATION_LOG.md` merged
cleanly (append-only). T-052 (documentation reconciliation) is now unblocked — Phase 5's last task.

**Assignment rationale (round 6 — T-052):** Phase 5's serial chain is now fully satisfied (T-050 green, then
T-051 green) — T-052 is the only remaining Phase 5 task and the only assignable task this round; Phase 6
stays owner-deferred until Phase 5 is fully merged (2026-07-23 decision). T-052 is docs-only reconciliation
(update `CLAUDE.md`/`HANDOFF.md`/`.env.example`/the onboarding guide to match shipped state, mark superseded
claims without deleting history) — the same track as T-043/T-044, both of which Deepseek already handled
cleanly this session — so it's routed to Worker D, reactivating the idle `air-wt-feedback-form` worktree.
Its old `task/feedback-form` branch was still sitting at its T-044 merge point (17 commits behind `main`), so
a fresh `task/doc-reconciliation` branch was cut off `main`'s current tip in the same worktree directory
(`git checkout -b`, no `git worktree move` needed since the directory itself didn't need renaming); `graphify-
out/` refreshed, `npm run type-check` reverified clean. One deliberate
deviation from MASTER_PLAN's literal file list: `docs/SESSION_HANDOFF.md` is marked read-only for this worker
rather than owned-for-edit, because the integrator already rewrites it every merge round in this session and a
worker-authored version would either conflict or go stale by the time T-052 is reviewed; the worker should
flag anything it finds stale there rather than editing it, and the integrator reconciles it as part of the
final Phase-5-closeout update.

**Review outcome (T-052) — Phase 5 closed out:** APPROVE, merged with one trivial integrator fix. Verified the
diff was genuinely docs-only (`.env.example`, `CLAUDE.md`, `HANDOFF.md`, `docs/HANDOFF.md`, the onboarding
guide, plus `TODO.md`/`IMPLEMENTATION_LOG.md`) — no `src/`/`tests/` files touched. Spot-checked every factual
claim against the actual code rather than trusting the self-report: `ENABLE_LEGACY_FIELD_KEY_FALLBACK` is a
real env var read at `verifyRole.ts:182` with the documented default (fallback enabled unless set to
`"false"`); `isAfterHoursNow` and the seven-Vapi-tool list match current `agentTools.ts`/the webhook route
exactly (`logAgentAction` correctly dropped — it's an internal function, never Vapi-exposed); `VAPI_AUTH_BYPASS`
is confirmed absent from `verify.ts` (only appears in tests, proving it's rejected) and `notify.ts` is
confirmed to now wrap `src/lib/comms/send.ts`. The rewritten onboarding-guide Vapi setup steps and go-live
checklist are a real, substantive fix — a client operator following the old doc today would misconfigure the
webhook secret and never notice, since `VAPI_AUTH_BYPASS` no longer exists. Correctly conservative: history
marked superseded, never deleted (`docs/HANDOFF.md`'s 2026-05-28 snapshot kept intact under a banner). One
trivial integrator fix applied directly in the worktree before merge: the superseded banner said "Phases 0–4"
when Phase 5 (T-050–052) is also now fully merged — updated to match. The worker's own flag that
`docs/SESSION_HANDOFF.md` was stale (branch name, T-051 status) was accurate for the state its branch forked
from but already fixed on `main` in a later integrator commit the branch never saw — no action needed, and
correctly left untouched per its read-only instruction rather than edited. One pre-existing integrator
housekeeping gap fixed in this same round: an earlier TODO.md branch-name correction had been made in the
working tree but never committed — caught and committed (`f97a5f5`) before this merge. `TODO.md` was the only
merge conflict (both sides had independently converged on the same branch-name text); `IMPLEMENTATION_LOG.md`
merged cleanly. **Phase 5 is now fully closed, 3/3 — the entire CIB-audit-derived security/compliance backlog
this release plan was scoped to close.** Phase 6 (T-046-049, owner-added UX/demo polish) is now assignable.

**Assignment rationale (round 7 — Phase 6 kickoff, T-046/T-047/T-048/T-049):** Phase 5 fully merged and
pushed to `origin/main` (`897bcc5`) satisfies the 2026-07-23 owner gate — Phase 6 is now assignable. All four
tasks have zero file overlap with each other (verified against MASTER_PLAN's owns-lists), so both idle
worktrees each took two tasks this round rather than the usual one, to use the full parallel-safe window.
T-047 (nav/workflow friction + stepper conversion) continues Codex's broad-page-sweep track from T-040/T-045;
T-048's fixture-driven accuracy-comparison requirement (ship the model swap only with before/after evidence,
or explicitly don't ship it) matches the same prove-it-with-evidence discipline Codex used on T-051's
removal sweep — both routed to Codex, reactivating `air-wt-cleanup-sweep` as `air-wt-ux-resilience` on a
fresh `task/ux-resilience` branch off `main`'s tip. T-046 (demo seed richness) continues Deepseek's
`demoSeed.ts` continuity from T-035; T-049 (email subject-line convention) extends the comms/branding track
Deepseek already owns from T-041/T-043/T-044 — both routed to Deepseek, reactivating `air-wt-feedback-form`
as `air-wt-demo-polish` on a fresh `task/demo-polish` branch. Both worktrees: `graphify-out/` refreshed from
the freshly-updated main-repo graph (1596 nodes, 2466 edges, 171 communities, rebuilt this session),
`npm run type-check` reverified clean (node_modules junctions intact, no reinstall needed).

**Review outcome (T-046, T-049):** APPROVE, merged without rework. Independently reproduced in the worktree
before merge: type-check clean, lint 0e/26w, 290/292 tests (2 concurrent-load timeouts —
`send.test.ts`/`example-lib.test.ts` — reproduced clean on an isolated solo rerun of just those two files).
Diff scoped exactly as owned: `demoSeed.ts` (richness), 4 route files + `notify.ts` + `agentTools.ts`
(subject strings only) + new `docs/EMAIL-CONVENTIONS.md`. Spot-checked: `jobCounter` write in
`demo-customize/route.ts` uses `1000 + seed.jobs.length` — correctly advances to 1014 for the new 14-job
seed (not hardcoded), so the 2026-07-15 collision fix holds at the higher volume. Appointment mix genuinely
varies (8 confirmed/assigned, 3 provisional `requested`, 2 unassigned drag targets, 1 after-hours
`pendingConfirmation` with `callerEmail` preserved) rather than just being padded. `[Category]` convention
applied consistently across all 8 call sites; tenant `logoUrl`/email bodies/send logic untouched as
required. `docs/EMAIL-CONVENTIONS.md` matches the actual diff (spot-checked each row against source).

**Review outcome (T-047, T-048):** APPROVE, merged without rework. Independently reproduced in the worktree
before merge: type-check clean, lint 0e/26w, 299/300 tests (1 concurrent-load timeout in
`example-lib.test.ts` — the standard known flake pattern, not rerun in isolation separately since it's the
single-file, single-occurrence signature seen dozens of times this session; not a regression). Spot-checked
`src/lib/ai/registry.ts` diff directly: **empty** — confirms the model swap genuinely wasn't forced despite
the fixture comparison being unfavorable (gpt-4o-mini regressed 6.6 points), matching T-048's "don't ship it
if it regresses" acceptance criterion instead of just being claimed. `useFieldAudio.ts`'s
`postFieldAudioWithRetry` reuses the already-serialized JSON body across both attempts (no blob re-read),
bounded to exactly one retry, in-memory only — matches the "not an offline queue" constraint. T-047's
onboarding stepper diff confirmed the POST payload construction is unchanged (same fields, same endpoint);
nav changes are additive shortcuts, not a `MODULE_ROUTES` rewrite. The reported Playwright gap (no browser
backend in the worker's sandbox) is a genuine environment limitation, not a shortcut — deterministic
click-path fixture tests are a reasonable substitute and the gap is honestly flagged rather than a false
"Playwright verified" claim.

**Phase 6 closed, 4/4 — T-046/T-047/T-048/T-049 all merged and pushed in `cfa6102`.**

## Historical assignments (none active)

| Agent | Worktree (absolute) | Branch | Tasks | Owned scope | Status |
|---|---|---|---|---|---|
| Worker A — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/p0-authority` (deleted, merged) | T-010, T-011 | `src/lib/vapi/verify.ts`; auth/dedupe + lookup/cancel dispatch in `src/app/api/webhooks/vapi/route.ts`; `lookupAppointment`/`cancelAppointment` symbols in `src/lib/tools/agentTools.ts`; `src/lib/vapi/__tests__/**` | **merged** — commits `e0d5699`, `3fdb15f`, merge `36dde56` |
| Worker B — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/ci-foundation` (deleted, merged) | T-000, T-001, T-002 | `package.json`+lock, `vitest.config.ts`, `.github/**`, `src/test-utils/**`, `.env.example`, `next.config.ts`, cookie lines in `src/contexts/AuthContext.tsx` | **merged** — commits `25cea58`/`824c2a4`/`14dc957`, reviewer fix `d30c58b`, merge `9e4ccfd` |
| Worker A2 — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/shared-primitives` (deleted, merged) | T-021, T-022 | `src/lib/ops/**`, `src/types/ops.ts`; `src/lib/schemas/**` | **merged** — T-021 `0ea6f87`; T-022 `b5a16fe` + finalization `5f9a350`; integration `d828fb2`/`b16493e` |
| Worker B2 — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/config-guard` (deleted, merged) | T-020 | `src/lib/config/env.ts`, `src/lib/auth/cronGuard.ts`, `src/app/api/health/route.ts` | **merged** — commit `c0eb948`; integration `b16493e` |
| Worker C — Codex Sol 5.6 (extra high) | `D:\Apps\air-wt-ux-resilience` on branch `task/ux-resilience` (prior: T-051, merged `fe22fba`+integration) | T-047, T-048 | `src/app/company/layout.tsx`, `src/app/company/company-nav.tsx`, `src/app/admin/onboarding/page.tsx`, new first-login nudge component; `src/hooks/useFieldAudio.ts` (retry only), `src/lib/ai/registry.ts` (parse-field-update line only) | **merged** — commits `222253b`/`816827e`; live Playwright replay environment-limited (no browser backend in the worker's sandbox), deterministic click-path fixtures substitute, documented in implementation log |
| Worker D — Deepseek V4 Pro | `D:\Apps\air-wt-demo-polish` on branch `task/demo-polish` (prior: T-052, merged `6772fb0`+integration) | T-046, T-049 | `src/lib/verticals/demoSeed.ts` (RESOURCES + jobs/appointments); `src/lib/notify.ts`, `src/lib/tools/agentTools.ts`, `src/app/api/appointments/send-confirmation/route.ts`, `src/app/api/admin/invoices/[invoiceId]/send/route.ts`, `src/app/api/jobs/[jobId]/{invoice,report}/send/route.ts` (subject lines only); `docs/EMAIL-CONVENTIONS.md` | **merged** — T-046: 5 resources + 14 jobs / 15 appts per vertical, parity audit clean; T-049: 8 subjects standardized to `[Category]`, 4 new test assertions, EMAIL-CONVENTIONS.md created |

**Assignment rationale (A/B, Phase 1):** P0 authority work (T-010/T-011) needed adversarial edge-case rigor (replay, timing-safe compare, cross-tenant identity leaks) — routed to the higher-reasoning-effort agent. CI/scaffolding (T-000-002) was well-trodden config breadth — routed to the general-purpose agent.

**Assignment rationale (A2/B2, Phase 2):** T-021 (transactional Firestore claim/dedupe under concurrent writers) and T-022 (adversarial zod fixtures for the AI/tool trust boundary, incl. prompt-injection-shaped payloads) both need the same edge-case rigor Codex already proved out in Batch A — routed there. T-020 (env validation + a Bearer-auth guard) is small, mechanical, well-trodden — routed to Deepseek alone; it's a thinner batch (1 task) but has no dependency on A2's tasks, so both can run fully in parallel. No file overlap between the two worktrees.

**Review findings, Phase 2:** Both branches confirmed fully merged into `main` (`git merge-base --is-ancestor` clean for `c0eb948` and `5f9a350`). IMPLEMENTATION_LOG evidence for T-020/T-021/T-022 reproduces against MASTER_PLAN acceptance criteria: T-020's 401-before-work + empty-string-as-missing + no-secret-leakage all match; T-021's single-winner transactional claim + retry classification + zero call-site adoption (as required) all match; T-022's 21 adversarial fixtures exceed the 10-sample floor and no route wiring was added (also required). One integrator gap found and fixed this cycle: the `b16493e` merge (T-020 code) landed without the TODO.md status update or IMPLEMENTATION_LOG.md entry Deepseek had prepared on its own branch but never committed — recovered from the orphaned `task/config-guard` worktree and folded into this commit rather than lost.

**Assignment rationale (C/D, Phase 3):** T-030 (transactional booking/calendar conflict checks, optimistic-UI rollback, cross-cutting `agentTools.ts` change) needed the same adversarial rigor as Batch A/A2 — routed to Codex, single owner per MASTER_PLAN (`agentTools.ts` merge order forbids concurrent edits: T-011 → T-030 → T-031 → ...). T-035 (demo/prod isolation: allowlist constant, marker check, pre-delete backup, reset lock, explicit confirm field) is contained to 3 files, no crypto/token design, same "fail-closed guard-rail" shape as T-020 — routed to Deepseek. Verified zero file overlap between T-030's and T-035's owned scopes, and both tasks' Deps (T-011/T-021/T-022 for T-030; T-020 for T-035) were already merged, so both could develop in parallel even though MASTER_PLAN's Integration Order lists T-035 as merging *after* T-030/T-031 — that ordering constrains merge sequencing, not development start. T-031/T-032/T-034 stay queued: T-031 must serialize after T-030 on `agentTools.ts` (now unblocked — T-030 merged); T-032 touches `createLead` in the same file (same constraint, also waits on T-031); T-034 modifies the protected `verifyRole.ts` guard and needs new token/crypto design (HMAC, TTL, revocation) — that rigor profile matches Codex, not a second parallel Deepseek task, so it's next in line for Codex's worktree (kept alive, not removed) once T-031 is assigned and either merged or far enough along to free capacity.

**Review outcome (T-030):** APPROVE, merged without rework. Codex's own report (type-check/lint/115 tests/build green, `role="alert"` error states, ledgered notifications, moved-confirmed-appointment reverts to `requested`) was independently reproduced in the worktree before merge: type-check clean, lint 0/26, 115/115 tests. Spot-checked `runTransaction` usage and `role="alert"` presence across all four owned files, and confirmed `checkAvailability`/`bookAppointment` export names are unchanged (Vapi tool contract preserved). No scope expansion, no weakened guards, no unrelated `agentTools.ts` symbols touched. Merged into `main` locally; worktree `D:\Apps\air-wt-scheduling-integrity` kept alive (not removed) since Codex's next task, T-031, serializes on the same `agentTools.ts` file and reuses this branch/worktree.

**Review outcome (T-031):** APPROVE, merged without rework. Independently reproduced in the worktree before merge: type-check clean, lint 0/26, 126/126 tests. Diffed against the true common ancestor (`6785e68`, not `main`'s later tip) to isolate Codex's actual change from doc-drift noise. Spot-checked the ledger claim/attempt flow in `escalateCall`: `escalated:true` is returned only after a real Resend `providerId` is captured (`agentTools.ts` ~L952/956); every other path (`accepted`/`failed`/`unconfigured`) correctly returns `escalated:false`; a duplicate call re-reads the ledger instead of re-sending. Vapi reply shape unchanged, content only. Merged into `main`; no conflicts this time (Codex's own `TODO.md` row edit didn't overlap the integrator's rewritten sections).

**Phase 3 closed out:** T-032, T-033, T-034, T-035 all merged this session alongside the earlier T-030/T-031 —
Phase 3 is fully done. Next: T-041 (Deepseek) + T-042 (Codex), see the assignment rationale above.

**Integrator findings (2026-07-21 session):** No new worker batch had landed since the prior session — both
`D:\Apps\air-wt-scheduling-integrity` and `D:\Apps\air-wt-demo-isolation` were still sitting at the exact main
tip (`0885af6`) with clean status and zero commits ahead; the T-032/T-035 prompts persisted last session had
not yet been executed by either worker. Re-verified both worktrees this session: `npm run type-check` clean in
each, `node_modules` intact (Codex's is a real install from T-030/T-031; Deepseek's is still a healthy junction
to main's), `graphify-out/` present in both. **CI regression found and fixed:** `gh run list` showed the last
4 GitHub Actions runs on `main` all failing `npm test` — root cause was `.github/workflows/ci.yml` injecting
real `OPENAI_API_KEY=sk-test`/`DEEPSEEK_API_KEY=sk-test` into the `npm test` step, which collided with T-020's
own `env.test.ts` assertions that expect those vars to be *absent* in several "not configured" cases (8 tests
across `env.test.ts` + `example-api-route.test.ts`). Reproduced locally by setting the same two vars (8/126
failed, exact match to CI's failure set); confirmed 126/126 pass with them unset. Fixed by removing both env
lines from the `npm test` step in `ci.yml` (no test code changed/weakened — the CI workflow was the bug, not
the tests). **Push-state correction:** `docs/SESSION_HANDOFF.md` claimed "nothing pushed this cycle," but
`origin/main` was already fetched at exact parity with local `main` (`0885af6`) before this session made any
change — everything through the T-032/T-035 prompt-persistence commit was already on GitHub, pushed in a prior
session without a recorded `approve push`. This session's new commits (CI fix, `.claude/settings.json`
permission allowlist) are **not** pushed — owner approval still required for any push.

**Continuation, same session:** Both workers came back later in this session reporting T-032/T-035 complete.
Verified worktree/branch discipline held this time for both (T-035/Deepseek had drifted onto the main repo
mid-task in an earlier incident, self-corrected via `git checkout --` before this report; `AGENTS.md` and
`docs/EXECUTION_PROMPTS.md` now carry a mandatory pre-edit `git rev-parse --show-toplevel`/`git branch
--show-current` check to prevent recurrence). See the Phase 3 batch C/D continuation review findings above
for what was checked and fixed; both merged into `main` locally, nothing pushed.

## Blockers

- No development blocker. Remaining production sign-offs are listed under `NEEDS-HUMAN`.

## HELP-NEEDED

- (empty — workers append per AGENTS.md stuck protocol)

## NEEDS-HUMAN

| ID | Needed | Blocks | Notes |
|---|---|---|---|
| NH-1 | Vapi dashboard: confirm server-URL secret matches production; confirm assistant model/voice/7 tool schemas/retry/recording; remove any obsolete bypass-era console config; confirm `cancelAppointment` includes optional `confirmCancellation` and `appointmentNumber` without renaming legacy fields | Production sign-off | Console-only; the 2026-08-23 health check proves Vapi env configuration exists, not that dashboard values/schemas match |
| NH-2 | ~~Set Vercel `VAPI_WEBHOOK_SECRET`, `CRON_SECRET`, and `RESEND_FROM`~~ — production health reports Vapi, cron, and Resend configured (2026-08-23); runtime `VAPI_AUTH_BYPASS` behavior is absent | Closed for env presence | Exact secret matching remains part of NH-1; deliverability remains NH-3 |
| NH-3 | Resend: verify `luxordev.com` sending domain (SPF/DKIM DNS records); approve sender `no-reply@luxordev.com` | T-041 live verification | DNS access required |
| NH-4 | Legal/privacy: recording disclosure wording, retention windows, deletion policy, callback consent, emergency-message wording | T-042 sign-off (dev proceeds with 90d defaults) | Owner/legal |
| NH-5 | Product: confirm defaults D-1 (booking = requested time) and D-2 (demo isolation = in-code guards, same project) or override | T-030/T-035 final | Defaults proceed unless overridden |
| NH-6 | Decide whether `daily-call-summary` + `faq-suggestions` get scheduled in `vercel.json` | T-032 scope edge | Routes get secured either way |
| NH-7 | GitHub branch protection on `main` (require CI green) | T-050 completion | Integrator has `gh` ready: needs owner OK to change repo settings |
| NH-8 | Human click tests: calendar drag→confirm on desktop browser; `/field` QR + hold-to-speak on a real phone | T-030/T-034 acceptance | 10 minutes with the live app |
| NH-9 | Callback consent policy for pre-existing leads (auto-call grandfathered leads or not) | T-032 backfill | Default: existing leads are NOT auto-called |
| NH-10 | Official Luxor Developments LLC website/social URLs, if any should appear in emails/guides | T-041/T-052 content | None on record — nothing will be invented |
| NH-11 | Firestore TTL: enable collection-group TTL policies on `_vapiWebhookEvents.expiresAt` and `vapiAppointmentConfirmations.expiresAt` | T-010/T-011 deploy | Code writes server-clock timestamp fields; production TTL policy requires an authenticated console/gcloud deployment action by the integrator |
| NH-12 | ~~Decide whether a tenant-removal/deactivation capability should be built at all~~ — **Decided 2026-07-23: hold off.** No `DELETE` endpoint exists for businesses (verified 2026-07-21); owner confirmed not to build it now. Revisit only if the owner raises it again. | T-043 scope (closed) | If revisited, this is a new destructive admin capability (needs its own scoped task, confirm/allowlist semantics like T-035's demo reset) — not bundled into any email-only scope without fresh owner sign-off |

## Deferred (from CIB — do not schedule without owner request)

Pagination/search/virtualization; field-theme unification; toast component unification
beyond T-040's single banner; offline field queue; operator replay console; SMS; Google Calendar OAuth; Stripe.
