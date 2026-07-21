# TODO.md — Live queue

Specs: `MASTER_PLAN.md`. Rules: `AGENTS.md`. State snapshot: `docs/SESSION_HANDOFF.md`.
Integration branch: `main` (local merges only — **nothing is pushed until owner says `approve push`**).

## Phase status

| Phase | Tasks | Weight | Status | Depends on |
|---|---|---|---|---|
| 0 Foundation | T-000 T-001 T-002 | 8% | **merged** (9e4ccfd) | — |
| 1 P0 authority | T-010 T-011 | 12% | **merged** (36dde56) | — |
| 2 Shared primitives | T-020 T-021 T-022 | 15% | **merged** (`d828fb2`, `b16493e`) | Phase 0 merged ✓ |
| 3 Boundary applications | T-030…T-035 | 30% | **T-030 + T-031 merged**; T-035 in progress (Deepseek, parallel); T-032…T-034 queued | Phase 1+2 merged; see agentTools.ts serialization in MASTER_PLAN §Integration order |
| 4 Operator truth/comms/privacy | T-040 T-041 T-042 | 20% | queued | Phase 3 partials (per-task deps) |
| 5 Release + cleanup + docs | T-050 T-051 T-052 | 15% | queued | Phases 1–4 merged |

Overall implementation: **45%** (Phases 0+1+2 fully merged = 35%; Phase 3's 30% weight split evenly across its
6 tasks (~5% each, no finer per-task weighting recorded) — T-030 + T-031 merged adds ~10% = **45%**). Both
independently re-verified on main post-merge: type-check clean, lint 0 errors/26 baseline warnings, build green;
full-suite `npm test` on main carries 1 pre-existing flake in `src/test-utils/example-lib.test.ts` that passes
in isolation, fails only under full-suite parallel load — unrelated to any Phase 2/3 owned file, reproduced
identically before this cycle's work began.

## Active assignments

| Agent | Worktree (absolute) | Branch | Tasks | Owned scope | Status |
|---|---|---|---|---|---|
| Worker A — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/p0-authority` (deleted, merged) | T-010, T-011 | `src/lib/vapi/verify.ts`; auth/dedupe + lookup/cancel dispatch in `src/app/api/webhooks/vapi/route.ts`; `lookupAppointment`/`cancelAppointment` symbols in `src/lib/tools/agentTools.ts`; `src/lib/vapi/__tests__/**` | **merged** — commits `e0d5699`, `3fdb15f`, merge `36dde56` |
| Worker B — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/ci-foundation` (deleted, merged) | T-000, T-001, T-002 | `package.json`+lock, `vitest.config.ts`, `.github/**`, `src/test-utils/**`, `.env.example`, `next.config.ts`, cookie lines in `src/contexts/AuthContext.tsx` | **merged** — commits `25cea58`/`824c2a4`/`14dc957`, reviewer fix `d30c58b`, merge `9e4ccfd` |
| Worker A2 — Codex Sol 5.6 (extra high) | *(worktree removed post-merge)* | `task/shared-primitives` (deleted, merged) | T-021, T-022 | `src/lib/ops/**`, `src/types/ops.ts`; `src/lib/schemas/**` | **merged** — T-021 `0ea6f87`; T-022 `b5a16fe` + finalization `5f9a350`; integration `d828fb2`/`b16493e` |
| Worker B2 — Deepseek V4 Pro | *(worktree removed post-merge)* | `task/config-guard` (deleted, merged) | T-020 | `src/lib/config/env.ts`, `src/lib/auth/cronGuard.ts`, `src/app/api/health/route.ts` | **merged** — commit `c0eb948`; integration `b16493e` |
| Worker C — Codex Sol 5.6 (extra high) | `D:\Apps\air-wt-scheduling-integrity` (kept alive for T-032 next) | `task/scheduling-integrity` | T-030, T-031 | `escalateCall`/booking symbols in `src/lib/tools/agentTools.ts`; escalation + booking routes; calendar page; focused tests | **both merged** — T-030 `1919c35`/integration `6785e68`; T-031 `6d25768`/integration (this commit) |
| Worker D — Deepseek V4 Pro | `D:\Apps\air-wt-demo-isolation` | `task/demo-isolation` | T-035 | `src/app/api/admin/demo-customize/route.ts`, `src/lib/verticals/demoSeed.ts` (isDemo marker), `src/app/admin/demo/page.tsx` (confirm field), seed script marker line | **assigned** — worktree created, no commits yet |

**Assignment rationale (A/B, Phase 1):** P0 authority work (T-010/T-011) needed adversarial edge-case rigor (replay, timing-safe compare, cross-tenant identity leaks) — routed to the higher-reasoning-effort agent. CI/scaffolding (T-000-002) was well-trodden config breadth — routed to the general-purpose agent.

**Assignment rationale (A2/B2, Phase 2):** T-021 (transactional Firestore claim/dedupe under concurrent writers) and T-022 (adversarial zod fixtures for the AI/tool trust boundary, incl. prompt-injection-shaped payloads) both need the same edge-case rigor Codex already proved out in Batch A — routed there. T-020 (env validation + a Bearer-auth guard) is small, mechanical, well-trodden — routed to Deepseek alone; it's a thinner batch (1 task) but has no dependency on A2's tasks, so both can run fully in parallel. No file overlap between the two worktrees.

**Review findings, Phase 2:** Both branches confirmed fully merged into `main` (`git merge-base --is-ancestor` clean for `c0eb948` and `5f9a350`). IMPLEMENTATION_LOG evidence for T-020/T-021/T-022 reproduces against MASTER_PLAN acceptance criteria: T-020's 401-before-work + empty-string-as-missing + no-secret-leakage all match; T-021's single-winner transactional claim + retry classification + zero call-site adoption (as required) all match; T-022's 21 adversarial fixtures exceed the 10-sample floor and no route wiring was added (also required). One integrator gap found and fixed this cycle: the `b16493e` merge (T-020 code) landed without the TODO.md status update or IMPLEMENTATION_LOG.md entry Deepseek had prepared on its own branch but never committed — recovered from the orphaned `task/config-guard` worktree and folded into this commit rather than lost.

**Assignment rationale (C/D, Phase 3):** T-030 (transactional booking/calendar conflict checks, optimistic-UI rollback, cross-cutting `agentTools.ts` change) needed the same adversarial rigor as Batch A/A2 — routed to Codex, single owner per MASTER_PLAN (`agentTools.ts` merge order forbids concurrent edits: T-011 → T-030 → T-031 → ...). T-035 (demo/prod isolation: allowlist constant, marker check, pre-delete backup, reset lock, explicit confirm field) is contained to 3 files, no crypto/token design, same "fail-closed guard-rail" shape as T-020 — routed to Deepseek. Verified zero file overlap between T-030's and T-035's owned scopes, and both tasks' Deps (T-011/T-021/T-022 for T-030; T-020 for T-035) were already merged, so both could develop in parallel even though MASTER_PLAN's Integration Order lists T-035 as merging *after* T-030/T-031 — that ordering constrains merge sequencing, not development start. T-031/T-032/T-034 stay queued: T-031 must serialize after T-030 on `agentTools.ts` (now unblocked — T-030 merged); T-032 touches `createLead` in the same file (same constraint, also waits on T-031); T-034 modifies the protected `verifyRole.ts` guard and needs new token/crypto design (HMAC, TTL, revocation) — that rigor profile matches Codex, not a second parallel Deepseek task, so it's next in line for Codex's worktree (kept alive, not removed) once T-031 is assigned and either merged or far enough along to free capacity.

**Review outcome (T-030):** APPROVE, merged without rework. Codex's own report (type-check/lint/115 tests/build green, `role="alert"` error states, ledgered notifications, moved-confirmed-appointment reverts to `requested`) was independently reproduced in the worktree before merge: type-check clean, lint 0/26, 115/115 tests. Spot-checked `runTransaction` usage and `role="alert"` presence across all four owned files, and confirmed `checkAvailability`/`bookAppointment` export names are unchanged (Vapi tool contract preserved). No scope expansion, no weakened guards, no unrelated `agentTools.ts` symbols touched. Merged into `main` locally; worktree `D:\Apps\air-wt-scheduling-integrity` kept alive (not removed) since Codex's next task, T-031, serializes on the same `agentTools.ts` file and reuses this branch/worktree.

**Review outcome (T-031):** APPROVE, merged without rework. Independently reproduced in the worktree before merge: type-check clean, lint 0/26, 126/126 tests. Diffed against the true common ancestor (`6785e68`, not `main`'s later tip) to isolate Codex's actual change from doc-drift noise. Spot-checked the ledger claim/attempt flow in `escalateCall`: `escalated:true` is returned only after a real Resend `providerId` is captured (`agentTools.ts` ~L952/956); every other path (`accepted`/`failed`/`unconfigured`) correctly returns `escalated:false`; a duplicate call re-reads the ledger instead of re-sending. Vapi reply shape unchanged, content only. Merged into `main`; no conflicts this time (Codex's own `TODO.md` row edit didn't overlap the integrator's rewritten sections).

**Next for Worker C (Codex):** T-032 — Cron correctness + callback state machine — is now unblocked (`createLead` in `agentTools.ts` may only be edited after T-031 merges, which just happened). Same worktree/branch, next self-contained prompt should point there. T-034 (scoped field tokens, touches protected `verifyRole.ts`) remains queued behind it for the same agent unless the owner wants a third worktree opened in parallel.

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

## Deferred (from CIB — do not schedule without owner request)

Pagination/search/virtualization; richer demo seed data; field-theme unification; toast component unification
beyond T-040's single banner; offline field queue; operator replay console; SMS; Google Calendar OAuth; Stripe.
