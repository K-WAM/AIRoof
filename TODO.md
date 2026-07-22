# TODO.md — Live queue

Specs: `MASTER_PLAN.md`. Rules: `AGENTS.md`. State snapshot: `docs/SESSION_HANDOFF.md`.
Integration branch: `main` (local merges only — **nothing is pushed until owner says `approve push`**).

## Phase status

| Phase | Tasks | Weight | Status | Depends on |
|---|---|---|---|---|
| 0 Foundation | T-000 T-001 T-002 | 8% | **merged** (9e4ccfd) | — |
| 1 P0 authority | T-010 T-011 | 12% | **merged** (36dde56) | — |
| 2 Shared primitives | T-020 T-021 T-022 | 15% | **merged** (`d828fb2`, `b16493e`) | Phase 0 merged ✓ |
| 3 Boundary applications | T-030…T-035 | 30% | **all 6 tasks merged** — Phase complete | Phase 1+2 merged; see agentTools.ts serialization in MASTER_PLAN §Integration order |
| 4 Operator truth/comms/privacy | T-040 T-041 T-042 T-043 T-044 T-045 | 20% | T-041 + T-042 assigned this round; T-040/T-043/T-044/T-045 queued behind them (file-overlap — see below) | Phase 3 merged ✓; T-043/044/045 depend only on T-020 (already merged) |
| 5 Release + cleanup + docs | T-050 T-051 T-052 | 15% | queued | Phases 1–4 merged |

Overall implementation: **65%** (Phases 0+1+2+3 fully merged = 35% + 30% = 65%). Phase 3 is now fully closed —
T-033 and T-034 merged this cycle alongside the already-merged T-030/T-031/T-032/T-035. Independently
re-verified on main post-merge: type-check clean, lint 0 errors/26 baseline warnings, build green, `npm test`
**223/223 clean** (155 baseline + 54 T-033 + 14 T-034). GitHub Actions CI was found red for ~9 hours/4 pushes
on an unrelated CI-workflow bug (env var leakage) earlier this session, fixed — see `docs/SESSION_HANDOFF.md`.

**Phase 4 file-overlap note:** T-040 and T-045 both touch the same company/admin page files (broad sweeps) —
cannot run in parallel. T-041, T-043, and T-044 all touch `src/lib/notify.ts` — cannot run all three in
parallel either. Only fully non-overlapping pair available right now: **T-041 + T-042**. Assigned this round;
T-040/T-043/T-044/T-045 queue behind them. Doing T-041 first (rather than T-043/T-044) also avoids a near-term
`notify.ts` rewrite churn — T-043/T-044 were designed to ship via direct Resend now and migrate onto
`src/lib/comms/send.ts` once T-041 lands, so sequencing T-041 first means they migrate onto something that
already exists instead of being rewritten twice.

**Review findings, Phase 3 batch C/D continuation (T-032, T-035):** Both independently re-verified in their
worktrees before merge (type-check/lint/build clean; tests green — T-032 143/143, T-035 138/138) and again on

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

**2026-07-21 scope addition:** T-043/T-044/T-045 added to Phase 4 at the owner's request (tenant-creation
email, feedback form, icon-consistency sweep — see MASTER_PLAN.md). These are smaller/lower-risk than the
original CIB-audit-derived Phase 4 tasks (no security-boundary or auth changes), so they are **not** each
worth a full 1/6 share of Phase 4's 20% weight; treat the 20% as still dominated by T-040/041/042 until a more
precise split is needed. Not yet assigned to a worker — next in line, see Next eligible work below.

## Active assignments

| Agent | Worktree (absolute) | Branch | Tasks | Owned scope | Status |
|---|---|---|---|---|---|
| Worker A — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/p0-authority` (deleted, merged) | T-010, T-011 | `src/lib/vapi/verify.ts`; auth/dedupe + lookup/cancel dispatch in `src/app/api/webhooks/vapi/route.ts`; `lookupAppointment`/`cancelAppointment` symbols in `src/lib/tools/agentTools.ts`; `src/lib/vapi/__tests__/**` | **merged** — commits `e0d5699`, `3fdb15f`, merge `36dde56` |
| Worker B — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/ci-foundation` (deleted, merged) | T-000, T-001, T-002 | `package.json`+lock, `vitest.config.ts`, `.github/**`, `src/test-utils/**`, `.env.example`, `next.config.ts`, cookie lines in `src/contexts/AuthContext.tsx` | **merged** — commits `25cea58`/`824c2a4`/`14dc957`, reviewer fix `d30c58b`, merge `9e4ccfd` |
| Worker A2 — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/shared-primitives` (deleted, merged) | T-021, T-022 | `src/lib/ops/**`, `src/types/ops.ts`; `src/lib/schemas/**` | **merged** — T-021 `0ea6f87`; T-022 `b5a16fe` + finalization `5f9a350`; integration `d828fb2`/`b16493e` |
| Worker B2 — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/config-guard` (deleted, merged) | T-020 | `src/lib/config/env.ts`, `src/lib/auth/cronGuard.ts`, `src/app/api/health/route.ts` | **merged** — commit `c0eb948`; integration `b16493e` |
| Worker C — Codex Sol 5.6 (extra high) | *(prior)* `air-wt-field-tokens` on `task/field-tokens` (T-034, merged: `02232e2`+integration) → *(now)* `D:\Apps\air-wt-pii-retention` on branch `task/pii-retention` | T-042 | `src/lib/audit/**` (new), `src/app/api/cron/retention/route.ts` (new), `src/app/api/calls/[callId]/route.ts` (DELETE), audit-log lines in `src/app/api/webhooks/vapi/route.ts` | **assigned** — worktree renamed/reassigned this session, `npm run type-check` verified clean |
| Worker D — Deepseek V4 Pro | *(prior)* `air-wt-ai-input-hardening` on `task/ai-input-hardening` (T-033, merged: `93a9d7c`+integration) → *(now)* `D:\Apps\air-wt-unified-comms` on branch `task/unified-comms` | T-041 | `src/lib/comms/**` (new), `src/lib/notify.ts`, email call sites in `agentTools.ts`/`send-confirmation`/`assign`/report+invoice send routes | **assigned** — worktree renamed/reassigned this session, node_modules junction + graphify-out carried over, `npm run type-check` verified clean |

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

- None for Batch A/B. T-010 **deploy** (not development) is blocked on NH-1 + NH-2.

## HELP-NEEDED

- (empty — workers append per AGENTS.md stuck protocol)

## NEEDS-HUMAN

| ID | Needed | Blocks | Notes |
|---|---|---|---|
| NH-1 | Vapi dashboard: set server-URL secret; confirm assistant model/voice/7 tool schemas/retry/recording; remove any bypass config; extend `cancelAppointment` with optional `confirmCancellation` (boolean) and `appointmentNumber` (integer) parameters without renaming the tool or legacy `appointmentId` | T-010/T-011 deploy | Console-only; CLI cannot read Vapi dashboard |
| NH-2 | Vercel env: set `VAPI_WEBHOOK_SECRET` (must match NH-1), `CRON_SECRET`, `RESEND_FROM=no-reply@luxordev.com`; **remove `VAPI_AUTH_BYPASS`** | T-010/T-032/T-041 deploy | Integrator can run `vercel env add` after `vercel link` once owner approves values; owner may just say "generate CRON_SECRET yourself" |
| NH-3 | Resend: verify `luxordev.com` sending domain (SPF/DKIM DNS records); approve sender `no-reply@luxordev.com` | T-041 live verification | DNS access required |
| NH-4 | Legal/privacy: recording disclosure wording, retention windows, deletion policy, callback consent, emergency-message wording | T-042 sign-off (dev proceeds with 90d defaults) | Owner/legal |
| NH-5 | Product: confirm defaults D-1 (booking = requested time) and D-2 (demo isolation = in-code guards, same project) or override | T-030/T-035 final | Defaults proceed unless overridden |
| NH-6 | Decide whether `daily-call-summary` + `faq-suggestions` get scheduled in `vercel.json` | T-032 scope edge | Routes get secured either way |
| NH-7 | GitHub branch protection on `main` (require CI green) | T-050 completion | Integrator has `gh` ready: needs owner OK to change repo settings |
| NH-8 | Human click tests: calendar drag→confirm on desktop browser; `/field` QR + hold-to-speak on a real phone | T-030/T-034 acceptance | 10 minutes with the live app |
| NH-9 | Callback consent policy for pre-existing leads (auto-call grandfathered leads or not) | T-032 backfill | Default: existing leads are NOT auto-called |
| NH-10 | Official Luxor Developments LLC website/social URLs, if any should appear in emails/guides | T-041/T-052 content | None on record — nothing will be invented |
| NH-11 | Firestore TTL: enable collection-group TTL policies on `_vapiWebhookEvents.expiresAt` and `vapiAppointmentConfirmations.expiresAt` | T-010/T-011 deploy | Code writes server-clock timestamp fields; production TTL policy requires an authenticated console/gcloud deployment action by the integrator |
| NH-12 | Decide whether a tenant-removal/deactivation capability should be built at all (no `DELETE` endpoint exists for businesses today — verified 2026-07-21) | T-043 scope | If wanted, this is a new destructive admin capability (needs its own scoped task, confirm/allowlist semantics like T-035's demo reset) — not bundled into T-043's email-only scope without owner sign-off |

## Deferred (from CIB — do not schedule without owner request)

Pagination/search/virtualization; richer demo seed data; field-theme unification; toast component unification
beyond T-040's single banner; offline field queue; operator replay console; SMS; Google Calendar OAuth; Stripe.
