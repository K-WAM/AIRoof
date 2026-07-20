# TODO.md — Live queue

Specs: `MASTER_PLAN.md`. Rules: `AGENTS.md`. State snapshot: `docs/SESSION_HANDOFF.md`.
Integration branch: `main` (local merges only — **nothing is pushed until owner says `approve push`**).

## Phase status

| Phase | Tasks | Weight | Status | Depends on |
|---|---|---|---|---|
| 0 Foundation | T-000 T-001 T-002 | 8% | **assigned** (Batch B) | — |
| 1 P0 authority | T-010 T-011 | 12% | **assigned** (Batch A) | — (rebase on Batch B at integration) |
| 2 Shared primitives | T-020 T-021 T-022 | 15% | queued | Phase 0 merged |
| 3 Boundary applications | T-030…T-035 | 30% | queued | Phase 1+2 merged; see agentTools.ts serialization in MASTER_PLAN §Integration order |
| 4 Operator truth/comms/privacy | T-040 T-041 T-042 | 20% | queued | Phase 3 partials (per-task deps) |
| 5 Release + cleanup + docs | T-050 T-051 T-052 | 15% | queued | Phases 1–4 merged |

Overall implementation: **0%** (planning artifacts complete 2026-07-20).

## Active assignments

| Agent | Worktree (absolute) | Branch | Tasks | Owned scope | Status |
|---|---|---|---|---|---|
| Worker A | `D:\Apps\air-wt-p0-authority` | `task/p0-authority` | T-010, T-011 | `src/lib/vapi/verify.ts`; auth/dedupe + lookup/cancel dispatch in `src/app/api/webhooks/vapi/route.ts`; `lookupAppointment`/`cancelAppointment` symbols in `src/lib/tools/agentTools.ts`; `src/lib/vapi/__tests__/**` | ready — not started |
| Worker B | `D:\Apps\air-wt-ci-foundation` | `task/ci-foundation` | T-000, T-001, T-002 | `package.json`+lock, `vitest.config.ts`, `.github/**`, `src/test-utils/**`, `.env.example`, `next.config.ts`, cookie lines in `src/contexts/AuthContext.tsx` | ready — not started |

Integration order: Batch B merges first; Batch A rebases on merged main (package.json belongs to B — A uses
`npm install --no-save vitest` meanwhile).

## Blockers

- None for Batch A/B. T-010 **deploy** (not development) is blocked on NH-1 + NH-2.

## HELP-NEEDED

- (empty — workers append per AGENTS.md stuck protocol)

## NEEDS-HUMAN

| ID | Needed | Blocks | Notes |
|---|---|---|---|
| NH-1 | Vapi dashboard: set server-URL secret; confirm assistant model/voice/7 tool schemas/retry/recording; remove any bypass config | T-010 deploy | Console-only; CLI cannot read Vapi dashboard |
| NH-2 | Vercel env: set `VAPI_WEBHOOK_SECRET` (must match NH-1), `CRON_SECRET`, `RESEND_FROM=no-reply@luxordev.com`; **remove `VAPI_AUTH_BYPASS`** | T-010/T-032/T-041 deploy | Integrator can run `vercel env add` after `vercel link` once owner approves values; owner may just say "generate CRON_SECRET yourself" |
| NH-3 | Resend: verify `luxordev.com` sending domain (SPF/DKIM DNS records); approve sender `no-reply@luxordev.com` | T-041 live verification | DNS access required |
| NH-4 | Legal/privacy: recording disclosure wording, retention windows, deletion policy, callback consent, emergency-message wording | T-042 sign-off (dev proceeds with 90d defaults) | Owner/legal |
| NH-5 | Product: confirm defaults D-1 (booking = requested time) and D-2 (demo isolation = in-code guards, same project) or override | T-030/T-035 final | Defaults proceed unless overridden |
| NH-6 | Decide whether `daily-call-summary` + `faq-suggestions` get scheduled in `vercel.json` | T-032 scope edge | Routes get secured either way |
| NH-7 | GitHub branch protection on `main` (require CI green) | T-050 completion | Integrator has `gh` ready: needs owner OK to change repo settings |
| NH-8 | Human click tests: calendar drag→confirm on desktop browser; `/field` QR + hold-to-speak on a real phone | T-030/T-034 acceptance | 10 minutes with the live app |
| NH-9 | Callback consent policy for pre-existing leads (auto-call grandfathered leads or not) | T-032 backfill | Default: existing leads are NOT auto-called |
| NH-10 | Official Luxor Developments LLC website/social URLs, if any should appear in emails/guides | T-041/T-052 content | None on record — nothing will be invented |

## Deferred (from CIB — do not schedule without owner request)

Pagination/search/virtualization; richer demo seed data; field-theme unification; toast component unification
beyond T-040's single banner; offline field queue; operator replay console; SMS; Google Calendar OAuth; Stripe.
