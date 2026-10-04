# TODO.md — Live queue

Specs: `MASTER_PLAN.md`, and for Phase 12 specifically `docs/PLATFORM-EXPANSION-PLAN.md`. Rules: `AGENTS.md`.
State snapshot: `docs/SESSION_HANDOFF.md`.
Integration branch: `main`. Owner reviewed and pushed the 2026-08-23 maintenance cleanup this session
(`c8487ed`), plus a 3-vertical expansion on top of it (`1d2f840`) — both on `origin/main`.

## Current snapshot

**Phase 33 (roofing hardening + Nielsen audit, 2026-10-03) — on branch `ccr-8c0916c7-3r7kkm`, NOT merged/deployed.**
Security fixes on the field-QR write paths, the duplicate-job and invoice-Send bugs, ~10x fewer live-refresh reads,
per-screen declutter. Write-up: `docs/USABILITY-AUDIT-2026-10-03.md`. 2026-10-04: T-172–T-179 done, T-181 field-updates pass done (which job / who / time clock); T-180 planned only; NH-32 open. Clarity guideline: `docs/SCREEN-CLARITY-HEURISTICS.md` (C1–C10); phone audit found Pipeline, Jobs list and Calls still cluttered (T-182–T-184).

**Phase 32 (screen + security audit, T-157–T-171) — PUSHED + DEPLOYED 2026-09-29** (`0b09946`, crm.luxordev.com Ready, health ok;
`firestore:rules` released — the custom claim is now the only superadmin authority, so NH-28's stale doc flag is inert). Built as four
parallel streams (Claude: security/phone lines/texts; Codex ×2: company screens + documents/Team/Settings; Deepseek: shared UI + admin
area); details in the Phase 32 section below. **Still owed:** the owner's real booking call + transcript read (Booking-change gate —
agent tests don't exercise the changed dispatcher code because test tool calls are mocked; with `SMS_ENABLED` absent in production the
caller-facing wording is unchanged), then the NH-30 decisions and NH-31 production cleanup.

**Phase 12 (owner-added platform expansion) — CLOSED 2026-09-16, all 7 sub-phases shipped, merged and
pushed to `main`/`origin/main`.** Full spec: `docs/PLATFORM-EXPANSION-PLAN.md` (per-phase "Shipped" notes
document every deviation). Full session narrative: `HANDOFF.md`. One line per phase:

- **T-088 (Foundation/speed/field-URL fix)** — dropped the ~281KB `@firebase/firestore` chunk from every
  authenticated page (`/api/auth/profile` + `/api/company/bootstrap`); closed a real security hole
  (`GET /api/company/settings` had no auth check); fixed the field screen's URL (bare `/field`, no token
  in the address bar); fixed a live cross-tenant bug (manifest `start_url` always opened the demo tenant).
- **T-089 (Customers)** — `businesses/{bid}/customers`, instant zero-network in-memory cross-job search, a
  job-create combobox, a `matchKey`-based find-or-create, a backfill script.
- **T-090 (Time clock)** — six-punch state machine, an immutable `punches` ledger, an atomic cross-job
  guard, a nightly auto-close cron; punched hours now shadow spoken labor in the invoice (LLM stays out of
  arithmetic). Deferred: a persisted `timesheets` collection, an admin time-edit sheet, Labor-tab
  provenance chips.
- **T-091 (Photos)** — before/after/other phasing, `MAX_PHOTOS_PER_JOB` 10→24, a batched blob endpoint
  (kills the report's old N+1), the report grid rewritten (no crop/no dead space), a `PhotoEditSheet` for
  after-the-fact label/phase edits. Deferred: a field-side photo gallery, drag-reorder, the `comfortable`
  density variant.
- **T-092 (Invoice persistence)** — real `businesses/{bid}/invoices` persistence (was ephemeral React
  state before), a shared `jobInvoice.ts` module so client/server totals can't drift, `hideMaterials` now
  collapses materials everywhere it's promised (email + in-app print/PDF), a letterhead redesign matching
  a real customer-supplied invoice sample (fixed two real bugs found along the way: the invoice number and
  a nonexistent `biz.phone` field). Deferred: the two-pane live-preview redesign (existing in-place WYSIWYG
  editing already serves that need).
- **T-093 (Spanish)** — Whisper auto-detect (voice) + a stopword/diacritic heuristic (typed text) feed one
  `parseFieldUpdate` LANGUAGE block that always extracts structured data in English and returns a
  `transcriptEn` translation; an ES→EN toggle badge on both field screens; a live phone-AI language toggle
  (pushes via `updateAssistantPersona`, which now always preserves `startSpeakingPlan`/`stopSpeakingPlan`
  on every PATCH — a permanent hardening from the 2026-09-07 gpt-realtime incident). **Deliberately not
  done:** a language-specific Vapi voice (no confirmed Spanish `voiceId` exists — NH-15/16 below) and
  bilingual/"multi" transcriber mode.
- **T-094 (Trade roles)** — a `trade` field on `TeamMember`, separate from the `TeamRole` permission axis;
  `defaultLandingPath()` routes a field trade/foreman to the right post-login screen; `/company/field`
  scopes to a worker's own crew and shows real names instead of emails.
- **Logo library (Phase 4 remainder)** — upload/variant/default library wired into the invoice letterhead,
  emailed invoice, and job report cover; fixed a real live bug where the report's colored header bar
  flattened every logo (including full-color ones) to a white silhouette.

Verified across all Phase 12 commits: `tsc`/`eslint` clean, `vitest run` all green (a couple of runs hit
the long-documented concurrent-load flake pattern, always clean on retry), `next build` green every time.

**Also shipped this window:** the Google sign-in `auth/internal-error` bug is fixed (`signInWithPopup` →
`signInWithRedirect`, which doesn't depend on the third-party-storage relay that was failing) — committed
and pushed (`7aa1f85`). A full end-to-end trace of the roofing demo→job→invoice pipeline and the
onboarding→team-invite flow (2026-09-08) found the whole chain connected and code-correct; the 6 minor
gaps it surfaced are tracked as Phase 11 (T-081–086 below), none demo-blocking.

**Baseline facts:** scoped implementation 100% (production certification still pending the `NEEDS-HUMAN`
items below); `main` is ahead of `origin/main` with unpushed local work (T-095 base-URL parameterization,
the Phase 14 TODO entries, and the merged T-098/T-099 verticals — all 2026-09-23, awaiting owner push
approval); production `/api/health` reports Firestore connected and
OpenAI/DeepSeek/Resend/Vapi/Firebase/cron all configured; the platform templates 13 industries (see
`src/lib/verticals/templates.ts`).

*Full dated session narratives (what shipped, what was found, what verification ran) live in `HANDOFF.md`
and `docs/SESSION_HANDOFF.md` — this file tracks the live queue and current state, not the story. Detailed
per-task assignment/review history below "Historical assignments" is retained as execution evidence, not
an active queue.*

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
| 7 QoL & Multi-Vertical Expansion (owner-added) | T-053…T-060 | not CIB-weighted | 🕓 **in progress — 6/8** | Owner prioritization pending |
| 8 Hardening, Performance & Discoverability (owner-added) | T-061…T-074 | not CIB-weighted | 🕓 **in progress — 12/14** | Owner prioritization pending |
| 9 UI/UX Modernization Pass (owner-added, 2026-09-06) | T-075… | not CIB-weighted | 🕓 **in progress — 4 slices done** | Open-ended, self-selected per slice |
| 10 Client Management (owner-added, 2026-09-07) | T-079, T-080 | not CIB-weighted | ✅ **done** | Independent of Phase 9 |
| 11 Pre-Demo Polish (owner-added, 2026-09-08) | T-081…T-087 | not CIB-weighted | 🕓 **6/7 — only T-081 (Stripe key in Vercel, NH-14) left, human-only** | T-082–T-086 closed 2026-09-23; T-082's real gating fix is an owner decision (NH-19) |
| 12 Platform Expansion: Speed, Customers, Photos, Invoicing, Time Clock, Spanish & Roles (owner-added, 2026-09-14) | T-088…T-094 | not CIB-weighted | ✅ **done — 7/7 (2026-09-16)** | Full spec in `docs/PLATFORM-EXPANSION-PLAN.md`; only NH-15/16 (Spanish voice pick + live verification) remain, human-only |
| 13 CRM rebrand / domain migration to `luxordev.com` (owner-added, 2026-09-16) | T-095…T-097 | not CIB-weighted | 🕓 **3/3 code-side done — NH-17 (env var + DNS/console setup) is the only thing left** | `crm.luxordev.com` is live; T-096 (Google sign-in CSP fix), T-097 (Jobs search) shipped 2026-09-16; T-095 (BASE_URL → `NEXT_PUBLIC_APP_URL`) shipped 2026-09-23, committed locally (`6d9157e`), not yet pushed |
| 14 New Verticals: Care Homes & Daycares (owner-added, 2026-09-23) | T-098, T-099 | not CIB-weighted | ✅ **done — 2/2 (2026-09-23), merged locally, not pushed** | Same `VerticalTemplate` pattern as T-078; only NH-18 (live-call verification of the safety boundaries) remains, human-only |
| 15 Industry Peripherals (owner-added, 2026-09-23) | T-100, T-101 | not CIB-weighted | ✅ **done — 2/2 (2026-09-23), merged and pushed** | Same skeleton for every industry; only the peripherals (intake fields, starter kits, dashboard tiles) differ, each declared in one per-vertical record — see the Phase 15 section |
| 16 Call Compliance & Voice (owner-added, 2026-09-23) | T-102, T-103 | not CIB-weighted | 🕓 **T-102 review (2026-09-24), T-103 assigned** | T-102: per-tenant recording disclosure (no disclosure exists today — NH-4); T-103: per-tenant/per-language voice override so a better voice (ElevenLabs/Cartesia) and a Spanish voice can be set without code. Click-by-click owner steps: `docs/NEEDS-HUMAN-CHECKLIST.md` |
| 17 Work Catalog & Bilingual Line (owner-added, 2026-09-24) | T-105 (a+b), T-106 | not CIB-weighted | 🕓 **T-105 (a+b) done + merged 2026-09-24; T-106 open (after the T-110 bake-off)** | T-105: generic problems + standard solutions in the Library, ticked per job into Report / Invoice / Quote; T-106: one phone line that serves English and Spanish callers |
| 18 Document Suite, Job Intake & Voice Platform (owner vision, 2026-09-24) | T-107…T-110 | not CIB-weighted | 🕓 **logged 2026-09-24; T-110 is tomorrow's session** | One consistent, modern quote/invoice/report suite with hide-materials/labor + logo everywhere; jobs created from calls and email; the best-sounding phone AI, chosen by a scripted bake-off (`docs/VOICE-RESEARCH-2026-09-24.md`) |
| 19 ElevenLabs switch-over scaffolding (owner-added, 2026-09-24) | T-111a/b, T-112 | not CIB-weighted | 🕓 **T-111 assigned 2026-09-24; T-112 todo list** | Per-tenant `voiceProvider` (vapi default / elevenlabs) so calls can move to ElevenLabs Agents if the T-110 bake-off says so — field notes/reports are unaffected (they use Whisper + GPT-4o, not the phone provider) |
| 20 Request Review Workflow & UX Pass (owner-added, 2026-09-24) | T-113, T-114 | not CIB-weighted | 🕓 **T-114 review; T-113 merged to main 2026-09-25 (owner live-test pending)** | Phone AI captures a request -> admin reviews it in one clear card -> accept (confirm + create the job yourself) or decline (polite email); never auto-create jobs. Plus feedback fix (client-only) + app-shell UX pass |
| 21 Demo Experience (owner-added, 2026-09-24) | T-115, T-116 | not CIB-weighted | 🕓 **logged** | Prospects can try the phone AI AND see what it produced: browser talk-to widget on `/try/*` (T-115) and a refreshed demo/onboarding playbook that matches the shipped product (T-116) |
| 22 Vapi -> ElevenLabs migration (owner direction, 2026-09-24) | T-117 | not CIB-weighted | 🕓 **P0 done; P1 next** | Tenant-by-tenant rollout behind `voiceProvider`, Vapi kept as instant rollback until ~30 stable days; owner sign-off gates demo-line switch, default-for-new-clients, and Vapi decommission |

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
- [ ] Phase 7 — QoL & Multi-Vertical Expansion (owner-added, from the 2026-08-27 audit) — 6/8
  - [x] T-053 — Retire the dead `agentVoice` field (removed, not wired — see 2026-09-02 review note)
  - [ ] T-054 — In-app Vapi provisioning (assistant + number, incl. Canadian import)
  - [x] T-055 — Split demo/onboarding into a dedicated hub (done 2026-09-07). Owner picked this off a 3-option
        menu of the phase's remaining tasks (T-054/T-055/T-058) since each genuinely needed a call — T-055 was
        the fully self-contained one, no external credential or library choice required. Demo Studio, the
        onboarding wizard, and Playbooks/Guide moved from `/admin/{demo,onboarding,guide}` to their own
        `/hub/*` route group (`git mv`, history preserved); Businesses/Usage/Invoices stay under `/admin`. New
        `src/app/hub/layout.tsx` reuses the exact same superadmin gate and `.admin-shell`/`.admin-nav` CSS as
        `AdminShell` — re-route/re-skin, not a redesign or new auth system, per the spec's constraint. New
        `src/app/hub/hub-nav.tsx` carries the three moved pages plus the "Demo (Apex Roofing)" quick-view
        shortcuts (moved out of `admin-nav.tsx`, which now only has Clients/Usage/Invoices/Feedback + one
        "Open Hub →" link back). `src/middleware.ts` gates `/hub` exactly like `/admin`/`/company`. Old links
        redirect via a new `next.config.ts` `redirects()` (307/temporary, bare path + `:path*` sub-paths) —
        confirmed live in a real build's `routes-manifest.json`, not just configured on paper. Updated every
        doc where the old path was current instruction, not historical narrative: `CLAUDE.md`,
        `docs/ADMIN-ONBOARDING.md`, `docs/ADMIN-QUICK-START.md`, `docs/TESTING.md`, `docs/README.md`, all 6
        literal URLs in `public/guides/onboarding-guide.html`. Deliberately left `docs/HANDOFF.md` alone — it's
        already stale in unrelated ways (a 4-tab Playbooks page, a 5-step wizard, neither true today), so it's
        historical, not current. No Next e2e harness exists in this repo, so new `middleware.test.ts` +
        `next-config-redirects.test.ts` stand in for the spec's "route test" ask — full detail, including
        exactly what each covers, in `MASTER_PLAN.md`'s T-055 entry. Verified: `tsc` clean (after clearing a
        stale `.next/types` cache left by the pre-move build — a cache artifact, not a real error), lint 0/21
        (unchanged baseline), `vitest run` 450/450 (up from 442, +8 new; same 3 pre-existing concurrent-load
        flakes reconfirmed clean in isolation), `next build` green with `/hub/*` present and `/admin/{demo,
        onboarding,guide}` correctly absent (moved, not duplicated). **Pushed and live** (2026-09-07, combined
        with T-079 in one commit `472d14f`, owner said "commit and push to github"). Post-push production
        check caught its own tooling gap: an initial `vercel ls`-based "is the deploy Ready?" check false-
        positived immediately, because `ai-roof`'s deployments list always has *older* Ready rows and a naive
        grep for "Ready" anywhere in that output matches one of those instead of the new deployment — switched
        to `vercel inspect <specific-deployment-url>` (from the `vercel ls` row just created by this push) and
        polled that one deployment's own `status` field until it left "Building." Once Ready, confirmed the
        actual point of this task directly against production: `curl` against `ai-roof.vercel.app/admin/demo`,
        `/admin/onboarding`, and `/admin/guide` each returned `307` with the correct `/hub/*` `Location`
        header — not just verified locally.
  - [x] T-056 — Per-industry visual families in the company portal (done 2026-09-05, see note below)
  - [x] T-057 — Post-sale client talk-track content (done 2026-09-03)
  - [ ] T-058 — AI-authored document layer + server-side PDF generation
  - [x] T-059 — Cleanup: Twilio type debris + archive stale planning docs
  - [x] T-060 — Voice-model evaluation → shipped GPT Realtime + cedar live (2026-09-05), **reverted 2026-09-07**
        after a live call found broken turn-taking; back to gpt-4o-mini + Vapi Voices v2 Savannah (see note below)
- [ ] Phase 8 — Hardening, Performance & Discoverability (owner-added, 2026-09-01) — 12/14
      **Suggested order** (quick/independent wins first, riskiest last — not a strict dependency chain):
      T-064 (owner deferred, 2026-09-02) → T-061 ✓ → {T-067 ✓, T-068 ✓, T-069 ✓} → T-063 ✓ → T-065 ✓ → T-062 (CI half ✓, firebase-admin v14 half still open) → T-066 ✓ → T-070 ✓ → T-071 ✓ → T-072 ✓ → T-073 ✓ → T-074 ✓ (2026-09-06)
  - [x] T-061 — Enforce Content-Security-Policy + self-host fonts (security *and* a load-speed win — merged
        from two separate findings so the font migration isn't done twice)
  - [ ] T-062 — Dependency-vulnerability remediation + CI gate (`npm audit`, firebase-admin v14) — CI-gate half
        done (`27b8556`); firebase-admin v14 half attempted 2026-09-04, broke production (`ERR_REQUIRE_ESM` via
        `jwks-rsa`/`jose`), reverted — blocked on an upstream fix, see the live-incident entry below
  - [x] T-063 — Rate limiting / abuse throttling on public-facing endpoints
  - [ ] T-064 — Secrets hygiene: mark 7 credential vars `Secret` type in Vercel (owner deferred, 2026-09-02 —
        not blocked, just skipped for now; see note below for the exact click-through when revisited)
  - [x] T-065 — Alerting on Vapi webhook auth-failure spikes
  - [x] T-066 — Reusable Tooltip primitive + a targeted hover-guidance pass
  - [x] T-067 — Cut the auth-gate latency before any page can render (26/26 pages are client-rendered,
        gated behind two sequential auth round-trips on every load)
  - [x] T-068 — Code-split heavy per-route bundles (Calendar's dnd-kit ships 276kB vs. a 102kB baseline)
  - [x] T-069 — Serve static images through `next/image`; verify the base64 photo path is right-sized
  - [x] T-070 — Lazy-load the Firebase Auth/Firestore SDK off every page's critical path (owner continuation,
        "still laggy" — 2026-09-06). `src/lib/firebase/client.ts`'s static `initializeApp`/`getAuth`/
        `getFirestore` were pulled into every authenticated page's first-load JS via `AuthContext`/`CommandBar`/
        `company/layout.tsx` (used by literally every `/company/*` and `/admin/*` route) plus direct
        `firebase/firestore` imports in dashboard/calls/pipeline — Calendar was the one page already exempt
        (T-068 already had it dynamically importing Firestore, which is what led to finding this). Converted
        `client.ts` to `getFirebaseAuth()`/`getFirebaseDb()` memoized async accessors (app init itself still
        starts at module-evaluation time so the SDK chunk fetches in parallel with hydration, not after);
        updated all 12 call sites (`AuthContext`, `company/layout.tsx`, `admin/layout.tsx`, `login`,
        `CommandBar`, `useBusinessModules`, `useBusinessTimezone`, `CalendarBoard`, dashboard/calls/pipeline
        pages) to `await` them and dynamically `import("firebase/auth")`/`import("firebase/firestore")` at each
        call site. **Result:** every page that was 248-261kB First Load JS (dashboard, calls, jobs, jobs/[id],
        field, guide, library, pipeline, settings, login, admin/onboarding, admin businesses/[id]/config) is now
        109-122kB — roughly halved, converging on Calendar's existing ~104kB baseline. `tsc` clean, lint 0/21
        (unchanged), `vitest run` 374/374 (one test needed a microtask-flush fix in `afterEach` — the new async
        hops meant a dangling promise from one test could bleed a mock call into the next; not a product bug),
        `next build` green. Smoke-tested with a local prod server + Playwright: `/login` renders and its
        email/password submit correctly reaches the (locally unconfigured) Firebase code path with no crash;
        `/company/dashboard` redirects to `/login?next=...` as expected. **Pushed and live** (2026-09-06, owner
        approved) — `origin/main` now matches `main` (`6691480`); Vercel's auto-deploy reached Ready and
        production was re-verified healthy (`/api/health`, `/login`, webhook 401) post-deploy.
  - [x] T-071 — Cut Firestore round-trip time on the pages T-070 flagged as the next lag source (owner: "do the
        round-trip time thing to reduce page lag" — 2026-09-06). T-070 fixed bundle weight, not query latency; a
        direct client Firestore read pays its own connection setup + security-rule evaluation on whatever
        network the browser is on, once per collection, and Dashboard alone ran 6 of those in parallel on every
        visit. Added 4 new admin-SDK-backed endpoints — `GET /api/businesses/[businessId]/{leads,appointments,
        calls,agent-actions}` (session-role-gated via `verifyAuthAndRole`, same pattern as `/api/jobs`) — so
        those reads become one fast same-origin HTTP round trip each, resolved server-to-Firestore (datacenter
        to datacenter, no client-side rule evaluation) instead of browser-to-Firestore. `calls` supports
        `?countOnly=1` (aggregation query, no documents transferred) for Dashboard's "Total calls" tile.
        Extended the existing `/api/businesses/[businessId]/agent-config` response with 4 fields
        (`agentName`/`escalationPhone`/`active`/`vapiAssistantId`) instead of adding a 5th endpoint, so
        Dashboard's business-doc read reuses it. Rewired Dashboard, Calls, Pipeline (initial load only — its
        `markContacted`/`updateApptStatus` mutations are unchanged, out of scope for a *load-time* fix), and
        CommandBar to fetch these instead of querying Firestore client-side; CommandBar's `getFirebaseDb` import
        is now gone entirely (the command palette touches no client Firestore at all). **Bonus find:** CommandBar
        has called `/api/businesses/${businessId}/leads` since it was built, but that route never existed until
        this task — its lead search has silently 404'd (swallowed by a `.catch(() => null)`) this whole time;
        now fixed as a side effect. Verified: `tsc` clean; lint 0/21 (unchanged); `vitest run` 373/374 (the one
        failure is the pre-existing documented `example-lib.test.ts` concurrent-load flake, confirmed clean
        re-run in isolation — unrelated to this change); `next build` green, 4 new routes appear in the route
        table. Smoke-tested the new endpoints against a local prod server: all 5 correctly return 401
        Unauthenticated with no session cookie (couldn't verify the authenticated happy path locally — this
        sandbox has no real Firebase credentials — but every query is a verbatim move of the exact
        collection/orderBy/limit the client already ran successfully in production, just executed with the
        admin SDK instead of the client SDK). This is a latency fix, not a bundle-size one, so it won't move the
        route-size table — the win is round-trip time, which local tooling can't measure without production
        traffic; worth an owner glance at real page-load timing after it ships.
  - [x] T-072 — Calendar → Pipeline appointment deep-link fix + nav reorder + Calendar's last client Firestore
        read moved server-side (owner: "in calendar when i click an unconfirmed appointment, it takes me to
        pipeline, but that name of the person i clicked is in past an[d] canceled, so i cant confirm it" + "nav
        bar tabs should be in logical order... settings should be separate... reduce load time" — 2026-09-06).
        Root cause of the appointment bug: the Calendar "Bookings" strip already linked to
        `/company/pipeline?tab=appointments&appt=<id>` with the right id, but Pipeline never read the `appt`
        param — so there was no way to tell which card the click meant — *and* Pipeline bucketed appointments
        into Upcoming/Past purely by `startTime`, so a still-unconfirmed after-hours booking whose slot time had
        already passed lost its Confirm/Cancel buttons entirely once it fell into "Past & Cancelled" — genuinely
        unconfirmable from that page, not just confusing. Fixed both: Pipeline now scrolls to and highlights the
        exact `appt`-id card, and pending/unconfirmed appointments are pulled into their own always-actionable
        "Needs Confirmation" section regardless of whether the slot time has passed. Nav: reordered
        `company-nav.tsx` to Dashboard → Pipeline → Calls → Calendar → Jobs → Field → Library → Guide (same
        order for every vertical; per-industry `module` filtering still hides what doesn't apply), and split
        Settings + Feedback into their own group pinned to the bottom of the sidebar with a divider
        (`.company-nav-secondary`, `margin-top: auto`) instead of sitting in the workflow list. Perf: Calendar
        was the one page T-070/T-071 hadn't reached — it still ran a direct browser→Firestore query for the
        visible week's appointments on every week change. Extended
        `GET /api/businesses/[businessId]/appointments` with an optional `from`/`to` range (same field for the
        range and the `orderBy`, so no new composite index) and pointed `CalendarBoard` at it instead — same
        round-trip-time fix as T-071, closing out that page. Verified: `tsc` clean; lint 0/21 (unchanged);
        `vitest run` 374/374 (two full-suite-only timeout flakes seen along the way, both confirmed pre-existing
        parallel-load contention — pass cleanly in isolation, unrelated files each time); `next build` green.
  - [x] T-073 — Self-service team management: a business owner can add teammates by email and assign a role
        with no superadmin involved (owner: "we want a way to if we get a client company, they can add emails,
        assign roles, etc for their company... smooth, easy, minimal click... we may already have it" —
        2026-09-06). Audited first: no such feature existed. The only prior path was superadmin-only
        (`/api/admin/businesses/[businessId]/provision-login`), hardcoded to `role: "owner"`, one login per
        business, temp password returned as plaintext for the superadmin to relay by hand — not client
        self-service and not multi-user. Built `GET/POST /api/company/team` + `PATCH
        /api/company/team/[uid]`, gated to `["owner", "superadmin"]` via the existing `verifyAuthAndRole`.
        Invite flow creates (or reuses) the Firebase Auth user, writes an `active: true` `businessUsers` doc,
        and emails a branded password-reset link (`generatePasswordResetLink` + a new `sendTeamInviteEmail` in
        `notify.ts`, same shape as T-043's welcome email but branded to the *business*, not Luxor) — no temp
        password to relay by hand, no second step. Guards: refuses to invite an email that carries the
        `superadmin` custom claim; refuses an email already active on a *different* business (one Firestore
        identity = one tenant); always keeps at least one active owner on a business (`PATCH` blocks a role
        change or deactivation that would leave zero active owners) so nobody can lock every future login out.
        UI is a new `TeamPanel` folded into `/company/settings` (not a new nav tab — Settings is where an owner
        already looks for account administration), visible only when `role === "owner"` or superadmin. New
        `src/types/team.ts` for the shared `TeamRole`/`TeamMember` shapes. 14 new route tests (fake-Firestore
        harness matching the existing cron-routes.test.ts pattern) covering the invite/guard/last-owner-lockout
        paths. Updated `public/guides/onboarding-guide.html` (Phase 4 + go-live checklist + the "handing over the
        login" script) to tell whoever's onboarding a client that the client can self-serve their own team from
        here on — plus fixed unrelated stale voice-stack steps in the same file while in there (Cartesia/
        ElevenLabs/Deepgram nova-3 → the actual live `gpt-realtime-2025-08-28` + `cedar` config from T-060,
        which the guide had never been updated for). Verified: `tsc` clean; lint 0/21; `vitest run` 388/389 (one
        more pre-existing parallel-load flake, clean in isolation); `next build` green with both new routes in
        the table.
  - [x] T-074 — Fixed a real bug found while building T-073: `POST /api/admin/businesses` (the onboarding
        wizard's business-creation endpoint — the primary way a new client gets provisioned) wrote the owner's
        `businessUsers` doc without `active: true`. Every `verifyAuthAndRole` check requires
        `.where("active", "==", true)`, so a business onboarded through the wizard would let its owner log in
        (Firebase Auth succeeds, `__session` cookie sets) but then get 403 Forbidden from *every* session-gated
        API — which, after T-071/T-072, is now most of the company portal (jobs, appointments, leads, calendar,
        settings, team). The only way it ever worked was a superadmin separately clicking "Provision Login" on
        the business's config page afterward, which has always set `active: true` correctly (a second, different
        code path). Added the missing field; added a regression test asserting it in
        `route.test.ts` (`businessUsers/{uid}.active === true` after business creation) so this can't silently
        regress again. This was very likely why "we may already have it" needed checking in T-073 — a freshly
        onboarded client's login may not have actually worked end-to-end before now.
- [ ] Phase 9 — UI/UX Modernization Pass (owner-added, 2026-09-06) — open-ended, self-selected per slice
  - [x] T-075 — First slice: reusable `Toggle` switch + two real applications, job-detail page brought onto
        the standard loading skeleton, one dead-end navigation fix (owner: "proceed with next items, reducing
        loading times when possible and improving navigation and clarity / modern design on every page...
        ensuring workflows are smooth and well ordered end to end, making use of buttons, drop downs, toggles,
        where applicable" — 2026-09-06). Audited first rather than guessing: grepped every `page.tsx` (24) for
        loading-state patterns, checkbox/select usage, and dead-end states. Findings: `PageSkeleton` was already
        adopted on 12/24 pages (T-067-era work); the two full-page checklists (onboarding wizard, business-config
        readiness) and one form modifier (config page's "reapply template defaults") are correctly native
        checkboxes (a checklist/consent-list is the right control there, not a toggle candidate) — left alone;
        the `#2563eb` hits CLAUDE.md's design-system rule warns about turned out to be crew color-swatch data
        values (`demoSeed.ts`/`crews/route.ts`/`library/page.tsx`), not button styling — verified before
        "fixing" a non-issue.
        Two real gaps found and fixed: (1) `company/jobs/[jobId]/page.tsx` — the single busiest detail page in
        the app — was the one major page still on a bare `<div>Loading job…</div>` instead of the `PageSkeleton`
        every sibling page already uses, and its "Job not found" state was a genuine dead end (no link back to
        the Jobs list at all); (2) two persisted binary settings (Settings → per-day business-hours "Closed",
        Job detail → per-photo "In report") were native checkboxes where a switch reads as more intentional and
        matches "toggles where applicable." Built `src/components/ui/Toggle.tsx` — a `role="switch"` button
        (not a restyled checkbox input, for full keyboard/AT semantics), `aria-checked`/`aria-label`, respects
        `prefers-reduced-motion`, and explicitly re-declares `border-radius` on its own `:focus-visible` state
        (the global `button:focus-visible { border-radius: inherit }` rule would otherwise square off a pill
        shape) — applied to both spots; `company/jobs/[jobId]/page.tsx`'s loading branch now returns
        `<PageSkeleton rows={6} />` matching the convention every other detail-shaped page uses; its not-found
        branch gained a "Back to Jobs" link reusing the page's existing `previewSuffix` (so an admin-preview
        session doesn't lose its preview context on the bounce-back).
        **Scope note, stated plainly:** this is a first slice, not full "every page" coverage — the ask is
        broad enough that hand-editing all 24 pages' visual design in one pass would be both slower to verify
        and riskier than proportionate, incremental slices. Candidate next slices (unscoped, no task numbers
        assigned yet, pick order open): a consistent page-header/breadcrumb pattern for nested detail pages
        beyond Jobs (e.g. `admin/businesses/[businessId]/config`, already has a back-link — audit the rest);
        a review of button vs. dropdown vs. toggle choice on the Pipeline/Calls status filters (currently
        button rows — fine at the current option count, worth a second look if more statuses are added); a
        loading-skeleton pass on the 12 pages not yet on `PageSkeleton` (several are redirects/static content
        that never show a loading state at all and don't need one — the remainder is a short, concrete list a
        future slice can audit directly rather than re-deriving from scratch). Verified: `tsc` clean; lint
        0 errors/21 warnings (unchanged pre-existing baseline); `vitest run` 386/389 (3 pre-existing
        concurrent-load timeout flakes — `registry.test.ts`, `send.test.ts`, `example-lib.test.ts` — reconfirmed
        clean on an isolated rerun of just those three files, same long-documented pattern as every prior
        session); release suite 16/16; `next build` green with no First Load JS regression on either touched
        route (`/company/jobs/[jobId]` 121kB, `/company/settings` 111kB — both unchanged from their T-070
        baselines). **Pushed and live** as part of the T-076 push below (2026-09-06) — see that entry.
  - [x] T-076 — Global quick-add ("+") plus an "add X first" blocked-workflow pattern (owner: "in modern apps,
        its nice to be able to click + ... which opens up the same form to fill but available from different
        pages ... like in airbnb, i can do a lot from almost any page, and it will link me to the right place
        ... tool tips if the workflow is blocked ... a popup card that says 'add X first in order to process Y',
        with a button that opens the form to add X" then "use your best judgement ... like modern airbnb ...
        update todos and docs" — 2026-09-06, continuing straight off T-075). Audited first: no global create
        affordance existed anywhere — `CommandBar.tsx`'s `Cmd+K` is search-only, and each "add" (Job, Crew/
        resource, Teammate) was a full inline form hand-rolled on its own page with no shared component. Found
        the exact "blocked workflow" case described, already shipped and already a dead end: Calendar's
        empty-crew state read "No crews yet. Add crews in the Library ->" — a plain link that bounces the user
        off Calendar to go find the Library page and guess their way to the Crews tab, with no way back to
        where they were.
        Built a reusable `Modal` primitive (`src/components/ui/Modal.tsx` - backdrop, Escape/click-outside to
        close, `role="dialog"`; every prior ad hoc `position:fixed;inset:0` popup in this app, e.g. Field QR,
        predates this and can migrate to it opportunistically, not as a forced rewrite this task); a
        `QuickAddProvider`/`useQuickAdd()` context (`src/contexts/QuickAddContext.tsx`) mounted once in
        `company/layout.tsx`, exposing `openMenu()` (the picker) and `open(kind)` (jump straight to one form -
        what a blocked-workflow card calls); a `QuickAddButton` (`src/components/ui/QuickAddButton.tsx`) in the
        sidebar footer (desktop), the mobile topbar (icon variant), and the mobile nav sheet - reachable from
        every company page, not just its own; and `BlockedAction` (`src/components/ui/BlockedAction.tsx`), the
        generic "add X first" card. The three quick-add forms (Job/Crew/Teammate) are new, deliberately small
        components that POST to the exact same endpoints their home pages already use (`/api/jobs`,
        `/api/company/crews`, `/api/company/team`) - no business logic duplicated, no validation drift risk.
        Menu items are gated exactly like their home pages already are: "+ New Job" only when
        `isEnabled("jobs")` (a dental tenant never sees it), "Invite teammate" only for `role === "owner"` or
        superadmin (matches `TeamPanel`'s existing gate); Crew/resource is always offered - every industry's
        Calendar needs one. A small event bus (`src/lib/events/quickAdd.ts`, `useQuickAddRefresh`) lets Jobs/
        Library/Team/Calendar refetch their own list when something of their kind is created from anywhere
        (including the global "+" on a different page), without lifting state through the whole company shell.
        Flagship conversion: Calendar's empty-crew dead-end link is now a `BlockedAction` card whose button
        calls `openQuickAdd("crew")` directly - the Crew form opens in place, submitting it refetches Calendar's
        crew rows via the event bus, and the board is immediately schedulable with zero navigation.
        Scope note, stated plainly (an own-best-judgement pick per the owner's explicit "use your best
        judgement"): v1 covers Job + Crew/resource + Teammate, all mechanical extraction of existing
        create-flows onto a new reachable-from-anywhere surface. Manual Appointment creation was deliberately
        left out - there is no staff-facing "add appointment" flow at all today (appointments are voice-booked
        by Alice only), so including it would mean designing a net-new booking flow (slot/conflict handling,
        provider assignment), not just surfacing an existing form; flagged as a candidate follow-up needing its
        own product decision, not attempted here. Only one `BlockedAction` conversion was done (Calendar's
        crew-empty state, the concrete case the owner's ask was modeled on) - a further audit for other blocked-
        workflow dead ends is a candidate next slice, not assumed exhaustive here. Verified: `tsc` clean; lint
        0 errors/21 warnings (unchanged baseline); new tests - `Modal.test.tsx` (7), `BlockedAction.test.tsx`
        (2), `quickAdd.test.tsx` (5, the event bus + `useQuickAddRefresh`), `QuickAddContext.test.tsx` (6,
        module/role gating, the Crew create-and-succeed round trip against a mocked `fetch`, back-to-menu,
        Escape-to-close) - `vitest run` 409/409 with these included (2 pre-existing concurrent-load flakes,
        `example-lib.test.ts` and `send.test.ts`, reconfirmed clean on an isolated rerun of just those two
        files, the same long-documented pattern as every prior session); release suite 16/16; `next build`
        green, no First Load JS regression on any touched route (Calendar still 104kB, Jobs 118kB, Library
        119kB, Settings 111kB). **Pushed and live** (2026-09-06, owner approved) — `origin/main` now at
        `d381907`, which also carried T-071 through T-075 (previously local-only); Vercel's auto-deploy reached
        Ready and production was re-verified healthy post-deploy (`/api/health`, `/login`, webhook 401).
  - [x] T-077 — Invoice <-> Materials <-> Library "handshake" audit + educational tooltips for blocked/degraded
        states (owner: "make sure the information handshake between invoice and materials and library is all
        set up as needed for ultra smooth use, with tooltips explaining to user why something might be blocked
        ... in educational matter of fact tone, and what they need to do to unblock" — 2026-09-06, continuing
        straight off T-076). Audited the actual data flow rather than guessing: `generateInvoice()` in
        `company/jobs/[jobId]/page.tsx` is 100% client-side (the server route at
        `api/jobs/[jobId]/invoice/route.ts` has zero callers anywhere in the app - flagged as dead code, not
        removed without owner sign-off, see note below) and builds material/labor rows from field-update data
        plus the Library catalog. Found two real, silent gaps and one pre-existing security gap while tracing
        it:
        (1) **Materials — silent, not blocking.** `lookupUnitPrice()` fuzzy-matches a field-logged material
        name against the Library catalog and correctly leaves the price blank on no match (never fabricates a
        number) - but a blank price rendered identically to a real $0.00 entry, with the placeholder "0.00"
        indistinguishable from an actual zero. An owner could send an invoice silently undercounting a material
        with no way to notice. Fixed: unpriced rows now show a small warning icon next to the price field;
        hovering explains why in the requested tone ("No price on file for 'X' - it isn't in your Library
        pricing catalog, and this field note didn't include a cost...") and clicking it jumps straight to a new
        "+ Add material" quick-add form (extending T-076's `QuickAddContext` with a fourth kind, prefilled with
        the item name) that reads the current catalog, appends the new price, and PUTs it back - the catalog is
        a whole-array PUT unlike Job/Crew/Teammate's single-row POST, so the form fetches-then-appends rather
        than blindly overwriting the rest of the materials list. A header tooltip explains the general
        auto-fill mechanism for anyone who hasn't hit a blank row yet.
        (2) **Labor rates — a dead feature, not a UX gap.** Library's "Labor rates & tax" panel lets an owner
        save $/hr by role (Foreman, Laborer, ...) with real UI and its own save path, but grepping every
        consumer of `library.laborRates` found none outside the Library page itself - `generateInvoice()`'s
        labor-row rate was always either an explicit field-note cost or one flat `businessConfig` default,
        never the saved-by-role rate. An owner could carefully configure role rates that silently did nothing
        on every invoice. Fixed with the same non-fabricating discipline as materials: added
        `lookupLaborRate()` to `types/library.ts` (mirrors `lookupUnitPrice`'s exact/substring match) and wired
        it into the rate fallback chain (explicit cost > matched role rate > business default); a technician's
        actual name ("Mike") correctly returns no match rather than guessing, verified by test. Also added a
        per-row "pick a saved role" dropdown next to the rate field (only rendered when the catalog has roles,
        so it's not clutter for a tenant that hasn't set any up) and a header tooltip explaining where rates
        come from and, when no roles are saved yet, exactly which default is being used and where to add roles.
        (3) **Library-fetch failure was fully silent — the input side of the whole handshake.** Both the job
        page's `library` state and the invoice auto-fill logic (`library?.materials ?? []`) treat "the fetch
        threw" identically to "the fetch succeeded with an empty catalog" - a transient network error would
        silently zero out every price with no distinguishing signal. Added a `libraryLoadFailed` flag (fetch
        failure vs. successfully-empty are now tracked separately) and a dismissable-by-retry banner on the
        Invoice tab: "Your pricing catalog couldn't be loaded, so material prices weren't auto-filled - check
        them below before sending," with a Retry button.
        (4) **Bonus find while tracing every reader of the Library/Crews collections:** `GET
        /api/company/crews` and `GET /api/company/library` had no `verifyAuthAndRole` gate at all - only their
        POST/PATCH/DELETE/PUT siblings were guarded. Anyone who knew or guessed a `businessId` could
        unauthenticated-GET a tenant's crew roster (names/emails/phones) or full pricing catalog. Every caller
        of both endpoints already runs from an authenticated `/company/*` page (confirmed via grep before
        changing anything, so no legitimate caller breaks), so both now require session auth
        (`["owner","staff","viewer","superadmin"]`, matching the read-level role set used elsewhere). This
        wasn't part of the "tooltip" ask but was found directly while auditing the exact system the owner asked
        about, in the same spirit as this session's T-071/T-074 "found and fixed a real bug along the way"
        precedent.
        **Not done, flagged for an owner decision:** the dead server-side `POST /api/jobs/[jobId]/invoice`
        route - left in place rather than deleted, since removing a route is a more consequential call than
        adding a tooltip and nothing in this task's scope required touching it.
        Verified: `tsc` clean; lint 0 errors/21 warnings (unchanged baseline, two new `react/no-unescaped-entities`
        catches fixed); new tests - `types/library.test.ts` (8, `lookupUnitPrice`/`lookupLaborRate` matching and
        no-fabrication behavior), 2 new auth-gate regression tests (`api/company/crews/__tests__` and
        `api/company/library/__tests__`, both proving a 401 with no session and that Firestore is never reached
        first), 4 new `QuickAddContext.test.tsx` cases (material kind gated independently of jobs by the
        `pricing` module, create-reads-then-appends-then-PUTs round trip, and prefill-when-opened-directly for
        the BlockedAction-style entry point) - `vitest run` 424/424 with these included (3 pre-existing
        concurrent-load flakes - `example-lib.test.ts`, `send.test.ts`, `registry.test.ts` - reconfirmed clean
        on an isolated rerun of just those three files); release suite 16/16; `next build` green
        (`/company/jobs/[jobId]` 121kB -> 135kB, the one route with real new logic; every other route
        unchanged). **Pushed and live** (2026-09-06, owner approved) — `origin/main` now at `9eda6ad`; Vercel's
        auto-deploy reached Ready and production was re-verified healthy post-deploy, including both newly
        auth-gated endpoints confirmed 401 unauthenticated against production.
  - [x] T-078 — New vertical: Junk & Trash Removal + a Calendar readability/"what's draggable" pass (owner:
        "one of the client types should be junk / trash removal... The calendar is tricky to tailor, so like for
        roofers, crews make sense, but for dog walkers, different, and for dentists, etc. really put thought
        into what is draggable in the calendar, also make sure its clear and that work assigned has associated
        times visible, and that the calendar is large enough to show easily readable, modern view" —
        2026-09-06/07, continuing straight off T-077). Two parts.
        **Part 1 — Junk & Trash Removal, the 11th vertical.** Full `VerticalTemplate` block in
        `src/lib/verticals/templates.ts`: jobs-mode, `family: "field"` (a truck-crew field-service trade, same
        bucket as roofing/HVAC/GC), vocab (`jobNoun: "Pickup"`, `resourceNoun: "Crew"`), realistic FAQs (what
        they don't take — hazardous materials, asbestos — pricing-by-volume, same/next-day availability),
        emergency rules tuned to the trade (hazmat gets flagged for manual review rather than booked, hoarding
        situations get compassionate escalation, eviction/move-out deadlines get same-day priority), agent
        "Dusty", icon `Trash2`, color `#c2410c` (distinct from all 10 existing palette values, verified by
        reading the actual list rather than guessing). Added `"junk-removal"` to the `VerticalId` union, which —
        exactly as CLAUDE.md's design promises — made `tsc` fail on every `Record<VerticalId, …>` consumer until
        handled: `VERTICAL_ICONS` in `admin/demo/page.tsx` (added `Trash2`) and `RESOURCES` in
        `verticals/demoSeed.ts` (added 5 truck-crew demo names). One test needed a manual fix `tsc` couldn't
        catch — `family-palette.test.ts` hardcoded `expect(byFamily.field).toHaveLength(7)`, now 8. Updated
        `public/guides/onboarding-guide.html` throughout (card count "ten" → "eleven" in 4 places, the Demo
        Studio industry list, the field-service summary table, the "swap table" walkthrough rows, and the
        colored vertical-card grid) — the same reconciliation pass CLAUDE.md's 2026-08-25 3-vertical-expansion
        entry describes doing, just for one vertical instead of three. Confirmed via grep that no other file
        hardcodes a per-industry list outside these already-updated spots.
        **Part 2 — Calendar: draggable-content audit + a real "times visible" gap fix + sizing/legibility pass.**
        Audited what's actually draggable today before assuming a redesign was needed: `calendarMode` (jobs vs.
        appointments) plus `vocab.resourceNoun` already differentiate "roofers drag jobs onto Crews" from
        "dentists drag bookings onto Providers" from "childcare drags bookings onto Sitters" — the dog-walker/
        dentist distinction the owner described is the same jobs-vs-appointments split the platform already
        has, so the fix here was making the cards themselves clearer and fixing what they were missing, not
        building a third calendar mode.
        Found a real, concrete gap in "times visible": a scheduled job's tile (`ScheduledTile`, the jobs-mode
        crew×day card) showed only the job ID and title — no time at all — even though `job.scheduledStart`/
        `scheduledEnd` are real fields already set the moment a job is dropped onto a crew+day (business-open
        time by default). The appointments-mode equivalent (`ScheduledApptTile`) already showed its time; jobs
        mode was the one silently missing it. Fixed: `ScheduledTile` now shows a start–end time range, sourced
        from the same `job.scheduledStart`/`scheduledEnd` that already existed — no new data, just surfaced
        what was already there. Also added the appointment's `serviceType` as a second line on
        `ScheduledApptTile` (previously showed only time + caller name) so a placed booking reads as clearly as
        a placed job.
        Sizing/legibility: bumped the crew×day grid's column widths (140px→168px resource column,
        150px→190px min day columns, 700px→900px grid floor), day-cell minimum height (64px→116px — the old
        height was tight enough that a two-line title plus a confirm button could feel cramped), the unscheduled/
        unassigned rail's width (220px→260px) and scroll height (560px→680px), and tile/label font sizes
        throughout (11-12px→12-13px body text, larger day-of-month numerals rendered as a filled accent circle
        on "today" — the same visual convention Google/Apple Calendar use). Every number is a deliberate,
        reviewed increase, not a blanket scale — chosen to comfortably fit the now-larger tile content (time +
        title + id/footer + action row) without wasting space.
        Verified: `tsc` clean (the `Record<VerticalId,…>` exhaustiveness check did real work here — it's the
        reason both required consumer files were caught immediately rather than discovered later); lint 0
        errors/21 warnings (unchanged baseline); `vitest run` 424/424 (3 pre-existing concurrent-load flakes —
        `send.test.ts`, `example-lib.test.ts`, `registry.test.ts` — reconfirmed clean on an isolated rerun);
        release suite 16/16; `next build` green (`/company/calendar`'s own route entry is unchanged at 104kB
        since `CalendarBoard` is code-split per T-068 — the size growth is invisible to the route table by
        design). Could not do a live authenticated visual check in this sandbox (no real Firebase credentials,
        the same standing limitation documented throughout this session) — verified by careful review of the
        grid-column/cell-height arithmetic instead of a screenshot; worth an owner glance at the live Calendar
        after this ships to confirm it reads as intended.

- [ ] Phase 13 — CRM rebrand / domain migration to `luxordev.com` (owner-added, 2026-09-16) — 3/3 code-side done
  - [x] T-096 — Fixed Google sign-in returning `auth/internal-error` on the live `crm.luxordev.com` domain
        (owner hit this directly while testing right after DNS/Vercel/Firebase setup). Root cause: `next.config.ts`'s
        CSP (added by T-061, Phase 8) declared `connect-src` but never `frame-src`, so it silently fell back to
        `default-src 'self'` — which blocks the hidden iframe Firebase Auth's redirect sign-in embeds from the
        project's authDomain (`business-expense-trackin-ef659.firebaseapp.com`) to relay `getRedirectResult()`
        back to the app. Surfaces as an opaque `auth/internal-error` with no actionable detail. This is exactly
        why the earlier popup→redirect fix (`7aa1f855`, Phase 12) didn't actually resolve it for good — that fix
        was verified only via a server-side Identity Toolkit API call, never a real browser click-through, so the
        CSP interaction was never caught; email/password sign-in was unaffected the whole time since it never
        loads that iframe. Fixed: added `frame-src 'self' https://business-expense-trackin-ef659.firebaseapp.com`
        to the CSP; added a regression test (`security-headers.test.ts`, matching the existing connect-src
        regression test's pattern for the identical class of incident). Verified: `tsc` clean, targeted test
        8/8, full `vitest run` 638 passed + 3 pre-existing concurrent-load flakes (`example-lib.test.ts`,
        `send.test.ts`, `company/team/route.test.ts` — all 3 reconfirmed clean on an isolated rerun, the same
        long-documented pattern as every prior session, unrelated to this change), lint clean on touched files.
  - [x] T-097 — Jobs list search: a live-filtering, forgiving search box (owner: "add a search where they can
        search jobs... type 1004 and J-1004 will show, not difficult"). New `src/lib/jobs/search.ts` —
        `matchesJobSearch()`, punctuation/case-insensitive substring match across job id/title/client
        name/address/service type, plus a separate digits-only phone match (3+ digit queries) — mirrors
        `src/lib/customers/search.ts`'s `matchesQuery()` approach, same "forgiving, in-memory, zero network
        round trip" shape. Wired into `company/jobs/page.tsx` alongside the existing status-tab filter, with a
        "No jobs match…" empty state. 8 new unit tests including the exact "1004" → "J-1004" case from the ask.
        Verified: `tsc` clean, lint clean, tests 8/8.
  - **Live-verified on production during this session** (via the public `/try/roofing` sandbox, viewer role, no
        credentials): uploaded a real photo through `/company/field?jobId=J-1001`'s "+ Photo" control — it
        appeared immediately in the job detail page's Photos tab (thumbnail, description, phase badge, "In
        report" toggle), confirming the field→job photo pipeline works end-to-end in production, not just in
        code — then deleted the test photo to leave demo data clean. Also confirmed live: J-1001's 6 real field
        updates (materials/timeline/labor/issues, including a voice correction) all render correctly from
        `job.parsed`, and the Library → **Branding** tab (where logos are uploaded) renders its empty state and
        upload form correctly. Logo upload itself needs `owner`/`staff`/`superadmin` (the sandbox's `viewer` role
        correctly can't), so the "first upload auto-becomes default" behavior was confirmed by code + its
        existing unit tests (`logo.test.ts`) rather than a live click, not assumed.
  - [x] T-095 — Parameterized the hardcoded `https://ai-roof.vercel.app` base URL into one `NEXT_PUBLIC_APP_URL`
        env var (2026-09-23). New `src/lib/config/appUrl.ts` — `getAppUrl()` reads
        `process.env.NEXT_PUBLIC_APP_URL` as a static property access (required so Next.js inlines it into
        client bundles, not just server ones) and falls back to the current production domain when unset, so
        behavior is unchanged until the env var is actually set in Vercel. Re-audited the file list in this
        entry against a fresh repo-wide grep rather than trusting it verbatim — `vapiClient.ts` turned out to
        have no hardcoded app URL (`VAPI_BASE_URL` there is Vapi's own `api.vapi.ai`, unrelated); found two
        real occurrences the original list missed instead: `hub/demo/page.tsx` (4 call sites — QR code
        target, "Copy link" button, and the field-screen fallback URL, all functional, not cosmetic) and
        `admin/businesses/[businessId]/config/page.tsx` (one display-text label). Fixed all 6 real files:
        `agentTools.ts`, `team/invite.ts` (dropped its own stale comment explaining why it *couldn't* share a
        helper — it now does), `appointments/send-confirmation/route.ts`, `admin/demo-customize/route.ts`,
        `hub/demo/page.tsx`, and the admin config-page label. Documented the new var in `.env.example`. Left
        the `https://ai-roof.vercel.app` string in two places on purpose: the fallback constant itself in
        `appUrl.ts`, and a human-facing comment in `webhooks/vapi/route.ts` documenting the Vapi dashboard's
        current Server URL setting (not code, and the actual repoint-or-not decision is owner-only per NH
        below). Verified: `tsc` clean; lint clean on every touched file (the run's 3 errors are pre-existing
        `.kilo/worktrees/**` noise — gitignored, untracked, unrelated to this change); targeted `vitest run`
        32/32 (`demo-customize`, `team`, `tools`, `appointments` suites, including the existing test that
        asserts the exact fallback URL literal — passed unchanged since the env var is unset in CI); `next
        build` green, no First Load JS regression on any touched route. **Not done, owner-only (moved to
        NEEDS-HUMAN as NH-17):** actually setting `NEXT_PUBLIC_APP_URL` per environment in Vercel once
        `crm.luxordev.com` is ready — GoDaddy CNAME record, Vercel custom-domain add, Firebase Auth
        authorized-domain entry, and deciding whether to repoint the Vapi webhook Server URL are all
        console/account-access actions, not integrator-doable. Product name for the new domain: **RAM**
        (owner-picked, 2026-09-16).

- [x] Phase 14 — New Verticals: Care Homes & Daycares (owner-added, 2026-09-23) — 2/2, merged to `main` locally, not pushed
  - [x] T-098 — New vertical: **Care Homes** (assisted living / residential/senior care facilities). Follow the
        same `VerticalTemplate` pattern as every prior vertical (`src/lib/verticals/templates.ts` — one config
        block, `disabledModules`/`calendarMode`/`vocab`-driven, no hardcoded per-industry logic elsewhere; adding
        the new `VerticalId` union member will make `tsc` fail on every consumer until each is handled, same
        guardrail that caught T-078's two required consumer updates).
        **What the industry's current software actually tracks** (research this before building — matters for
        getting the vocab/FAQs/scope right): tools like PointClickCare, MatrixCare, Yardi Senior Living, Caremerge,
        and ALIS split cleanly into (a) clinical/EMR — medication administration records, care plans, incident
        charting — and (b) front-office/admissions — census/bed availability, level-of-care tiers (independent /
        assisted / memory care), tour scheduling, family communication, billing. **This platform's phone-AI scope
        is (b) only** — it is not, and must not become, a clinical record system; no medication, diagnosis, or
        resident health-status details should ever be spoken by the agent (HIPAA exposure), matching the same
        discipline dental's `disallowedTopics` already enforces for PHI.
        Shape to build, following dental's/property-management's already-shipped `family: "care"`/`"ops"`,
        `calendarMode: "appointments"` pattern (no field jobs/crews — a coordinator's calendar, not a crew's):
        prospective-family calls (bed/room availability by care level, pricing — private pay vs. Medicaid/LTC
        insurance, tour booking), existing-family calls (route to the nursing station/administrator rather than
        disclosing resident status over the phone), staff call-outs, vendor calls. `emergencyRules` tuned to the
        trade: a fall/injury/unresponsive-resident report escalates immediately (never "handled" by the agent);
        a missing-resident/elopement report is treated as urgent same-priority escalation; a care-quality complaint
        escalates to the administrator rather than being resolved on the call. Needs its own agent
        name/tone/icon/color (verify the chosen color against the existing 11-vertical palette in
        `templates.ts` before picking one, per the T-078 precedent), demo seed data (`demoSeed.ts` — something
        draggable/bookable for the Calendar, per CLAUDE.md's demo-data rule), and an onboarding-guide industry-count
        update (currently "eleven" in `public/guides/onboarding-guide.html` — becomes thirteen once both T-098/
        T-099 ship). **UI bar** (per owner's explicit ask): reuse this vertical's Calendar/Library/Dashboard as-is
        — no new UI patterns — matching the Toggle/Modal/QuickAdd/PageSkeleton conventions Phase 9 already
        established, so it reads "simple, intuitive, fast, modern" by inheriting the same polish every other
        vertical already has, not by inventing something bespoke.
        **Shipped 2026-09-23** (Codex, `task/care-homes` `1ec95c0`, merged `--no-ff`): template inserted after
        `dental`; agent "Elena", icon `HeartHandshake`, color `#7f3f55` (distinct + 4.5:1 white-text contrast,
        asserted in `family-palette.test.ts`). Resident health/medication/diagnosis/named-resident-confirmation
        are `disallowedTopics`; falls, elopement, and alleged neglect escalate to live staff. New
        `care-homes.test.ts` verifies those rules reach the `buildAgentPrompt` output. **Not verified:** actual
        live-call behavior — the tests prove the boundaries are *in the prompt*, not that the voice model obeys
        them on a real call (see NH-18). No `DEMO_LINE_PHONE` entry: no provisioned number for this vertical.
  - [x] T-099 — New vertical: **Daycares** (licensed early-childhood/daycare centers) — deliberately **distinct
        from the existing `childcare` vertical** (`templates.ts` line ~785, "Childcare & Sitters" — individual
        sitter/nanny bookings, `resourceNoun: "Sitter"`). A licensed daycare *center* is a different business
        shape entirely: capacity/ratio-constrained classrooms, state-licensing requirements, and a facility to
        tour — not a marketplace of individual sitters. Don't fold this into `childcare`; give it its own
        `VerticalId`.
        **What the industry's current software actually tracks:** Brightwheel, Procare Solutions, HiMama, and
        Kangarootime center on child check-in/check-out attendance, staff-to-child ratios per classroom (licensing-
        driven), parent daily reports (meals/naps/photos), tuition billing/autopay, waitlists, and immunization-
        record requirements at enrollment. As with T-098, **this platform's phone-AI scope stays front-office**:
        the agent books tours/enrollment visits and answers pricing/hours/curriculum/openings-by-age-group
        questions — it does not check a specific child in/out, disclose which children are present, or discuss a
        named child's day over the phone.
        Shape to build: `calendarMode: "appointments"` (tours/enrollment visits booked onto a director/enrollment
        coordinator — not "Sitters" like `childcare`), vocab and FAQs covering openings by age group, tuition,
        hours, curriculum, and required enrollment documents (immunization records). `emergencyRules` tuned to the
        trade: a child injury/allergic-reaction report escalates immediately to on-site staff (911 if severe); an
        unauthorized-pickup attempt escalates immediately and the agent never confirms or denies a specific child
        is present to an unverified caller (this is the daycare-equivalent of dental's PHI discipline — a real
        safety/legal boundary, not just tone); an unaccounted-for-child report is treated as urgent, immediate
        escalation. Same closeout bar as T-098: own agent name/tone/icon/color (checked against the existing
        palette, distinct from `childcare`'s), demo seed data, onboarding-guide count update, and no new UI
        patterns — reuse the existing Calendar/Library/Dashboard conventions as-is.
        **Shipped 2026-09-23** (Deepseek, `task/daycares` `80f1c4b`, merged `--no-ff`): template inserted after
        `childcare`; agent "Wren", icon `School`, color `#7c3aed`, `resourceNoun: "Director"` (separate from
        `childcare`'s "Sitter"). Pickup-release, child-presence confirmation, and named-child details are
        `disallowedTopics`; injury/allergy, unauthorized pickup, and unaccounted child escalate immediately. New
        `daycares.test.ts` (19 tests) includes an assertion that `daycares` and `childcare` stay separate
        templates. **Not verified:** live-call behavior, same caveat as T-098 (NH-18).
        **Integrator merge (2026-09-23):** both branches merged with `--no-ff`; conflicts only in the shared
        files predicted up front — `family-palette.test.ts` (care family now
        `["care-homes","childcare","daycares","dental"]`), `IMPLEMENTATION_LOG.md` (kept both entries), and
        `onboarding-guide.html` (combined card list; all four "eleven" mentions → "thirteen"). Verified on the
        merged tree: `tsc` clean; `vitest run` 663 tests, 3 concurrent-load timeouts on the first pass
        (`send`/`example-lib`/`company/team` — the long-documented flakes), the isolated rerun 89/89 and a second
        full run had zero failures; `next build` green, 77 routes (`/try/` now generates 13 verticals).

- [x] Phase 15 — Industry Peripherals (owner-added, 2026-09-23) — 2/2
      **Principle (owner, 2026-09-23):** the skeleton (Dashboard/Calls/Pipeline/Calendar/Library/Settings, the
      call→lead→appointment→job flow) stays identical for every industry. Only *peripherals* differ, and each
      one lives in ONE per-vertical record typed `Record<VerticalId, …>` so `tsc` fails until a new vertical
      declares it (same rule as `templates.ts`). Never a per-industry `if` in a shared page. Fail-open: an
      unknown/blank industry shows the generic experience, never a hole. T-100 and T-101 have zero file
      overlap by design — T-100 owns `templates.ts`, T-101 owns a new `starterKits.ts`.
  - [x] T-100 — Structured per-industry **intake fields** (Deepseek). Today extra booking data (DOB/insurance,
        unit no., system age, roof type, child age, tour date, …) is stuffed into free-text `notes`. Add an
        `intakeFields` block to `VerticalTemplate` (`key`, `label`, `type: text|select|yesno|date`, optional
        `options`, `appliesTo: lead|appointment|both`, `required?: false` default — the AI must never stall a
        call on a field). `buildAgentPrompt` asks for them naturally; the booking/lead tools persist them as
        `intake: Record<string,string>` on the lead/appointment (keep the `notes` fallback for legacy docs and
        keep the Vapi tool JSON-schema backward compatible — the dashboard schema is NEEDS-HUMAN NH-1, so
        prefer carrying intake inside the existing `notes`/a new optional param the model can omit); Pipeline
        lead/appointment detail shows them as labeled rows (labels from the template, so a dental office sees
        "Insurance", property management sees "Unit #"); the T-083 job-prefill carries them into job notes.
        **Hard rules:** care homes + daycares intake must NOT collect resident/child health or identifying
        detail beyond what T-098/T-099's front-office-only rules already allow (tour interest, child age
        range, start date — never diagnoses, allergies, or "is X there"). Unit tests for prompt output + tool
        persistence + the per-vertical `Record` completeness.
        **Done (2026-09-23, branch `task/intake-fields`) — status: review.** All 13 verticals declare 2–4
        `intakeFields` (tsc's `Record<VerticalId,…>` exhaustiveness enforced it); `buildAgentPrompt` emits a
        config-driven "## Intake Details" section (never required / never stall / skip when in a hurry or
        emergency) telling the agent to record answers as "Label: value" lines inside the existing `notes`
        param — zero Vapi tool-schema change, NH-1-safe; `bookAppointment`/`createLead` parse those lines into
        `lead.intake`/`appointment.intake` (explicit `input.intake` wins; free-text notes and legacy docs
        untouched); Pipeline renders intake as template-labeled rows; `jobPrefill` merges intake lines into job
        notes (and the appointment→job path now carries appt notes too — previously dropped). Care-homes/
        daycares intake is front-office-only (community type/room/move-in date; child age RANGE/program/start
        date), no free-text fields, no health/identifying terms — test-asserted in both the template and the
        prompt section. Gates: tsc clean, lint 0 errors/32 warnings (baseline), `vitest run` 717/717 (up from
        673), `next build` green.
  - [x] T-101 — Per-industry **starter kits + dashboard tiles** (Codex). **Status: review (Worker C, `task/starter-kits`).** New `src/lib/verticals/starterKits.ts`
        (`Record<VerticalId, …>`): (a) a starter **catalog** for verticals with the `pricing` module (HVAC filters/
        refrigerant/labor tiers, roofing shingles/underlayment, electricians breakers/wire, landscaping mulch/
        sod/hourly, cleaning flat-rate-by-size, GC/trades); (b) starter **document templates** for every vertical
        (service agreement/estimate for field trades; new-patient form + cancellation policy for dental; tour
        follow-up + enrollment checklist for daycares; visit-request policy for care homes; work-order policy for
        property management). Library gets a one-click "Load starter kit" (idempotent — never duplicates or
        overwrites tenant edits; respects `disabledModules`). Dashboard gets 2–3 vertical-specific KPI tiles
        drawn from data that already exists (e.g. field trades: open jobs/uninvoiced; appointment verticals:
        today's bookings/pending confirmations; daycares/care homes: tour requests this week) via a
        `Record<VerticalId, …>` tile config, not per-industry branches. Placeholder pricing is clearly labeled
        "edit to match your rates" — never presented as real market prices.

- [x] Phase 16 — Call Compliance & Voice (owner-added, 2026-09-23) — 2/2
  - [x] T-102 — **Per-tenant call-recording disclosure** (Deepseek). Found 2026-09-23: nothing in the agent
        greeting/prompt tells callers a call may be recorded/transcribed (Florida is all-party consent; NH-4).
        Add `recordingDisclosure?: { enabled: boolean; text?: string }` to BusinessConfig, **default ON with a
        clearly-drafted default sentence** (owner/counsel can edit or turn off), composed into BOTH the normal and
        after-hours greeting and mentioned in the prompt so the agent answers "yes, it may be recorded" honestly
        if asked. Settings gets a small "Call recording notice" section (owner-editable, live preview of the
        spoken greeting, and a note that wording should be reviewed by counsel). Pushes through the existing
        `updateAssistantPersona` greeting path (do not change its speaking-plan preservation). Existing tenants
        get the default without a migration (missing field = default on). Unit tests: greeting composition per
        mode/language (Spanish variant of the default text), toggle off, custom text, fail-open for unknown
        industry. Not legal advice — the default text is a draft.
        **Done (2026-09-24, branch `task/recording-notice`) — status: review.** New pure `src/lib/recordingDisclosure.ts` (defaults EN/ES, compose + validation), composed in the webhook assistant-request path, the settings and demo-customize persona pushes, a `## Call Recording` prompt section, and a Settings owner-only notice panel with live preview. Owner/superadmin-only save, 300-char/no-HTML validation, staff 403. Gates: tsc clean, lint 0 errors/32 warnings (baseline), vitest 760/760 (+36), next build green.
  - [x] T-103 — **Per-tenant / per-language voice override** (Codex). **Status: review (Worker C, `task/voice-override`).** `AGENT_VOICES` in `src/lib/vapi/voices.ts`
        is hardcoded (`en: Savannah`) and unwired; `updateAssistantPersona` never sends `voice`, so a voice picked in
        the Vapi dashboard survives persona pushes today — **keep that true by default**. Add optional
        `voice?: { en?: VoiceRef; es?: VoiceRef }` (`VoiceRef` = provider `vapi|11labs|cartesia|openai` + voiceId
        + optional model) to BusinessConfig; the superadmin-only business config page
        (`src/app/admin/businesses/[businessId]/config`) gets fields to set them; `updateAssistantPersona` sends
        `voice` ONLY when a voice is configured for the language being pushed (unset = leave the live voice exactly
        as is — never revert a dashboard-chosen voice to a hardcoded default). Validate provider/voiceId shape
        server-side; never echo secrets; keep startSpeakingPlan/stopSpeakingPlan preservation byte-for-byte. Delete
        the misleading hardcoded `en` entry (or make it a documented example, not a default). Unit tests with
        mocked fetch: unset → PATCH body has no `voice`; set → PATCH body has the exact voice; es↔en flips;
        speaking plans preserved. This gives NH-15 (Spanish voice) a place to land without a code change.

  - [x] Phase 16 follow-ups (integrator, 2026-09-24): merged T-102 + T-103 (resolved 4 conflicts); fixed a cross-branch bug
        (a notice-only settings save omits the transcriber language, so T-103's voice lookup defaulted to "en" and
        would have applied an English voice override to a Spanish tenant — now falls back to the tenant's
        `agentLanguage`, tested); added **`POST /api/admin/sync-personas`** (superadmin, dry-run by default) +
        an Admin -> Clients "Sync live phone assistants" panel, because greetings only reach a live line when pushed
        (`assistant-request` never fires for fixed-assistant numbers) — needed so T-102's default-ON notice
        actually reaches lines nobody re-saved. Skips shared-assistant tenants (demo line), greeting-less tenants
        and tenants whose config can't build a prompt. 784/784 tests.

- [ ] Phase 17 — Work Catalog & Bilingual Line (owner-added, 2026-09-24) — 2/3 (T-105 done; T-106 open)
      Shared data contract (written by the integrator, do not change without them): `src/types/workCatalog.ts`
      (`WorkCatalogItem`, `WorkCatalog`, `JobFinding`, `WorkCatalogLine`). Catalog lives at
      `businesses/{bid}/library/workCatalog`; job findings are point-in-time SNAPSHOTS on `Job.findings`.
  - [x] T-105a — **Work catalog — Library side** (Deepseek). Library gets a "Work catalog" tab (only when the
        `jobs` module is enabled): items grouped by `category`, each with problem / solution / severity / optional
        suggested priced lines; add / edit / delete; search; one-click "Load starter kit" (idempotent — never
        duplicates, never re-adds a deleted starter item, never overwrites tenant edits). Starter content in a
        NEW `src/lib/verticals/workCatalogStarter.ts`, `Record<VerticalId, …>` (tsc enforces every vertical
        declares one; verticals without the `jobs` module declare an empty catalog). Roofing gets a real one
        (leaks, flashing, shingles/tile, ventilation, gutters, storm damage, skylights/penetrations…) and the
        other field trades (HVAC, electricians, landscaping, cleaning, general contractors, appliance repair,
        junk removal) get 6–12 sensible items each. Suggested-line prices are EXAMPLES, flagged `starter`, and
        must never carry placeholder text in customer-visible strings (lesson from T-101). API (owner/staff):
        `GET /api/company/work-catalog?businessId=` -> `{ catalog }`, `PUT` (replace items, validated, cap
        `WORK_CATALOG_MAX_ITEMS`), `POST /api/company/work-catalog/starter`. Plain text only, no HTML; length caps.
        **Done (2026-09-24, branch `task/work-catalog-library`) — status: review.** New `src/lib/verticals/workCatalogStarter.ts`
        (`Record<VerticalId, WorkCatalogItem[]>`, tsc-enforced): 28 roofing items across leaks/flashing/shingles-tile/
        ventilation/gutters-drainage/storm/penetrations-skylights/decking/inspection, 6–8 items each for HVAC,
        electricians, landscaping, cleaning, general contractors, appliance repair, junk removal; jobs-disabled
        verticals declare `[]`. All wording is real copy (no placeholder text — test-asserted), prices flagged
        `starter: true`. Pure `mergeWorkStarter` (idempotent, starterKitImported-deleted-stays-deleted, edits
        preserved) runs inside a Firestore transaction; the kit is server-picked from the tenant's industry
        (409 unknown, 403 jobs-disabled). `GET`/`PUT /api/company/work-catalog` (owner/staff/superadmin,
        noStore-only) — PUT replaces items, validates array cap/required strings/60-160-1200 caps/plain-text
        (HTML rejected)/severity set/≤12 lines with quantity>0, unitPrice≥0, kind in set; stamps updatedAt,
        clears nothing else. Library gets a `WorkCatalogSection.tsx` tab (jobs-enabled only): collapsible
        category groups, search, add/edit in a `Sheet` (suggested-lines editor, severity chips, editing clears
        the Starter badge), delete, empty state with Load starter kit, example-pricing note, vocab-driven.
        Gates: tsc clean, lint 0 errors/32 warnings (baseline), vitest full run 813/816 with the 3 failures being
        the long-documented pre-existing concurrent-load timeouts (example-lib/send/team — reconfirmed clean in
        isolation, none touch these files), next build green with both routes present.
        Extended `src/test-utils/fakeFirestore.ts` additively with `{ merge: true }` support (the file's own
        extension note permits it) so the PUT's merge contract is observable in tests.
  - [x] T-105b — **Work catalog — job side: findings, report, invoice, quote** (Codex). **Status: review (Worker C, `task/work-catalog-jobs`).** On the job detail page the
        user opens **Findings**: catalog items grouped by category with checkboxes + search (reads
        `GET /api/company/work-catalog`) and a "+ Add a one-off finding". Ticking COPIES the item into
        `Job.findings` (snapshot) with per-finding "in report" / "in quote" toggles, editable wording per job.
        (1) **Report**: ticked findings render as an "Issues found & work performed/recommended" section (problem +
        solution) alongside the crew-logged issues, editable, and appear in the emailed report. (2) **Invoice**:
        "Add to invoice" turns the ticked findings' suggested lines into invoice lines (material lines use the
        Library price if the name matches; never overwrites the crew's own lines; idempotent). (3) **Send a quote**:
        NEW persisted quote (`businesses/{bid}/quotes/{quoteId}`, own counter like `jobInvoiceNumber.ts`,
        status draft/sent/accepted/declined/expired; snapshot of bill-to + lines + per-finding wording), editable
        draft, emailed to the customer via Resend with the same letterhead/logo pattern as the job invoice
        (`buildJobInvoiceEmailHtml` is the model), marks the job `quoted` on send. **No online acceptance or
        payment** — the quote and its email say so plainly (same honesty rule as T-085); acceptance is recorded
        manually by staff ("Mark accepted"). Job.findings is added to `src/types/jobs.ts`. Bill-to snapshot rule
        and hide-materials setting apply to quotes exactly as to invoices.
  - [ ] T-106 — **One phone line for English AND Spanish callers** (logged 2026-09-24, unassigned, has a
        NEEDS-HUMAN live test). **Cleanup pass 2026-09-28: this spec is written entirely for the VAPI stack (Deepgram Flux,
        `startSpeakingPlan`/`stopSpeakingPlan`, `updateAssistantPersona` refusing `"multi"`) and predates the ElevenLabs
        migration. Do not build it as written — ElevenLabs has its own `language_detection` system tool and per-language
        `tts.voice_id` override, a materially different mechanism. Re-scope against the live ElevenLabs stack before
        anyone starts this**, using the shape below only for the underlying requirement (bilingual on one line, proven
        on a separate test assistant first, never forced on an English-only tenant):
        Today the line runs ONE language at a time (Settings -> Phone AI Language sets
        greeting, prompt AND the transcriber together); `buildAgentPrompt`'s bilingual "if the caller
        speaks Spanish, switch" line exists but the Settings toggle only ever writes `agentLanguages: [one]`, so it
        never turns on, and the single-language transcriber would mishear a Spanish caller on an English line.
        Original (Vapi-era) build notes, for the requirement only — the mechanism must be redone for ElevenLabs:
        a "Bilingual (English + Español)" option that (a) writes `agentLanguages: ["en","es"]`; (b) speaks a
        short two-language greeting ("… para español, diga español"); (c) uses a multilingual transcriber mode,
        proven on a SEPARATE test assistant + number first
        (20 scripted calls incl. interruptions and code-switching, per `docs/VOICE-PLATFORM-EVALUATION.md`'s option-B
        method) and only then offered per-tenant, never forced on English-only tenants; (d) picks
        the voice per detected language if T-103's `voice.es` is set. Optional follow-up (separate): a Spanish customer-facing report/quote.

- [ ] Phase 18 — Document Suite, Job Intake & Voice Platform (owner vision, 2026-09-24) — 1/4 done (T-107), 1 cancelled (T-108),
      1 superseded (T-110), 1 open (T-109). **Cleanup pass 2026-09-28: header was stale (said 0/4) — T-107 was already done via Phase 23.**
      **Product intent (owner):** users take jobs frictionlessly from calls or email (a job is created for them, or
      they create one in a tap); set up their people; field updates are seamless; and from any job they generate
      a **quote, invoice and report** where they can select issues, images and workers, edit everything, and
      hide materials/labor — all three documents consistent, each carrying the tenant's logo, matching the
      simplicity of `Roof Doctor's Invoice.pdf` (repo root) but more modern.
  - [x] T-107 — **Document suite unification** — **DONE, see Phase 23's T-107a/T-107b row for the merged/deployed state** (kept here for the
        original spec only). **Split 2026-09-24:**
        **T-107a — DONE, merged 2026-09-25 (Codex built it; integrator finished + verified after the worker hit its usage limit; owner live-check of the emailed invoice/quote pending)** (worktree `air-wt-documents-core`, prompt in `docs/WORKER_QUEUE.md` B2) = shared
        `src/lib/documents/` layer + invoice + quote + hide toggles + letterhead/logo everywhere + `licenseNumber` +
        technicians; **T-107b â€” review** (Codex, after 107a merges) = the REPORT + photo pages + narrative draft + emailed-report
        logo fix. Contract: `src/types/documentOptions.ts`. Original spec:
        Audit (2026-09-24): `hideMaterials` works on the INVOICE only (in-app, print/PDF, email; email path
        unit-tested; a real send has not been click-verified — add to NH-8); the REPORT has no hide toggles and
        the emailed report (`report/send/route.ts`) still uses the legacy `biz.logoUrl` with a white-silhouette
        invert filter, bypassing the logo library; no labor-hide anywhere; no quote until T-105b. Build ONE shared
        document layer used by invoice, quote and report (in-app, print/PDF, email): (1) shared options persisted per
        document — `hideMaterials` (collapses to one lump "Materials" subtotal, as the reference invoice does),
        NEW `hideLabor` (hides worker names/hours/rates, shows one lump "Labor" subtotal), `showPhotos`,
        `showTechnicians` (worker names chosen from Team/crews, with their trade); (2) logo: EVERY document and
        email resolves the tenant's logo through `src/lib/branding/logo.ts` variants (fix the legacy report email);
        upload stays in Library -> Branding; (3) modern layout modeled on the reference: letterhead (logo,
        address, phone, license #), large document title, meta block (date, number, terms, reference, service
        address), bill-to, an editable auto-drafted narrative (from findings + field log), Labor and Materials
        groups with subtotals, boxed total, and photo pages with per-finding "Problem / Corrective action" +
        Before/After (needs a `licenseNumber` field on the business); (4) everything editable before send;
        (5) tests that every toggle collapses correctly in ALL three renderings of ALL three documents, and an
        HTML-escaping pass. Consistent design tokens (one teal, `.button`), mobile-checked.
  - [x] ~~T-108 — Auto-create a job from a booked call~~ — **CANCELLED 2026-09-24 (owner decision): jobs are never
        auto-created; the admin/user decides. Superseded by T-113 (request review workflow).** Original text kept for
        history: **Auto-create a job from a booked call** (jobs-module tenants). Today a call only creates a
        lead/appointment; a job needs the manual "Create Job" tap (T-083). Add a per-business setting (default:
        off, offered in Settings) so `bookAppointment` also creates a linked draft job (customer resolved via
        `resolveCustomer`, address/service/intake carried in, `appointmentId` link), idempotent per appointment,
        with a Pipeline/Jobs indicator "created from call". Must not double-create when staff also tap Create Job.
  - [ ] T-109 — (Codex A, after T-113) **Email -> request intake** (creates a LEAD/request for review, never a job — see T-113). No inbound email exists. Design + build: a per-tenant intake address
        (Resend inbound or forwarding), the message parsed by the existing AI layer into customer / address /
        scope / urgency, creating a LEAD (default) or draft job for one-click review; attachments become job photos
        (respecting the 24-photo cap); spam/abuse limits (rate limit, sender allowlist option); never auto-replies.
        Needs a NEEDS-HUMAN for the inbound domain/MX setup.
  - [x] T-110 — **Voice platform bake-off and decision** — **SUPERSEDED 2026-09-25 by owner directive** ("smoothly move to
        ElevenLabs away from Vapi", Phase 22) before the formal 10-scripted-call comparison below ever ran. ElevenLabs shipped as the
        sole demo-line provider in Phase 24 on that directive alone. **Cleanup note (2026-09-28):** the side-by-side score (human-ness,
        talk-over, latency, cost/min) this task specified was never actually measured — if voice-quality complaints come up later,
        that comparison is still worth doing properly, but it is not blocking anything now. Original spec, for that later use:
        Follow `docs/VOICE-RESEARCH-2026-09-24.md`: Vapi + ElevenLabs voice, Vapi + Cartesia, gpt-realtime-2.1(-mini) via
        Vapi, then ElevenLabs Agents (and Retell if needed), on SEPARATE test assistants — the live line is not
        touched — scored on 10 scripted calls (human-ness blind-rated, talk-over incidents, tool success, latency,
        Spanish, cost/min).

- [ ] Phase 19 — ElevenLabs switch-over scaffolding (owner-added, 2026-09-24) — 2/3 (T-111a + T-111b done; T-112 follow-ups open)
      Owner created an ElevenLabs Creator-tier account. **Independence rule:** only the *phone call* is
      provider-specific. Field notes (Whisper `whisper-1` + `gpt-4o` `parse-field-update`), summaries/classify
      (DeepSeek), invoices, reports and the 7 booking tools (`src/lib/tools/agentTools.ts`) never touch Vapi or
      ElevenLabs and must not change. Shared contract: `src/lib/voice/types.ts` + `BusinessConfig.voiceProvider` /
      `.elevenlabs` (integrator-owned; extend with optional fields only). ElevenLabs facts used (docs, Sept 2026 —
      workers must re-verify against the live docs): webhook tools (JSON schema, secret auth header), conversation
      initiation webhook for inbound calls (POST {caller_id, called_number, agent_id, call_sid} -> return
      `dynamic_variables` + `conversation_config_override` {prompt, first_message, language, tts.voice_id}; must
      answer fast), post-call webhooks (`post_call_transcription`, HMAC `ElevenLabs-Signature`), agent PATCH
      `/v1/convai/agents/{id}` (Bearer / xi-api-key), outbound `POST /v1/convai/twilio/outbound-call`
      {agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data}.
  - [x] T-111a — **Provider seam + ElevenLabs client + rewire** (Codex). **Status: review (Worker C, `task/voice-provider`).** `src/lib/voice/provider.ts`:
        `getVoiceProvider(config)` returning a `VoiceProvider`; Vapi implementation is a thin wrapper over the existing
        `updateAssistantPersona`/`initiateVapiCall` with ZERO behavior change; new ElevenLabs implementation
        (`src/lib/voice/elevenlabs/client.ts`): `pushPersona` -> PATCH agent (prompt, first_message, language,
        tts voice from T-103 `voice` override), `startOutboundCall` -> twilio/outbound-call (no scheduling: throw
        `UnsupportedVoiceFeatureError` for `scheduledAt`, and make the follow-up cron handle that honestly).
        Rewire EVERY caller (company/settings PUT, admin/demo-customize, admin/sync-personas + syncPersonas.ts,
        calls/outbound, cron/follow-up-calls) to go through the provider chosen by `voiceProviderOf(config)`.
        `businessLookup`: resolve a business by `elevenlabs.agentId` / `elevenlabs.phoneNumber` (cached like the
        Vapi lookups). Superadmin config page + PUT: provider selector, agentId / phoneNumberId / phoneNumber
        fields (validated), shown only when ElevenLabs is selected; default stays Vapi. `/api/health` reports
        `elevenlabs: configured|not_configured` (env `ELEVENLABS_API_KEY`). Never log keys. Full mocked-fetch tests.
  - [x] T-111b — **ElevenLabs inbound webhooks + provisioning** (Codex A). **Status: review (`task/elevenlabs-hooks`).** Routes under
        `src/app/api/webhooks/elevenlabs/`: `initiation` (auth via secret header; resolve tenant by called number /
        agent id; return per-call `dynamic_variables` + `conversation_config_override` built from
        `buildAgentPrompt` + current date/after-hours context + greeting WITH the T-102 recording notice + language +
        T-103 voice override; record `conversation_id -> businessId` in Firestore for the tools), `tools/[tool]` (the
        7 tools -> the existing `agentTools.ts` functions; businessId and caller phone come from the stored
        conversation record, NEVER from model-supplied parameters; same rate limiting/abuse guards as the Vapi
        webhook), `post-call` (HMAC signature + timestamp tolerance + replay guard like `verify.ts`; writes the same
        `calls` document/outcome tagging the Vapi end-of-call-report writes — extract a shared helper only as a
        pure, tested refactor of `webhooks/vapi/route.ts`, behavior unchanged). Tool JSON schemas live in code
        (`src/lib/voice/elevenlabs/toolSchemas.ts`) and `scripts/setup-elevenlabs-agent.mjs` (dry-run default)
        creates the tools + a test agent via the API; `docs/ELEVENLABS-SETUP.md` gives the click-by-click for the
        parts that need the dashboard (agent Security tab: enable overrides + initiation webhook, workspace
        webhook + secrets). Env: `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` (post-call HMAC),
        `ELEVENLABS_TOOL_SECRET` (tools + initiation) in `.env.example`.
  - [ ] T-112 — **ElevenLabs bake-off follow-ups (todo list).** **Cleanup pass 2026-09-28** — (a) and the "after the bake-off
        decision" framing are stale: T-110 was superseded, not decided by scored comparison, so there is no scripted-call run to
        attach tools to; drop it. Still real, unbuilt work below.
        ~~(a) attach the 7 tools to the test agent and run the T-110 scripted calls~~ — moot, see T-110.
        ~~(b) import a Twilio number into ElevenAgents and assign the test agent~~ — **DONE** (T-130: `+1 689 204 2643` live on the
        agent since Phase 24; `+1 778 907 9769` imported and assigned per T-130, only the app-side "Additional phone numbers" field
        was still pending as of T-130's own note — check that before re-opening this).
        (c) decide the paid plan/minutes (Creator ≈ 275 agent-min/month; agent minutes $0.08 + LLM + telephony) — still open, needs
        an owner decision once real call volume exists.
        ~~(d) one agent per tenant vs one shared agent with per-call overrides~~ — **DONE**, decided and live: one shared agent, the
        initiation webhook supplies per-call overrides (confirmed working since Phase 24/28).
        (e) in-app ElevenLabs provisioning like the parked T-054 (create agent + attach number from the onboarding wizard) — still
        open, post-MVP.
        (f) outbound scheduling for follow-up calls (ElevenLabs' single-call endpoint has none — use its batch-calling or our own
        cron window) — still open.
        (g) voice cloning/brand voice per tenant (optional) — still open, optional.
        (h) knowledge base / FAQ upload per tenant (optional) — still open, optional.
        ~~(m) Twilio account + Florida number provisioning~~ — **DONE** (NH-21, T-130: account out of trial, two numbers imported).
        **Existing-number integration (owner question 2026-09-24) — (i)-(l):** a business that already has a phone
        number does NOT have to give it up or use Twilio itself. Ranked by friction: (i) **conditional call
        forwarding** (recommended default): their carrier forwards unanswered/busy/after-hours calls (or all calls)
        to a new "AI line" number we provision (a Twilio number imported into ElevenAgents natively, or any SIP DID);
        the business keeps its number and can switch forwarding off any time; build an onboarding step that shows the
        AI-line number, carrier-specific forwarding instructions (star codes / carrier portal) and a test-call
        verifier; VERIFY on a real forwarded call that the AI still receives the ORIGINAL caller's number (caller-ID /
        diversion headers are carrier-dependent) because the booking flow confirms it; support "ring the business
        first, AI on no-answer" AND "AI first, transfer to a human" (ElevenLabs `transfer_to_number` system tool);
        (j) **SIP trunk** for businesses already on a VoIP/PBX (RingCentral, Vonage, 8x8, Telnyx, etc.): their provider
        routes the number/extension to ElevenLabs' SIP address (TLS, digest or IP allowlist, G.711/G.722) — no porting;
        (k) **port the number** to Twilio/Telnyx for full takeover (days to weeks; only when the business wants it);
        (l) provider choice for provisioned AI-line numbers: Twilio first (native ElevenLabs import, API-driven number
        purchase for in-app provisioning), Telnyx later if per-minute cost matters.
- [ ] Phase 20 — Request Review Workflow & UX Pass (owner-added, 2026-09-24) — T-114 and T-113 in review
      **Owner workflow decision (2026-09-24):** the AI agent takes a call, records the details, and puts a REQUEST in the
      Pipeline. The admin/user opens it (from Pipeline or by clicking the call) and sees the collected information in a
      clear card. They then either ACCEPT — send a confirmation (email and/or an AI callback) and create the job themselves,
      which unlocks scheduling on the Calendar — or DECLINE and send a polite decline. In ALL cases the admin/user creates
      the job; nothing is auto-created. (Audit: confirm, cancel, Call Back and T-083 "Create Job" already exist; missing
      are the unified review card, a real decline with customer notification, and "missing information" prompts.)
  - [x] T-113 — **Request review card + decline flow** (Codex A; worktree `air-wt-request-review`; **status: merged 2026-09-25 — owner live-test pending**; prompt in
        `docs/WORKER_QUEUE.md` A2). One shared `RequestReviewCard` used by Pipeline and Calls: caller,
        what they want, T-100 intake rows, AI summary + transcript excerpt + recording, flags, and a "missing information"
        strip; actions Accept (confirm + notify + open the prefilled job form; appointments-mode tenants just confirm),
        Decline & notify (reasons, polite branded email in a new `requestDeclineEmail.ts`, honest no-email path), AI call back.
  - [x] T-114 — **Feedback fix + app-shell UX pass** (DONE + merged 2026-09-24; Deepseek; worktree `air-wt-ux-pass`; prompt in `docs/WORKER_QUEUE.md` B1). **status: `review` (2026-09-24)** — branch `task/ux-pass`, commits `60e184e` + `c4f86e9` + the evidence commit; awaiting integrator review (full evidence in `docs/IMPLEMENTATION_LOG.md`). Feedback is for CLIENT users only
        (hidden for superadmin in all three navs, incl. preview), client-facing wording ("Send feedback to Luxor", "We'll
        reply to: <email>" instead of a misleading "From"), readable disabled state, one consistent nav treatment; bounded
        shell pass: contrast (WCAG AA) via tokens, focus rings, touch targets/mobile nav, modal consistency, and tidy the
        Admin -> Clients "Sync live phone assistants" panel layout.

- [ ] Phase 21 — Demo Experience (owner-added, 2026-09-24) — 1/2 (T-116 done; T-115 widget open)
      Owner goal: a prospect should experience what a caller experiences (real phone call, not just a web test) and then SEE the results in the
      app — Pipeline, Calendar, job assignment, live field input, multi-language, invoice, report, quote. Today the wired end-to-end demo is the Vapi
      line +1 (754) 283-7658 plus the read-only sandbox (`/try/<industry>` -> "See it in the real app"); the ElevenLabs agent is a voice-only test
      until NH-21 (Twilio number) + T-112 (tools/overrides/webhooks) are done.
  - [ ] T-115 — **Browser talk-to widget on `/try/[vertical]`** (Codex, Terra medium — touches the CSP, so not Deepseek). Embed the ElevenLabs
        widget (`<elevenlabs-convai agent-id=...>` + `https://unpkg.com/@elevenlabs/convai-widget-embed`) on the public try pages when
        `NEXT_PUBLIC_ELEVENLABS_DEMO_AGENT_ID` is set (unset = renders nothing). The app enforces a Content-Security-Policy (T-061): allow ONLY
        the exact script/connect/media origins the widget needs (verify against ElevenLabs docs; no wildcards), keep every existing directive, add a
        test. Also reword the widget's terms text (via the agent's widget settings, owner decision) before public use. Blocked on: the owner
        choosing the demo agent; not needed for the phone demo.
  - [x] T-116 — (DONE + merged 2026-09-24) **Refresh the demo/onboarding playbook** (Deepseek, V4 Flash Think High; docs/HTML only, no code). **status: `review` (2026-09-24)** — branch `task/guide-refresh`, commits `6f4c5d0` + `a73cc24` + the evidence commit; awaiting integrator review (evidence in `docs/IMPLEMENTATION_LOG.md`). `public/guides/onboarding-guide.html` (and
        `field-operations-guide.html` where relevant) is stale: update it to what is SHIPPED through Phase 20 — recording notice + Apply-sync,
        industry intake fields, starter kits, work catalog + job findings, quotes, request-review (T-113 once merged), feedback (client-only),
        voice provider options (Vapi today; ElevenLabs is dormant/optional), demo-line + `/try` sandbox steps, and the owner's real-phone test
        checklist. Describe only what exists in TODO.md/CLAUDE.md/`docs/NEEDS-HUMAN-CHECKLIST.md`; anything unverified is labelled "not yet live-tested".
        Must not invent numbers, prices or claims (CLAUDE.md: keep ROI stats consistent with existing ones).

- [ ] Phase 22 — Vapi -> ElevenLabs migration (owner direction, 2026-09-24: "smoothly move to ElevenLabs away from Vapi") — P0+P2 done in
      practice, P1/P3/P4 open. **Cleanup pass 2026-09-28:** the plan's own P1 (formal parity proof before P2) never happened — the owner moved
      the demo line to ElevenLabs anyway (Phase 24, 2026-09-25) and it has been the only demo voice since. That's a real gap for a PAYING
      client migration (no measured parity, no retention/recording-policy decision, no ops-guard equivalents) even though it worked out for
      the demo. Do not treat "the demo runs on ElevenLabs" as P1 done for a real tenant.
  - [ ] T-117 — **Migrate phone AI from Vapi to ElevenLabs Agents, tenant by tenant, with rollback.** Both providers coexist behind
        `voiceProvider` (T-111), so this is a rollout plan, not a rewrite. **P0 (done 2026-09-24):** ElevenLabs agent + Twilio (689) number +
        7 tools + per-call overrides + initiation webhook wired; prod env set; separate test tenant.
        **P1 parity proof (SKIPPED for the demo, still required before any real customer moves) — the 10 scripted bake-off calls
        (`docs/VOICE-RESEARCH-2026-09-24.md`) on the test tenant; verify Pipeline/lead/appointment/
        call-record parity with Vapi calls, recording notice spoken first, after-hours + escalation behavior, bilingual switching, request review
        card (T-113), measured cost/minute; add ElevenLabs equivalents of the ops guards Vapi has (webhook-health alerting like T-065, call-record
        reconciliation), decide retention/recording policy (NH-22, NH-4), outbound follow-ups (single-call endpoint cannot schedule — keep cron-window
        approach), concurrency plan (Creator ~10 concurrent).
        **P2 demo line — DONE, but not as originally written:** the plan said move the demo to a NEW Twilio 561 number and keep Vapi 754 as a
        2-week fallback; what actually shipped (Phase 24, T-130) is the demo's ElevenLabs number (`+1 689 204 2643`, later `+1 778 907 9769`)
        with Vapi retired from demos outright, no fallback window. Fine for a demo line; note the deviation if this plan is ever reused for a
        real tenant's cutover.
        **P3 default (still open, needs an owner decision):** does a NEW real client default to ElevenLabs or Vapi in the onboarding wizard?
        `T-111`'s spec said "default stays Vapi" and nothing has since changed that default for onboarding — only the demo tenant runs
        ElevenLabs. Migrate any real tenants one at a time, each with the per-tenant flag as instant rollback and a forwarded-number fallback.
        **P4 decommission (only after ~30 stable days and owner sign-off, not reached):** cancel Vapi numbers/plan, remove the Vapi
        webhook + client + sync paths and dead code, update the onboarding guide + CLAUDE.md, rotate/remove Vapi env. Owner sign-off gates P2, P3, P4.
  - [x] T-118 — **Carry the human speech style + Spanish invitation into the app-generated prompt, clean stale Vapi wording.**
        **Cleanup pass 2026-09-28 — verified against current code, marking done:** finding (1) never-read-IDs is in the live prompt
        (`agentPromptBuilder.ts`: "Never read internal IDs, codes, or reference numbers aloud"); finding (2) the pre-tool-speech
        dead-air cause is understood and `setup-elevenlabs-agent.mjs` now preserves `pre_tool_speech`/`force_pre_tool_speech`
        instead of overwriting it (see the T-030/G1 log entries); finding (3)'s "you'll receive an email" is gone, reworded to
        "the office will confirm first thing" (T-146). Finding (4) was cost data only, no action needed. The bilingual-invitation
        half of the original ask (a config-driven "How you speak" section, A/B-tested against the dashboard prompt) was never
        built as its own deliverable — if the phone AI's tone needs another pass, treat that as new work, not a reopen of this.
        Original spec kept for reference:
        Found 2026-09-24: with ElevenLabs per-call overrides ON, the tenant's app-generated greeting/prompt (`buildAgentPrompt`, greeting template,
        recording notice) REPLACES the hand-written "Alice" prompt that tested so human in the ElevenLabs dashboard, and the app greeting lacks the
        bilingual invitation ("Y si prefiere español, con gusto le ayudo"). Add a config-driven "How you speak" section (short turns, one question at a
        time, natural acknowledgements, spell-back rules, honest robot/recording answers) + an optional bilingual suffix when `agentLanguages` has both
        (fixes T-106's prompt half too), driven by the vertical template (no per-industry `if`), A/B-tested against the dashboard Alice prompt on the
        ElevenLabs test tenant. Also fix stale UI/help text in the admin config page that still says "Vapi IDs" for provider-neutral settings
        (auto-callback help, page subtitle). Model: Terra medium (prompt builder is tested but sensitive: live behavior).
        **First real call findings (2026-09-24, conv_2901m3atg8bf…, 121 s, all 4 webhooks 200, appointment booked):** (1) the AI READ THE APPOINTMENT ID
        LETTER BY LETTER ("w Axjl D six j F m…") — add a prompt rule (and/or don't return the raw id to the model): never spell out ids/codes; offer to
        text/email it instead. (2) ~7 s dead air between "let me check availability" and the tool call (LLM tool-request latency 6.3 s + tool 2.5 s):
        investigate ElevenLabs pre-tool speech / tool timeout settings and the app tool latency (Firestore reads in checkAvailability/bookAppointment).
        (3) The AI told the caller "you'll receive an email" — true only after the admin confirms an after-hours request (T-113 flow); reword.
        (4) Cost observed: 2-minute call = $0.163 (voice $0.161 + LLM $0.003) ≈ $0.08/min on Creator, plus Twilio telephony.
  - [ ] T-120 — **Demo Studio drives the ElevenLabs demo line too** (Codex Sol medium — touches the demo-reset guards). Today Demo Studio only
        reconfigures `demo-roofing` (the Vapi line; allowlist `DEMO_BUSINESS_IDS` + `isDemo` marker guards). Goal: one launcher, pick a line
        (Vapi 754 / ElevenLabs 689) + an industry, and the chosen line's tenant adapts per call (the ElevenLabs initiation webhook already builds
        the prompt from the tenant, so a launch only needs to update the tenant + seed demo data). Keep BOTH guards (code allowlist AND `isDemo`);
        add a way to mark the ElevenLabs demo tenant `isDemo` without loosening the guard for real tenants; tests for the guards. **UNBLOCKED 2026-09-25**
        (owner: ElevenLabs only, no more Vapi) and RESCOPED: the ElevenLabs number moves onto `demo-roofing` instead — see Phase 24 / D1.
  - [x] T-121 — **Demo Studio: no-friction launch + "Run a demo in 5 minutes" runbook** (DONE 2026-09-24, Claude). Company name and notification
        email are now OPTIONAL (blank -> "<Industry> Demo" + default inbox; a provided email is still validated; server + UI + 4 tests). New
        scannable `DemoRunbook` card at the top of `/hub/demo`: 6 steps with persisted pre-flight checkboxes, both demo lines with dialable numbers,
        say-this scripts (English + Spanish), and one-click `?preview=` buttons to Pipeline/Calls/Calendar/Jobs for each line's tenant, plus an
        honest "not live yet" wrap-up. Facts mirror docs/NEXT_SESSION.md (update both when a line changes).
  - [ ] T-119 — **Declutter the admin business-config form and make it provider-aware** (Deepseek, V4 Flash Think High — bounded UI, no live-path logic). Owner
        (2026-09-24): "the form is annoying… if the agent doesn't need to be configured here, keep config in ElevenLabs." Design: with ElevenLabs per-call overrides
        the app still owns the BUSINESS rules (industry template, services/FAQs/emergency+booking rules, greeting, agent name, recording notice, intake fields) —
        keep those; voice/LLM/turn-taking/tools live in ElevenLabs. So: when Phone provider = ElevenLabs hide Vapi-only fields and the per-language "voice
        overrides" block (move under a collapsed "Advanced"), drop unused Plan tier/Role controls if nothing reads them (verify with grep first), group the page
        into 4 clear sections (Business, Phone provider, What the AI says, Routing/notifications), add a short "where things live" note, keep Save sticky at the
        bottom, and show validation errors inline next to the field. Fixed 2026-09-24 (837a6d6): the save 500 (Firestore read-after-write in the config
        transaction) and the page swallowing the server's message — do not regress either.

- [ ] Phase 23 — Launch readiness: email, calls, documents, smoke test (owner-directed, 2026-09-25) — 6/9
      Outcome of the 2026-09-25 session. Everything marked [x] is merged to `main` and deployed.
  - [x] T-122 — **Email deliverability pass** (Claude). Found prod `RESEND_FROM` was Resend's sandbox sender (only delivers to the account owner) and that invoice/quote/report routes marked "sent" even when delivery failed.
        `src/lib/comms/prepare.ts` (base64 images -> inline CID attachments, plain-text part, tenant `From` display name); `sendEmail({fromName, replyTo})`; routes return 502 and do NOT mark sent on failed delivery;
        prod `RESEND_FROM` = `Luxor CRM <crm@luxordev.com>` (domain was already verified; stored non-sensitive). Test email delivered per Resend. Owner still to confirm dkim/spf/dmarc = pass in a received message (NH-25).
  - [x] T-123 — **Call visibility + access fixes** (Claude). ElevenLabs calls were saved without `startedAt` so the Calls list (ordered by it) never showed them (fixed + regression test; the one existing call `call_elevenlabs_conv_2` is still undated — optional backfill, T-127).
        `/api/auth/profile` derives `superadmin` ONLY from the verified token claim (a stale `superadmin: true` on kwamwad@gmail.com's owner doc opened the admin shell); Admin -> Usage "Phone line" column is provider-aware;
        Demo Studio takes an optional business phone (-> `contactPhone`, never the escalation number); Admin nav gains Demo Studio + Playbooks.
  - [x] T-107a/T-107b — **Document suite** merged (Codex + integrator): shared `src/lib/documents/` letterhead, hide materials/labor, technicians, narrative, licenseNumber; invoice + quote + report on one layout. **Reports carry NO pricing** (owner, 2026-09-25):
        `reportSections()` lists plain labor/material facts; hide toggles omit the section. The legacy `_ReportRenderer` in `jobs/[jobId]/page.tsx` is dead code that still has pricing (T-127).
  - [x] T-113 / C2 — request review + decline and the guide refresh merged (see Phase 20/21).
  - [x] T-124 — **End-to-end smoke test** (DONE 2026-09-25 — C5 + C6 merged, see the note under T-128) (Codex Terra medium; prompt = `docs/WORKER_QUEUE.md` **C5**; worktree `../air-wt-smoke`, branch `task/e2e-smoke`). One offline test `src/e2e/demo-path.test.ts` walking call -> appointment -> Calls/Pipeline lists -> confirm/decline -> job -> field update (EN + ES) -> report/quote/invoice -> emails,
        plus `docs/SMOKE-REPORT.md`. Breaks are recorded, not patched. Then the owner does the live run-through (NH-26).
  - [ ] T-125 — **ElevenLabs call audio + escalation** (Claude, or Codex Sol medium — live call path). ElevenLabs calls store NO recording (the Calls page player is empty; the post-call webhook is transcript-only): enable/handle the audio webhook or fetch the audio. Also set an escalation phone on the test tenant so emergency transfer works.
  - [ ] T-126 — **Billing** (HELD — pricing not final; Codex Sol medium, money path). Stripe subscriptions, monthly minutes metering from call docs, `seatLimit` from plan, automatic dashboard restriction on non-payment (the manual pause already exists: `api/admin/businesses/[id]/subscription`). Not needed to start selling — manual invoicing (Admin → Invoices, recurring-draft cron) covers the first clients.
        **Agreed 2026-09-27 (owner):** month-to-month, no lock-in term; invoices due on receipt or net-15; reminder emails at day 1 and day 7 overdue; restrict the DASHBOARD (never the phone line) at day 10–15 overdue; release the phone number only after a 30+ day lapse or explicit cancellation.
        **Owner's price intent 2026-09-27:** agent ≈ $300/mo, CRM ≈ $600–800/mo, whole suite ≈ $2,000/mo. **Proposed (not yet approved):** Agent Only $297 (300 min, 1 seat) · CRM Only $749 (5 seats) · Full Suite $1,799 (750 min, 10 seats) · Enterprise $2,900+ custom; overage $0.35/min; extra seat $29; setup $2,500 Full Suite / $1,000 Agent Only / $5,000+ Enterprise, with a founding-customer setup of $1,000 for the first 3 clients in exchange for a testimonial + case study. (Supersedes the 2026-09-25 Starter/Pro/Team proposal.)
  - [x] T-127 — **Cleanup** (Worker D / Deepseek, branch `task/cleanup-127`) — **MERGED to local main 2026-09-27 (integrator)**. Removed the dead `_ReportRenderer` (335 lines, still carried pricing) + its orphaned helpers `groupAndPadForGrid`/`MetaRow` and the unused `logoStyle`/`needsLogoChip`/`reportFindings` imports from `src/app/company/jobs/[jobId]/page.tsx`; also cleared that file's unused `otherSubtotal` binding and redundant exhaustive-deps disable (commits `41028bf`, `8b012bc`). The `DocumentGroup` unused-import warning was actually in `src/lib/documents/report.ts` (not page.tsx) and is removed there. `startedAt` backfill on `call_elevenlabs_conv_2` NOT done (needs a live production write; still open). Worktrees removed: `air-wt-documents-2` (`task/documents-2`) and `air-wt-photos` (`task/photo-dnd`) — both had no commits ahead of main and clean statuses (the `air-wt-photos` folder itself is left on disk, locked by a process; its worktree registration and branch are gone). Left `air-wt-guide-3` (`task/guide-3`) in place: its `public/guides/onboarding-guide.html` and `docs/DEMO-DAY-RUNBOOK.md` contain 2026-09-26 Phase 25 content that main lacks — NOT safely merged, so not removed (still true post-merge). **Integrator merge note:** merged alongside E6b and T-129 (both also touch `jobs/[jobId]/page.tsx`); combining T-127's `_ReportRenderer` removal with E6b's separate removal of `ReportPhotoCard` left `PHASE_ORDER`, the `ReportPhoto` type, `ReportSection`, and the `PhotoPhase` import fully dead — neither branch could see this alone. Removed all four as part of the merge; `tsc`/eslint clean afterward.
  - [ ] T-128 — **Photos -> Firebase Storage** (HELD — the owner said NOT moving Firebase to Blaze yet, 2026-09-25). `src/lib/photos/store.ts` is built to be swapped; Spark's 1 GiB / daily quotas are the ceiling for base64-in-Firestore photos.
  - T-124 note (2026-09-25): C5 (`src/e2e/demo-path.test.ts`) + C6 (`src/e2e/field-audio.test.ts`) merged; `docs/SMOKE-REPORT.md` all 10 steps pass offline
        (cross-tenant partial by design: public webhooks use provider secrets). Multipart audio is not accepted by `field-audio` (JSON/base64 only) — recorded as `it.fails`, not a bug in the app's own client.
        Worktrees `air-wt-documents-core`, `air-wt-guide-2`, `air-wt-report`, `air-wt-request-review`, `air-wt-smoke` removed (T-127's worktree part done).

- [ ] Phase 24 — The 20-minute roofing demo on ElevenLabs (owner-directed, 2026-09-25) — 3/3 BUILT; owner verification pending (Twilio Upgrade NH-21, scripted live calls, 3 dry runs)
      Spec: `docs/DEMO-READINESS-PLAN.md` (§1 demo-breaking findings, §2 running order, §3 worker tasks). Prompts: `docs/WORKER_QUEUE.md` section **D**.
      Owner decisions: ElevenLabs only (Vapi retired from demos; number kept 2 weeks as fallback); roofing first; typing the prospect's name in Demo Studio
      adapts the agent on the next call (initiation webhook reads the tenant per call — no agent push). Blocker for the owner: Twilio Upgrade (NH-21).
  - [ ] **D1** (Codex A, Sol medium, `air-wt-demo-line`) — phone line + Demo Studio: T-120 (demo line -> ElevenLabs via `scripts/move-demo-line-to-elevenlabs.mjs`),
        T-129 (demo reset leaks: orphan job subcollections, customers/quotes/invoices/punches/schedulingLocks/logos), T-118 (no IDs read aloud, `sayToCaller`,
        "How you speak", pre-tool filler, no false email promise), T-125 (call audio via on-demand proxy route), T-130 server side (Live call row at initiation),
        T-131 (Demo Studio: status card, 60-second prospect form with logo, greeting preview, test call, 20-minute runbook, no Vapi).
  - [ ] **D2** (Codex B, Terra medium, `air-wt-job-loop`) — the job loop: live refresh (Calls/Pipeline/Dashboard/job page), one-tap Confirm & create job
        (T-133, idempotent, carries email + call link), Findings <-> Library (T-135: save to Library, suggestions from voice issues, field picker), quote rework
        (T-134: auto-draft, + Add item from Library, explained options), field speed + Work complete (T-136), report auto-draft (T-137), derived job history +
        next-step stepper (T-138), Customers in nav, Jobs stage filters.
  - [x] **D3** (Deepseek V4 Flash Think High) — T-132 South Florida roofing content: services/FAQs/emergency rules, starter catalog
        additions, `src/lib/verticals/demoSeedRoofing.ts` (the fully worked Plan-B job J-1001). MERGED 2026-09-25 with integrator fixes (no wind-mitigation/
        four-point promise — the team decides or refers a licensed inspector; J-1001 is an inspection visit awaiting a quote). Worktree removed.
  - D1 status 2026-09-25: **DONE — Part 1 AND Part 2 merged + deployed** (Part 2 = call quality/sayToCaller, live call row, audio proxy, test call, J-1001; ElevenLabs agent setup applied, pre_tool_speech force verified). Part 1 detail:  (steps 1-3, 5: migration script, line state/greeting preview, reset hygiene, Demo Studio
        redesign) with integrator fixes (size-safe reset backup — a photo blob would have made every later launch fail; migration script parses the
        pulled key). **Migration APPLIED:** +1 689 204 2643 -> `demo-roofing` (voiceProvider elevenlabs); `carlita-elevenlabs-test` keeps it under
        `elevenlabsArchived`; rollback = `MIGRATION_ENV_FILE=<pulled env> node scripts/move-demo-line-to-elevenlabs.mjs --rollback`. **ElevenLabs calls
        now land in `demo-roofing`, not carlita.** Resume prompt: `docs/WORKER_QUEUE.md` "D1 resume" (J-1001 seed, same-slot test, steps 6-9;
        toolDispatcher.ts edit approved for sayToCaller only).
  - **D2 DONE 2026-09-25 (integrator built Stages 2-4 after Codex B stalled; see the STATUS block in docs/DEMO-READINESS-PLAN.md for deviations — notably the voice-model swap was NOT done, timing logs added instead).** Shipped: Findings<->Library (suggestions, picker, one-off price + Save to Library, field "＋ Finding" via a grant-scoped endpoint), quote rework (auto-draft, + Add item, Issue->Work->Price cards, intro, options copy, autosave), Work complete + statusHistory, cheap live job poll, report auto-draft + auto-open, job history, next-step guide, Customers page, action-named job filters, agent-name/Vapi wording cleanup. The old D2 notes below are superseded. Earlier note: Stage 1 MERGED + deployed (atomic idempotent request->job, live refresh + Live/Ended + new-row highlights; integrator fixed 3 refresh bugs). Stage 2 (Findings<->Library, quote rework) prompt in `docs/WORKER_QUEUE.md` "D2 Stage 2"; Stages 3-4 after. Earlier note: first session stopped after partial Stage 1 (live refresh + request→job route; double-tap race found in review) — resume prompt
        in `docs/WORKER_QUEUE.md` "D2 resume" (finish Stage 1 + Stage 2, then stop for the quote review).
  - [ ] Integrator (Claude): merge D3 -> D1 Part 1 -> run the migration + redeploy + escalation phone + agent audio/pre-tool settings -> 5 scripted live
        calls -> merge D2 stages -> playbooks (`onboarding-guide.html`, `/hub/guide`, NEXT_SESSION) -> owner's 3 dry runs (plan §2 definition of demo-ready).
  - Later (plan §11-13): T-140 onboarding slim-down + number provisioning + convert-demo; T-141 tenant sending domain; T-142 call reconciliation cron;
        T-143 projection race + lookup-cache TTL.

- [ ] Phase 25 — Demo feedback round 2 (owner-directed, 2026-09-25/26). Spec + prompts: `docs/DEMO-FEEDBACK-PLAN.md`; queue: `docs/WORKER_QUEUE.md` section **E**.
      Owner decisions: numbered workflow tabs (Findings, Quote, Report, Invoice); Issues merge into Findings; the crew can NOT mark a job complete (office only);
      Complete -> Invoiced, Invoiced = invoice SENT, then Mark paid; escalations + end-of-call safety net create leads (never jobs); reports price-free unless
      "Include quote" is ticked (amends D5); Florida legal notices are editable DRAFT defaults, OFF until the owner ticks "reviewed"; document photos are
      Before | After pairs, 4 per page, drag-and-drop.
  - [x] Integrator slices (local `main`, NOT pushed): `58ed94b` parse fix + Retry, session refresh, Complete->Invoiced + Mark paid, locked sent invoice,
        punch re-projection; `43a6aa0` escalation leads + safety net, no drip escalation, full number read-back, Pipeline/Calls chips, fmtPhone;
        `28affdd` quote answeredAt + locked-quote banner + invoice paid in history. Gates: full vitest green (flaky pair re-run alone), next build green.
  - [x] **E1** (DONE, merged to local main 2026-09-26; integrator polished the Team page) — QR time clock "Forbidden" fix, no field Work complete, required worker name, viewer read-only, Team page (Invited/Active/Locked, lock/unlock, revoke QR links).
  - [x] **E3** (DONE 2026-09-26; integrator finished after Codex B's partial; merged to local main) — job page restructure, newest-first Activity, Issues -> Findings, numbered findings, lock notes, picker sheet cut-off.
  - [x] **E4** (Deepseek V4.1 Flash Thinking Hard; MERGED to local main 2026-09-26) — `docs/AI-PROVIDERS.md`, `docs/FLORIDA-DOCUMENT-NOTICES.md` (DRAFT) + `legalNotices.ts`, seeded call transcripts.
  - [x] **E2** (DONE, merged to local main 2026-09-26; integrator added the 24 h query look-back) — booking checks jobs + crew bookings, cancel frees the slot, appointment/dashboard queries, jobs paging + CSV, classify fallback to OpenAI.
  - [x] **E5** (2026-09-26, merged to main; Codex did steps 1–3 then hit a usage limit, the integrator finished) — invoice in the reference's voice (opening/closing/thank-you/terms defaults in Settings → Documents, five-column tables), report fixes (`stripHiddenFacts`, "Prepared for"), opt-in **Include quote** on the report (sent/accepted quotes only; report stays price-free otherwise), and **Terms & notices**: Florida DRAFT wording, editable, OFF until the owner approves in Settings → Documents (approval is bound to the exact wording and refused while any `[DRAFT` marker remains; statutory notices print only on residential jobs over $2,500 — new per-job "Commercial property" switch on the Quote and Invoice tabs). Notices render in the quote/invoice previews and emails. **Owner to-do:** attorney review of `docs/FLORIDA-DOCUMENT-NOTICES.md`, replace the `[DRAFT` text, then tick "I have had these reviewed".
  - [x] **E6a** (2026-09-26, merged; Codex) — explicit `pairId` on After photos ("Pairs with…" in the edit sheet), sortable Photos tab (mouse/touch/keyboard), `PATCH /photos/order` (office-only, tenant-scoped), pure `photoPages()`. **Now verified in a real browser** by the smoke harness (`e2e/photos.spec.ts`, 2026-09-26): drag-and-drop by mouse and by keyboard both persist across a reload, on desktop and phone. No further check needed.
  - [x] **E6b** (2026-09-27, Codex, task/doc-photos, `air-wt-doc-photos`) — **MERGED to local main 2026-09-27 (integrator)**. Quote and Invoice expose **Include photos**, default to the report-selected photos, persist explicit `photoIds`, and render the shared `photoPages()` Before | After layout in preview/print/email. All save/send paths validate tenant/job ownership, uniqueness, the 16-photo cap and blob existence with clear 400s; report send loads blobs server-side, posts no base64 from the browser, and uses `photosBlock()` like quote/invoice. Negative route tests cover another job, another tenant, >16, duplicates and deleted blobs. Gates (worker's own branch): `tsc` clean; changed-file eslint 0 errors; full Vitest 1,314 passed + 1 expected fail (the two documented load-time timeouts pass alone 41/41); full smoke harness 82 passed / 2 intentional phone skips with real desktop+phone screenshots and captured outbox HTML; `next build` green (90/90 static pages). Evidence: `docs/IMPLEMENTATION_LOG.md`.
  - [x] **G3** (2026-09-26, Deepseek V4.1 Flash Thinking Hard, task/guide-3, `air-wt-guide-3`) — **was marked done but never merged; merged to main
        2026-09-27 late (`0d2f7a8`) during worktree cleanup.** Written before T-144/G1, so the guide does not yet mention the setup checklist or the new
        booking behaviour — fold that into T-145's Guide rewrite. Refreshed `public/guides/onboarding-guide.html` (version reconciled to **3.0**; tabs/Findings-merge/office-only-completion/Team page/Complete→Invoiced→Paid/Settings→Documents/price-free report/Terms & notices DRAFT/Before-After photo pairs all corrected; corrected the self-led sandbox section, which had wrongly claimed a viewer could log field updates) and `docs/DEMO-DAY-RUNBOOK.md`'s 20-minute order to match. 3 commits (`708688d`, `be25889`, `bf510a4`), only the 3 allowed files touched, gates n/a (docs only). **Integrator answers to G3's questions:** (1) version **3.0** confirmed — correct call, since this is the first guide refresh after a genuinely new tab/workflow structure, not a wording tweak. (2) Keep the report tab's existing "In report" photo behavior documented — it is real and already shipped (report photos, `MAX_REPORT_PHOTOS`), separate from E6b's quote/invoice photo work; G3's guide should describe it, not omit it — **follow-up: add one sentence back into the guide's report section on the next docs touch (small, non-blocking).**
  - [x] **T-129 — Demo-ready UX declutter pass** (2026-09-27, `task/ux-declutter`). **MERGED to local main 2026-09-27 (integrator).** Removed all eight `KNOWN_PHONE_OVERFLOW` entries after focused phone smoke checks: Dashboard attention rows, Jobs phone cards, Settings, Field, Hub/Demo Studio/Playbooks, and Admin Invoices. Photo action targets are now 40px with a regression assertion; sidebar navigation scrolls above its Quick Add footer on short desktops. Commits: `0e33a4f`, `c5b3218`, `e1c0e26`, `86c390e`, `6582209`, `0be34d2`, `e250aed`, `cfde255`.
  - **Integrator merge note (2026-09-27):** merged T-127 + E6b + T-129 together (in that order) into local `main`, resolving 2 trivial conflicts (an append-only `docs/IMPLEMENTATION_LOG.md` entry each time; one identical `useEffect` deps-array line touched by both T-127 and E6b — took E6b's superset version). Re-ran every gate on the *combined* tree rather than trusting each branch's own report: `tsc` clean, `eslint .` 0 errors/31 pre-existing warnings, full `vitest run` 1,315 passed + 1 documented flake (re-ran alone, passed), `next build` green, and the **full** Playwright smoke suite (not just the affected pages) 82 passed / 2 intentional skips — confirming T-129's CSS changes and E6b's new photo-selector UI don't collide anywhere. One emergent dead-code issue found only by testing the merge, not either branch alone (see the T-127 note above), fixed before merging. Not pushed to `origin/main` — owner approval still required for any push.
  - [ ] NEEDS-HUMAN: attorney review of `docs/FLORIDA-DOCUMENT-NOTICES.md` then tick "reviewed"; fill account owners in `docs/AI-PROVIDERS.md`; check OpenAI + DeepSeek balances; relaunch Demo Studio after deploy.

- [ ] Phase 26 — Sell-readiness: a Canadian demo number and the first-client runbook (owner-directed, 2026-09-26)
  - [x] **T-130 — Provision a Canadian number for demos.** **MERGED to local main 2026-09-27** (integrator: reviewed independently — tsc clean, full `vitest run` 172 files/1,328 passed + 1 expected fail, re-verified before merge). Code side: `extraPhoneNumbers` on `BusinessConfig.elevenlabs`, lookup checks primary then extra numbers (no agent-id fallback preserved), admin config validation + collision guard, Demo Studio reset preserves it. Owner side: bought `+1 (778) 907-9769` (West Vancouver, BC — a 604-area overlay code, same market), Twilio account upgraded out of trial, imported into ElevenLabs and assigned to the existing "Alice — Roofing" agent (confirmed in dashboard, Voice/Messaging webhooks now point at `elevenlabs.io`, not `demo.twilio.com`). **Still needed:** add `+17789079769` under Admin → Clients → `demo-roofing` → Edit → Additional phone numbers, then one test call.
        Needs the owner's Twilio account (billing + area code choice); a voice-only number needs no A2P 10DLC/CNAM registration (that's SMS-only), so this
        is materially simpler than the US number was.
        **Decided 2026-09-27 (owner): Option A — the Canadian number answers as `demo-roofing` (US content is fine; the point is functionality); area code
        Vancouver 604.** Needs a small code change: the initiation webhook resolves the tenant by the CALLED number first and deliberately does not fall back
        to agent id (`src/app/api/webhooks/elevenlabs/initiation/route.ts`), so a second number on the same agent would get a generic, tenant-less call
        today. Prompt: `docs/WORKER_QUEUE.md` section F3. Owner steps: buy a 604 voice number in Twilio → import it into ElevenLabs → assign it to the same agent.
  - [ ] **T-131 — First-client onboarding runbook.** Spec: `docs/FIRST-CLIENT-RUNBOOK.md`. A click-by-click, roofing-first (generalizable to any of the 13
        industries) sequence for turning a signed prospect into a live tenant: create the business, run the starter kit, provision the phone number,
        set escalation/notification contacts, invite the team, set the recording-notice/legal-notice state, and the first-week check-ins. References the
        existing `docs/ADMIN-ONBOARDING.md` and `public/guides/onboarding-guide.html` rather than duplicating them — this doc is the owner's own sequence,
        those are the client-facing/step-reference material.

- [ ] Phase 28 — **Booking must be flawless** (owner-directed, 2026-09-27: "that can never happen"). Spec + evidence:
      **`docs/BOOKING-RELIABILITY-PLAN.md`**. Prompts: `docs/WORKER_QUEUE.md` section **G**. Takes priority over Phase 27's T-145.
      **What happened** (real call `conv_2901m3jamh7yfz6raa84jqg2rxzs`, Carla Snyder, 2026-09-27 16:59 EDT, transcript read via the ElevenLabs API):
      two separate failures — (1) `checkAvailability` offered 12:00/12:30/1:00 AM for Monday and Wednesday (round-the-clock demo hours + a slot
      finder that only knows a date, never a time); (2) `bookAppointment` rejected Monday 8:00 AM and Tuesday 8:00 AM as "just taken" (booking
      treats the whole company as one calendar, and seeded demo bookings/earlier test bookings sit on it — live data not yet inspected).
      **Drift:** 09-25 the number moved from a clean test tenant to the seeded `demo-roofing`; `d1bee4e` (09-25, integrator) set round-the-clock
      hours; `e9caef0` (E2, 09-26) made every appointment and job block the whole company. Each had passing isolated unit tests; no real booking
      call was made after either. **Decisions:** demo hours Mon–Fri 8–5, weekends closed; every client picks hours at setup (structured,
      validated, one parser); capacity = number of crews (min 1); the agent books the exact requested time when free and otherwise names the
      closest openings; never offer 21:00–07:00 unless asked; after-hours calls still offer real next-day times.
  - [~] **Hotfix `6fcbe12` (integrator, 2026-09-27) — PARTIAL, DEPLOYED 2026-09-27 evening** (push `ea80f54`, prod deploy Ready on
        `crm.luxordev.com`). Real daytime demo hours (Mon–Fri 8–5, Sat 9–1, Sun Closed) + a booking-forward after-hours greeting (no "office is
        closed"), with regression tests. Fixes failure (1) only; does NOT fix the "8 AM just taken" failure (that is G1). The live Firestore doc
        keeps the round-the-clock hours until the owner edits Settings or relaunches Demo Studio (a relaunch now applies the real hours).
        Not yet proven by a real call. **Superseded by G1** (deployed the same evening): the demo is now Mon–Fri 8–5, Saturday AND Sunday Closed.
  - [~] **G1 — Booking engine** — **MERGED + DEPLOYED 2026-09-27 evening** (push `406ca0a`, `crm.luxordev.com`); live ElevenLabs tools updated
        (checkAvailability + bookAppointment only); 6 ElevenLabs agent tests pass. **Booking-change gate still open for ONE thing: a real phone
        booking + transcript** (owner: relaunch Demo Studio, then call). Integrator review fixed 4 issues before deploy (missing weekday = Closed,
        diagnostic uses the engine's parser, tool updater keeps speech settings + compares only real schema fields) and the agent tests found a
        5th after deploy: the conflict reply "8 AM Monday is booked" made the agent tell the caller they WERE booked — reworded to "NOT BOOKED …
        was just taken", redeployed ~8 min later. Details: `docs/IMPLEMENTATION_LOG.md`. (Codex, GPT-6 Sol medium, worktree removed). Shared
        hours module (one parser), capacity model + capacity-aware locks, `preferredTime` (was T-147), closest alternatives on conflict,
        overnight guard, DST-correct local times, demo hours Mon–Fri 8–5 + seeded items at business-hour times, tool schema + agent prompt
        "How to book", `setup-elevenlabs-agent.mjs --update-tools`, the §4 booking scenario suite (incl. a replay of Carla's exact tool calls),
        read-only `scripts/check-booking-data.mjs` (hours that don't parse, what occupies the next 7 days).
  - **Queue consolidated 2026-09-27 night → `docs/WORKER_QUEUE.md` section H (4 prompts):** H0 finish T-144 · H1 = G1 · H2 (Deepseek) = G3 + G4 ·
        H3 = G2 + T-145. The G2/G3/G4 rows below stay as the specs; their standalone prompts are superseded.
        **Status 2026-09-27 late: H0 and H1 DONE (merged + deployed). H2 and H3 can both start now** (their prerequisites are on main).
  - [x] **G2 — Operating hours at setup — MERGED 2026-09-28 (`627a096`, + `ead57c1` legacy 23:59 fix)** → ran as **H3 Part 1** (Codex, GPT-6 Sol medium, `air-wt-setup-ux` / `task/setup-ux`, after G1 AND T-144 merge,
        before T-145). Structured hours editor (per-day open/close selects, Closed toggle, presets) in Company Settings, a required "Hours"
        step in the onboarding wizard, admin client config; server-side validation in every route that writes hours; Calendar uses the shared
        parser; setup-checklist item "Set your hours".
  - [x] **G3 — Booking regression tests in the smoke harness + live test-call script** → runs as **H2 Part A** (Deepseek V4.1 Flash Thinking: Hard, `air-wt-booking-verify`,
        `air-wt-booking-tests` / `task/booking-tests`, after G1). `e2e/booking.spec.ts` + a booking scenario in the simulated call;
        `docs/BOOKING-TEST-SCRIPT.md` (the calls the owner and the ElevenLabs agent tests make, with the exact expected answers).
        **H2 Part A → review 2026-09-28**: branch `task/booking-verify`, commit `0375d5f`; `npm run e2e:booking` 7/7 (plus S3/S6 corrected to the 14-day scan window), `e2e/booking.spec.ts` 4/4 desktop+phone.
  - [x] **G4 — Daily booking canary** → runs as **H2 Part B** (Deepseek, same worktree, after G1). A 7 AM ET
        cron checks next-business-day availability for `demo-roofing` and every tenant with a phone line; emails the owner and flags Admin
        when a slot is overnight/past/outside hours or hours don't parse.
        **H2 Part B → review 2026-09-28**: commits `95e40b3`, `8ec8c04`; `/api/cron/booking-canary` (vercel `0 11 * * *`), Admin Usage Booking column, canary tests 14/14.
        **MERGED 2026-09-28 (`67388ef`, integrator — answer to H2's question: yes, both the G3 and G4 rows were the H2 rows).**
        Reviewed: reuses `requireCronAuth` + the real `checkAvailability`, writes only `bookingCheck` on the business doc, alerts
        connect@luxordev.com. Re-run on merged main with the Phase 30 changes: `e2e:booking` 7/7. Still owed (owner/integrator): read
        `/admin/usage` after the first 11:00 UTC run; one real phone booking + transcript.
  - [ ] Canary follow-ups (from the H2 review, 2026-09-28): (a) it flags any offered time before 7 AM as "overnight" — a tenant that
        opens at 6 AM would get a false alarm; judge overnight against the tenant's own hours instead. (b) G1 sets `pendingConfirmation`
        on every booking, so "flagged for morning confirmation" is not time-conditional (a G1 behavior, not the canary's). (c) the
        Calendar board scrolls sideways on a 375 px phone, so a tile can sit partly off-screen (pre-existing).
  - [x] Integrator after G1 merges (2026-09-27, owner-approved "do all"): read-only live check of `demo-roofing` (round-the-clock hours still
        stored; 5 crews; 9 seeded appointments at 8:54 AM / 8:54 PM = launch-time offsets, the "8 AM just taken" cause); push + deploy; tool update
        with the URL pinned to `ai-roof.vercel.app` (2 tools changed, 5 untouched, speech settings unchanged); ElevenLabs agent tests (below).
        **Saved agent tests (run with `agent_config_override` = the real per-call prompt; webhook param paths are `body.<field>`):**
        `test_2701m3jvc0htecdvh181ha74b2tv` Carla replay · `test_2001m3jttnf6ef48wqqmkt707q09` time taken · `test_6301m3jvbznpe8t9r2x6gw392gpr`
        conflict at booking · `test_7601m3jvmemdfsarcfbe658ffy9a` exact time booked · `test_5701m3jttq3ger8s3gs99pejjmhv` weekend → Monday ·
        `test_1801m3jvmfdrecwrew492thc9553` after-hours "tomorrow". All 6 pass.
  - [ ] **NEEDS-HUMAN (now, 5 min) — closes the booking gate:** relaunch Demo Studio (Roofing) — on the deployed code it writes Mon–Fri 8–5,
        weekends Closed and re-seeds appointments at business-hour times (the stored doc still has round-the-clock hours). Then call
        +1 (689) 204-2643 and ask for a weekday 8 AM. The integrator reads the transcript before calling booking fixed.
  - [x] **OWNER DECISION — "Minimum 24-hour notice" — DROPPED 2026-09-28 (plan §1 I, T-154; takes effect on the next Demo Studio launch)** (roofing template booking rule, `src/lib/verticals/templates.ts:199`, spoken to the agent in
        its prompt) is NOT enforced by the booking engine, so the prompt and the engine can disagree (e.g. a Sunday-evening caller asking for
        Monday 8 AM). In the agent tests the model ignored the rule and booked, but that is not guaranteed. Choose: (a) enforce it in the engine
        (a per-tenant `minNoticeHours`, offered times start 24 h out), or (b) drop it from the roofing template/demo. Recommendation: (b) for the
        demo — "can you come tomorrow morning?" is the most common ask.

- [ ] Phase 29 — **T-146: the owner's 2026-09-27 night test call** (integrator, branch `fix/demo-test-feedback-0928`, NOT pushed —
      waits for "approve push"). Transcript read first (`conv_9201m3k15zbqfrns2m1kaya26jen`, 11:33 PM EDT) + read-only prod check.
  - [x] **"Booked 2 PM, Pipeline said 8 AM" — not a booking bug.** The 2 PM booking was stored correctly (`NtC8AGTik34jOYLpi9TQ`, Mon
        Sep 28 2:00 PM, pending). Demo Studio had not been relaunched since 2026-09-25, so that night's "Kareem, Sat Sep 26 8 AM" test
        booking still sat in **Needs Confirmation** (sorted by appointment time, so the stale past one came first) and the owner confirmed
        it. Fix: Needs Confirmation lists bookable requests first and past-time ones last with "This requested time has already passed";
        no Confirm button on a past-time request.
  - [x] **AI invented availability.** Asked "anything in the afternoon?" / "does 3 PM work?", gpt-4o-mini named 1 PM/2 PM open and 3 PM
        taken with no tool call (2 PM happened to book). Prompt rule added (re-check every new time; never state a time a tool did not
        return). New agent tests `test_8801m3k2sjmmeh9sje0a2wfx5fg8` (afternoon) + `test_3101m3k2skm1etkahc6jdzz3pg1v` (3 PM): old prompt
        fails 5/6, new prompt passes 6/6; the 6 G1 tests still pass (all 8 x3 = 24/24).
  - [x] **Call Back always failed in a demo** (403): `/api/calls/outbound` used `verifyOwnBusinessRole`, which rejects a superadmin
        previewing a tenant. Now takes `businessId` and checks it with `verifyAuthAndRole` (members still held to their own business).
        Outbound ElevenLabs calls were also never usable: they sent only a greeting (no tenant prompt, no conversation record, so tools
        and post-call could not find the business). New `placeElevenLabsOutboundCall()` sends the full per-call prompt + records the
        conversation; `buildOutboundCallContext()` tells the AI who it is calling and why (confirm / callback), voicemail-safe. Demo Studio's
        **Test call** uses the same helper. Agent tests `test_6401m3k2xr7ge19vkgrjxg87knxr` + `test_7401m3k2xrn9fmzst40stjbawyx8` 6/6.
        **Never placed on a real phone yet.**
  - [x] **"Confirm & notify" with no email** → **Confirm & call customer** (AI confirmation call); the review card's "Have the AI phone
        them to confirm" starts ticked when there is no email; the AI now offers an emailed confirmation once, right before booking.
        Review-card errors are shown instead of silently swallowed. Texting: NH-29.
  - [x] **Create Job opened an old job (J-1016)** — correct idempotent answer (that request already had J-1016 from 2026-09-25), silent
        UI. `from-request` now writes `jobId` onto the request; the card shows **Open Job J-…**; a created=false answer asks first.
  - [x] **Field photo: camera only** — removed `capture="environment"`; phones offer camera or library.
  - [x] Empty "Receptionist" bubbles (tool-call turns) hidden in Calls and the review transcript.
  - [x] Gates on the branch: tsc clean; vitest 1,432 passed; e2e:call 12/12; full Playwright 92 passed / 0 failed / 0 flaky.
        **Pushed 2026-09-28 as 9ca467c** (owner: "commit and push").
  - [x] **T-147 (owner's second round, 2026-09-28, branch `fix/demo-feedback-2-0928`):**
        (1) "Everything is 8:54" = the 2026-09-25 launch's seed; the current seed uses 9:00/11:00/1:30/3:00 on weekdays — relaunch.
        (2) Pipeline jumped back to a deep-linked card on every 10 s refresh/Confirm — now scrolls once and the outline fades after 4 s.
        (3) Field ＋ Finding: select-then-**Add N findings** (also on the office Findings tab), "Findings on this job" list under the
        button, sheet centred on desktop with a pinned footer, **← Back to job** on /company/field, dark page fills the window.
        (4) AI asks for a missing ZIP code (agent test `test_5301m3k9g53ke8pa0xqghpv8484a`: fails 2/2 on the first wording, 3/3 after);
        **Edit customer details** on the job (`PATCH /api/jobs/[jobId]/client`: job + customer + draft quote/invoice billTo, locked
        after the invoice is sent); quotes open "Thank you for reaching out to <Business>. As requested, we visited <address> and
        recommend the following work:" and default a short estimate disclaimer in Notes (industry-neutral).
        (5) Sent invoice: already kept — locked on the job's Invoice tab with Send again / Mark paid / Print-Save as PDF. No change.
        (7) Crew notes (voice or typed) now surface on the Dashboard as **Latest from the field** (`job.lastFieldUpdate`, written by
        writeJobProjection; no extra reads). Before this they were only inside each job.
  - [ ] **Owner, after the push:** relaunch Demo Studio (Roofing) — clears the Sep 25 test data and writes Mon–Fri 8–5; call and book;
        then Pipeline → **Confirm & call customer** on your booking and answer the AI's call. Integrator reads both transcripts.
- [~] Phase 30 — **Crews, the Calendar board and the Team page** (owner feedback, 2026-09-28, two rounds: "is there no way to edit a
      crew… anything I drag always goes to 9 AM… it won't let me drag to a cell where there are other jobs"; then "how does a user get
      assigned to a crew? why can't users be disabled from here?… if I am wondering, new users will absolutely wonder").
      **Built by the integrator 2026-09-28 (owner: "fix up the todos you can fix right now, no prompt") — T-148, T-149 (all but the
      Day view / job length / multi-day), T-150 incl. the Crew role (owner: yes), T-151 applied.** Open items are listed per task below. Benchmark is **Jobba** (Jobba Trade Technologies, roofing — its scheduler is called the Powerboard), not Jobber. Jobba's
      public pages describe the Powerboard only as color-coded, crew-workload-aware and map-based; the drag/time mechanics below are ours.
  - [x] **T-148 — Edit a crew and its members** (Library → Crews; `src/app/company/library/page.tsx` crews section, `src/app/api/company/crews/route.ts`).
        **DONE 2026-09-28:** `CrewsSection.tsx` (Edit, Active on/off, members with ＋ Add / × for owners, capacity line, safe Remove),
        crews PATCH whitelisted + validated, DELETE unschedules open jobs/frees bookings/clears members, `GET ?people=1`, team routes
        refuse a crewId that isn't this business's, assignment email to crew + every active member (own ledger entry each), foreman
        and every owner/staff/crew member can be on a crew. Tests: `crews/__tests__/editDelete.test.ts`, `assign/__tests__/route.test.ts`.
        Today a crew row offers only the color dot and Delete. Membership already exists but is hidden: it's `TeamMember.crewId` (one crew per
        person), set only from the Team page's per-person Crew dropdown, and only for technician/journeyman/apprentice/installer/helper —
        **a foreman cannot be put on a crew** (`FIELD_TRADES` in `src/app/company/team/page.tsx:12` leaves foreman out).
        **Owner decided 2026-09-28:** crew members are team members only (no login-less helpers — they'd get no field screen or time clock);
        the assignment email goes to the crew email **and** every member who has an email.
    - [x] **Edit** on each crew row: name, email, phone, color, Active on/off. Reuse the existing `PATCH /api/company/crews`, but whitelist its
          fields first — it currently writes whatever keys the body sends (`route.ts:54-67`: `active`, `createdAt`, anything). Trim; name required.
    - [x] **Members on the crew card**: list the people whose `crewId` is this crew (name + title), **＋ Add member** (pick from the team →
          sets their `crewId` through the existing `PATCH /api/company/team/[uid]`), and × to take someone off (clears `crewId`).
          Show the member count on the Calendar's crew label (e.g. "Tyler Crew · 3").
    - [x] **Assignment email to members:** `POST /api/jobs/[jobId]/assign` (confirm) sends to the crew email + each active member's email,
          one message each; the toast says who got it ("Emailed Tyler Crew + 3 members").
    - [x] **Delete is unsafe today** — hard delete with no checks (`route.ts:71-84`). A job scheduled on a deleted crew keeps its
          `assignedCrewId` + `scheduledStart`, so it is neither in Unscheduled (`CalendarBoard.tsx:243`) nor in any crew row: it disappears from
          the Calendar. Members keep a dangling `crewId`. Fix: if the crew has upcoming jobs/bookings, ask "Move its N jobs back to Unscheduled?"
          and do that in the same request; clear members' `crewId`; prefer **Deactivate** (keeps history) over Delete. Confirm the vanish bug
          on the smoke harness first.
    - [x] One plain line on the Crews tab: the phone AI takes as many bookings at the same time as there are **active** crews (G1 capacity
          model) — deactivating a crew lowers that.
    - [x] Gate: vitest for the crews route (PATCH whitelist, delete moves jobs back) + one Playwright spec (edit a crew, add/remove a member),
          phone screenshot read.
  - [x] **T-149 — The Calendar: pick a time on drop, a distinct Bookings row, clearer buttons** (`src/app/company/calendar/CalendarBoard.tsx`).
        **DONE 2026-09-28:** time-slot popup on drop (bottom sheet on a phone) from `GET /api/company/crews/open-times`, next-opening
        button, 🕒 Change time on unconfirmed tiles, Phone bookings row restyled (+ "→ J-…" when a job was made from it), "✓ Confirm +
        email crew", Unscheduled explained, jobs whose crew is gone/inactive show in Unscheduled, from-request keeps the booked time as
        `requestedStart/End` (a hint only — capacity untouched), the Calendar's own hours regex + its Settings fetch removed.
        **Not done:** estimated job length on create (the popup's length picker covers it for now), "Schedule now" on the New job
        form, the Day view, multi-day jobs. **H3 merge note:** H3 edited `dayAtBusinessOpen` in CalendarBoard.tsx, which main deleted —
        take main's side (no hours code left in that file).
        **Why it always lands at 9 AM:** a cell is a whole day, so a drop carries no time. `placeJob` (`:258-295`) always uses
        `dayAtBusinessOpen()` — the opening time from Settings → business hours — with a 1-hour default length.
        **Why an occupied cell refuses the drop:** because every drop proposes the same opening-hour slot, it overlaps the job already sitting
        there, and the assign route's overlap guard (`src/app/api/jobs/[jobId]/assign/route.ts:193-224`) correctly answers 409 "That crew is
        already assigned during this time"; the board rolls back. The guard is right; the proposed time is wrong.
    - [x] **Time-slot popup on drop (owner's ask):** dropping a job on a crew + day opens a small popup anchored to that cell — "Tyler Crew ·
          Tue Sep 29" — listing that crew's **open start times** that day (business hours minus its jobs and bookings, in 30-min steps) and a
          length picker (default: the job's estimated length, else 1 h). Pick a time → the tile lands there, still grey/unconfirmed as today.
          Cancel or click away → nothing moves. No open time that day → say so and offer the crew's next open day. Moving an already-placed
          tile to another cell opens the same popup, preselecting its current time when free. An unconfirmed tile gets **Change time**
          (same popup, no drag needed). Works by tap on a 375 px phone.
    - [x] Open times come from the server, not a second client-side calculation: a small GET (crew + day → open starts) built on
          `src/lib/scheduling/hours.ts` (`dayWindow`). The Calendar's own hours regex (`dayAtBusinessOpen`, `:107-117`) breaks the
          one-hours-parser rule — delete it. Fix the stale comment at `:120` ("Jobs … land at 8am").
    - [ ] **Job length:** jobs have no length today (`src/types/jobs.ts:146-148` holds only start/end), so every job is 1 hour. Add an
          optional estimated length on job create (default from the work catalog / service type when present).
    - [x] **Bookings row must not look like a crew row** — today it's the same row shape with light-blue chips. Give it a tinted band, a phone
          icon and the label "Phone bookings" with a small subtitle ("booked by your AI — not a crew"), chips styled as pills (no crew
          color, no Confirm + email crew button), and a thicker divider before the first crew.
    - [x] **"✓ Confirm + email" → "✓ Confirm + email crew"**; the tooltip names who gets it (crew email + members, per T-148). If the crew
          has no email and no members with one, the button says **Confirm** only.
    - [x] **Jobs made from a phone booking keep its time.** Today Pipeline → Create Job (`src/app/api/jobs/from-request/route.ts`) copies the
          customer, address, service and notes but **not** the booked time, so a job the AI booked for Tue 2 PM lands in Unscheduled while
          the booking still shows in the Bookings row — one visit, two cards. Fix: the job takes the booking's start/end and the booking
          stops showing separately; if no crew is set it opens the T-149 popup with that time preselected. Check how `isWindowFree`
          (`src/lib/tools/agentTools.ts`) counts it so the one visit isn't counted twice against the AI's capacity (booking-change gate
          applies if that file changes).
    - [x] **Say what Unscheduled means:** one line under the rail heading — "Jobs with no crew or time yet. Drag one onto a crew and day."
          (Jobs land there when made from Jobs → New job, Calendar → New job or ＋ Add, none of which ask for a time; the 8 in the demo are
          seed data.) Optional **Schedule now** on the New job form (crew + the same slot picker).
    - [ ] Later, optional: a Day view (crews as rows, 30-min columns, drag a tile's edge to change its length). Multi-day jobs (a roof
          replacement over 2–3 days) are a separate open question.
    - [x] Gate: one Playwright spec — drop into an occupied cell → popup → pick 11 AM → tile shows 11 AM; no open time → message; phone
          screenshot read. `e2e:call` only for the job-from-booking change; booking-scenarios only if `src/lib/scheduling/**` or
          `agentTools.ts` changes.
  - [x] **T-150 — Team page: crews, disabling and what each role means** (`src/app/company/team/page.tsx`).
        **DONE 2026-09-28 (owner: "yes, let's have a crew title" = the Crew role):** role `crew` (field-only: verifyFieldAccess +
        bootstrap, refused by every office route; the layout keeps it on /company/field; only where the industry has Jobs), Team page
        ⓘ help for Role + Title, capitalized roles, Crew column for every owner/staff/crew member, Lock → **Disable/Enable** (hidden on
        your own row and the last owner), Resend invite only before first sign-in. Harness account `fieldCrew`. Onboarding guide updated.
        **Not done:** server-side scoping of a Crew login to its own crew's jobs (today: any job of the business, same as a Staff
        technician or a QR link); does a Crew seat cost the same as an office seat? (owner decision, T-126 pricing).
    - [x] **Crew for everyone who works in the field:** the Crew column shows "—" unless the title is Technician/Journeyman/Apprentice/
          Installer/Helper (`FIELD_TRADES`, `:12`); both members in the owner's screenshot have "No title", so nothing tells them how. Show the
          Crew dropdown for every active owner/staff member (foreman included); T-148's ＋ Add member is the second way in.
    - [x] **"Lock" is already "disable" but doesn't say so** (`:164-166`: signs them out, blocks sign-in, frees the seat). Rename to
          **Disable** / **Enable**, status "Disabled", and the confirm text says the seat is freed. Hide it on your own row and on the last
          owner.
    - [x] **Resend invite** only for people who have never signed in (it shows today for members who signed in on Sep 16/27).
    - [x] **ⓘ next to Role and Title** (table header and invite form) with a short popover. Draft — check each line against the route gates
          before shipping, don't copy it from here:
          **Owner** — everything, plus Team and Settings. **Staff** — the office and the field: Pipeline, Calendar, jobs, quotes, invoices,
          field notes and photos. **Viewer** — can look, can't change anything or send field notes. **Title** — a label only; it doesn't change
          what someone can do. Field titles open on the Field screen after sign-in and can join a crew. **No account?** Crew members can use
          a job's QR code instead. Capitalize the role options (they show as raw "owner/staff/viewer").
    - [x] **Owner decision — a field-only role?** Today a crew member who sends field notes must be **Staff**, which also shows them the whole
          office, including prices and invoices (`verifyRole.ts:17`: title/crew "never gate anything"; field writes need owner/staff,
          `:544`). Option: a **Crew** role — Field screen, their crew's jobs, time clock, photos, notes; no Pipeline, prices or invoices.
          Recommendation: yes, before the first multi-crew client; it touches auth on every route, so it's its own task once decided. Also
          decide whether a Crew seat costs the same as an office seat.
    - [x] Gate: one Playwright spec (set a crew on a no-title member, Disable/Enable, ⓘ opens) + phone screenshot read.
  - [x] **T-151 — Right-size the gates (owner, 2026-09-28: "prompts are taking way longer… the gate checks need to not be so redundant").**
        **APPLIED 2026-09-28** to AGENTS.md "Definition of done" item 2 + "Browser and end-to-end testing" and CLAUDE.md's harness rule.
        Today one task can run: type-check + lint + full vitest (~1,430 tests) + build + a new e2e spec on the branch; booking scenarios; then
        after merge `e2e:call`, and full Playwright (~94 tests, 13–19 min) on the merged tree before push — much of it re-run on code that
        didn't change. Proposed tiers (owner approves, then update AGENTS.md "Definition of done" + "Browser and end-to-end testing", CLAUDE.md's
        smoke-harness rule, and the matching memory):
    - [x] **Worker, per task:** type-check + lint + `vitest related <changed files>` + the one e2e spec for the screen it changed (phone
          screenshot read). Booking scenarios only when the booking-change scope is touched (seconds). No build, no full Playwright.
    - [x] **Integrator, once per merge batch (not per task):** full vitest + build; `e2e:call` only if the batch touched calls/booking/
          pipeline/jobs/documents.
    - [x] **Before push:** full Playwright once, on the final tree. Never re-run a suite already green on the same commit — cite that run.
    - [x] Unchanged: a real phone call + transcript read after a booking change ships (unit tests missed the 2026-09-27 break).
- [ ] Phase 31 — **Call-flow fixes from the owner's 2026-09-28 test call** (spec, workflow table and causes: `docs/CALL-FLOW-FIX-PLAN.md`;
      prompts: `docs/WORKER_QUEUE.md` section **I**). Transcripts read first: inbound `conv_2201m3ma3sg5fn3rm8w721rpfb0d` (11:28 AM ET),
      outbound `conv_4701m3matcwsfba9ar1aw8w81z7p` (voicemail loop). Workflow: call recorded → Alice books an inspection → it is the
      lead (Pipeline "Booked") → auto-assigned inspector notified → inspector manages their time (blocks, My schedule, phone-calendar
      feed) → customer told by text/email. Split (owner's model rule): live call + booking engine = integrator; screens = Codex; plumbing = Deepseek.
  - [x] **T-152 (I1, Deepseek V4.1 Flash, Thinking: Hard)** — **MERGED to local main 2026-09-28 (`ba885e3`) after an integrator review against plan §3; follow-ups fixed in T-154 (bounded block query, force comment). Not pushed yet.** Contracts (Step 0, merged first), cleanCallerName + nextOpeningLabel,
        time-blocks API (+ open-times), texting module OFF until NH-29, inspector notifications (assigned/moved/reassigned/cancelled),
        confirm route (text → email, inspector_busy 409 + force), post-call callSummary, bootstrap smsEnabled.
  - [x] **T-153 (I2, Codex GPT-6 Sol medium) — MERGED to local main 2026-09-28 (`f74d6f7`, not pushed).** B5 (phone-calendar feed) was built by the integrator on a REDUCED exposure model instead of the spec's: the bearer link shows only time, "Inspection — Carla E.", the address and a sign-in link — no phone, notes, Access/URGENT or call summary (Codex rightly refused the original; widening it is an owner decision). Also fixed after review: a Crew-login inspector got no My schedule (crews GET refused Crew — now its own row only). — nav Dashboard → Calls → Pipeline; Pipeline Booked / Callbacks;
        Calls → "Booked · open in Pipeline"; "after hours" only when true; booking details everywhere; Inspector title + inspector rows
        + drag + blocks on the Calendar; "My schedule" + Block time on the Field screen; private .ics phone-calendar feed; "Tell them
        by: Text / Email / I'll call them".
  - [~] **T-154 (I0, integrator, Claude Opus 5.5) — status 2026-09-28:** DONE: ElevenLabs agent end_call + voicemail detection + 20 s silence
        timeout (LIVE; voicemail agent test 3/3); Twilio read-only check + NH-29 steps; live path built + merged locally (`a91b5e4`);
        H3 Part 1 + I1 merged; booking scenarios S1–S21; agent tests on the new prompt 15/15 new + saved suite green (the old G1
        "book at once" test is superseded by `test_7301m3mqbctze028b59ehf7cvsb0`, checklist first); full vitest 1,568 pass; next build pass.
        OWED: e2e:call, e2e:booking, full e2e:test → push → deploy check → create + attach the `addBookingNote` tool and
        `--update-tools` (textOk) → voicemail message with {{businessName}} → post-deploy agent tests → owner relaunches Demo
        Studio + the real call → transcript read. Owner chose (2026-09-28) to push these call fixes before I2.
        Original scope — ElevenLabs agent: end_call + voicemail detection + silence timeout; Twilio
        read-only check + NH-29 steps; the live path (prompt: escalation switch, booking checklist, after-booking rules; dispatcher:
        NOT ESCALATED, BOOKED wording, addBookingNote; engine: bookedAfterHours, capacity = inspectors, blocks busy, auto-assign +
        notify); merges H3 → Step 0 → I1 → live → I2; one full gate run; push; live tools; agent tests; the owner's real call.
  - [ ] Found while reading the transcripts (folded into the tasks above): (a) the gate code Alice "noted" was never saved;
        (b) every booking says "after hours" (pendingConfirmation is always true and was read as after hours); (c) "Es Carla
        Esnaida" → "Hi Es"; (d) voicemail detection off + no end_call → "Are you still there?" ×9; (e) **no texting code exists — no
        text was ever sent** (and carriers need NH-29 registration before one can be); (f) the "24-hour notice" rule contradicts
        same-day urgent booking (dropped); (g) phone-AI capacity counted work crews for inspections. Later: live call row during a
        call, inspector workload board, inbound text replies, per-client texting numbers, Google Calendar two-way sync.
  - [x] **T-155 (integrator, Claude Opus 5.5) — owner's follow-ups while I2 runs — committed on local main 2026-09-28, NOT pushed;
        not yet covered by e2e:call / full e2e:test (owner: comprehensive harness later).** (1) Call Back rang caller ID, not the
        number Carla SAID (305-389-4611 → booking kept +1 954 882 9586 → carrier "not available" recording → Alice talked into it):
        bookAppointment/createLead take `callbackPhone`, kept beside caller ID + a "Callback number:" notes line; Call Back, the
        follow-up cron (also no longer says "roofing inquiry" to every industry), confirm/booking texts and the inspector notice
        dial `contactPhone()`. **Live tools need `setup-elevenlabs-agent.mjs --update-tools` after the next deploy.** (2) A lead shows
        "<Job> created" + "Open Job J-…"; one call's lead + booking share one job (from-request reuses/stamps siblings by
        sourceCallId). (3) Time clock: Arrived at office / Arrived at job / Left J-… / Start lunch / Back from lunch / Done for the
        day (also straight from a site), one filled next-step button, inline "pick a job" hint, one-tap job switch, "Last tap" line.
        (4) Inspector comments on findings from the field screen (`JobFinding.note`, field-safe PATCH that also updates a DRAFT
        quote); printed on report/quote/invoice; editable in the office Findings + Quote panels. (5) A field-only login sees and
        blocks time on its OWN crew row (appointments + time-blocks APIs) so I2's "My schedule" works for an Inspector login.
        (6) Team page: one Type (Admin / Office staff / Inspector / Technician / View only) instead of Role + 10 Titles.
        **I2 merge note:** `src/app/company/team/page.tsx` conflicts on Codex's one added TitleHelp line — take main's side
        (TitleHelp is gone); team.ts/landing.ts inspector hunks are identical on both sides.
        **Owner decisions open:** Inspector = field-only (no prices; the office prices the quote from their findings) — flip to
        Office staff per person if an inspector should also quote. Technician = field-only too.
  - [x] **T-156 (integrator) — owner's harness + UX pass, 2026-09-28 evening.** Feedback: every user (and the superadmin
        previewing a client) sees it, pinned in view at laptop height; email "[Feedback · <category>] <company> — …" with
        sender/type/page, reply-to the sender; Crew logins allowed. Calendar: drops land on the aimed day (pointer collision +
        edge-only auto-scroll — a Wednesday drop landed on Thursday). Customers is one screen (Library tab removed). Calls
        paged 25 at a time. Dashboard "Agent Setup" panel removed (header pill opens Settings). Team: never crashes on an
        odd role, superadmin hidden + not a seat, cards on a phone; sidebar badge shows the user type. Documents format the
        customer phone. Test text to +1 825 488 7791 DELIVERED (Canadian number — US numbers still need NH-29).
        **PUSHED + DEPLOYED 2026-09-28 ~7 PM PT** (crm.luxordev.com Ready, health ok). Gates on the final tree: vitest 1,596
        (+2 known load-flakes green alone), next build ok, e2e:call 12/12, e2e:booking 7/7, Playwright: full run 110 passed then
        the failures fixed + re-run (desktop 57/57 + smoke 34/34, phone 62/62). Live ElevenLabs: bookAppointment/createLead/
        escalateCall schemas updated, addBookingNote created + attached (8 tools). Agent tests WITH the live per-call prompt
        (fetched from the prod initiation webhook, no writes): 13/15; the 2 fails are date-bound tests (expect preferredDate
        2026-09-28 for "Monday" — written on Sunday) → re-author them with an LLM date check. Outbound tests (confirm/voicemail)
        need the outbound prompt section as their override — not re-run. NOTE for agent tests: the override must carry the
        agent's whole prompt block (tool_ids, built_in_tools) or every tool test fails "no tool called".
        **Still open:** the Calendar shows each phone booking twice (left list + "Phone bookings" row) — keep one;
        the crew time picker lists 12:00 AM first for a round-the-clock tenant (fine for 24/7, odd for others).
- [ ] Phase 27 — "No training needed": the workflow is the tutorial (owner-directed, 2026-09-27)
      The main sales claim (see the one-pager) is that nobody needs training — the competitor charged $10–15K setup plus two days of training and weekly
      training for a year. Spec: **`docs/NO-TRAINING-UX-PLAN.md`** (rules, per-screen empty-state copy, prerequisite chains, test rig). Prompts:
      `docs/WORKER_QUEUE.md` section **F**. Run T-144 then T-145 (same pages); F3 (T-130 code) can run in parallel with either.
  - [x] **T-144 — Empty states + first-run setup** (Codex, GPT-5.5 Terra medium, `air-wt-empty-states` / `task/empty-states`) — **MERGED + pushed + deployed 2026-09-27** (`ea80f54`, `crm.luxordev.com`).
        Worker did steps 1–6 partially (to `fd3346c`); the integrator finished H0 (`e1784dc`…`18a45d7`: Job tabs, Calendar/Jobs/Pipeline cases, setup-status
        data-source fixes, one-primary fixes, viewer gating, full spec) — details + gate evidence in `docs/IMPLEMENTATION_LOG.md`. Full Playwright 92 passed/0 failed,
        e2e:call 12/12, vitest 1343, build green. Leftovers handed to T-145 are listed at the end of that log entry. The re-test on merged main also
        caught a pre-existing bug: the Library page failed to load for every viewer (work-catalog GET refused viewers) — fixed `2ca5aa0`. Shared `EmptyState`, `BlockedAction`
        gains `href`, pure `setupChecklist()` + `GET /api/company/setup-status`, a Dashboard "Get your business ready" checklist (owner/superadmin) replacing the
        "take the Guide tour" nudge, every empty list/tab on the plan's inventory, a new empty `e2e-empty` harness tenant + `e2e/empty-states.spec.ts`.
  - [ ] **T-145 — Page-by-page roofing UX pass** — **STALLED 2026-09-28 after the "before" screenshots (`bf9c977` on `task/setup-ux`, not merged); re-queue after T-153** → was **WORKER_QUEUE H3 Part 2** (Codex, GPT-6 Sol medium, `air-wt-setup-ux`, after T-144 and G1 merge; G2 is H3 Part 1 — booking comes first). Golden-path
        walk as owner/staff/crew/viewer at 375 + 1280 px → `docs/UX-PASS-FINDINGS.md`; one primary button per screen (+ an automated `KNOWN_MULTI_PRIMARY` guard);
        prerequisite guards as inline `BlockedAction`, never hover tooltips (seat-limit copy, missing customer email, "no price on file" tooltip, crew-less assign);
        Pipeline card down to two buttons; Dashboard Agent Setup panel demoted; Guide rewritten to "How it works — 5 steps" + "Talk to us".
  - [ ] **T-146 — Superadmin cost & billing panel** (prompt later; GPT-6 Sol medium — money). One compact, scannable Admin table: company · industry · plan ·
        monthly charge · estimated cost this month (ElevenLabs minutes from call durations + a per-field-update estimate for OpenAI/DeepSeek until real token
        logging exists) · margin · seats used/limit · payment status (current / reminder sent / restricted) · phone line. Row tint when cost > charge or overdue.
        Today `/admin/usage` shows only call/lead/appointment counts. Pairs with T-126's automation (reminders day 1/7, restrict day 10–15).
  - [ ] NEEDS-HUMAN: approve (or change) the proposed tiers + setup fee in T-126; optional support phone number for the Guide's "Talk to us" box.

- [x] Phase 10 — Client Management (owner-added, 2026-09-07) — 2/2
  - [x] T-079 — Superadmin client management: fast client creation, seat-capped team invites (+ CSV), recurring
        Luxor billing with a dashboard-only pause (owner: "add a really smooth way for me set up new clients,
        like a new client tab where I click + client account... they get one license, and they can +users
        manually... or they can upload a csv... I can set them up on a monthly recurring invoice, and I can
        pause their subscription for non payment... superadmin of a company can only see their company"). Almost
        entirely linking/extending existing plumbing rather than new subsystems — see the approved plan for the
        full design. Confirmed with owner up front: pausing a subscription locks the client's web dashboard
        only, never the phone agent (Vapi/agentTools untouched).
        **New:** `+ Client` quick-create modal (`admin/businesses/NewClientModal.tsx`) posting to the existing
        `POST /api/admin/businesses`, now also accepting `address`/`employeeCount`/`seatLimit`; a new
        `subscriptionStatus`/`pausedAt`/`pausedReason`/`billing{planName,monthlyAmount,billingDayOfMonth,
        nextInvoiceDate,autoInvoice}` shape on `BusinessConfig`; a superadmin-gated pause/resume endpoint
        (`FieldValue.delete()` used for pausedAt/pausedReason on resume — plain `undefined` would've been
        silently stripped by the Admin SDK's `ignoreUndefinedProperties`, not cleared); a shared
        `inviteTeamMember()` helper (`src/lib/team/invite.ts`) extracted from `POST /api/company/team` so a new
        CSV bulk-invite endpoint (`POST /api/company/team/bulk`, capped 200 rows) reuses the identical
        find-or-create-Auth-user/email-invite logic instead of duplicating it; seat-limit enforcement (default
        5, uniform for owner and superadmin alike — raising it is one Config-page field, not a bypass); a
        dependency-free CSV `email,role` parser + preview/results UI added to the existing `TeamPanel.tsx`
        (mounted a second time, unmodified, directly on the admin Config page — zero new backend code needed
        since its API routes already accepted the `superadmin` role); a paused-dashboard gate reusing
        `useBusinessModules()`'s existing single Firestore read (industry + subscriptionStatus cached together
        now) and `company/layout.tsx`'s existing `blockedModule` short-circuit pattern — superadmin (incl.
        `?preview=`) always bypasses; `LuxorInvoice` gained an optional `businessId` link, `/admin/invoices`
        prefills from a `?businessId=` deep link (wrapped in `Suspense` per Next's `useSearchParams` requirement
        — `admin/layout.tsx` has no ancestor Suspense boundary, unlike `/company/*`); a shared
        `nextLuxorInvoiceNumber()` helper (`src/lib/billing/invoiceNumber.ts`) extracted so a new daily
        `/api/cron/recurring-invoices` cron and the existing manual invoice POST draw from one counter; the
        cron **drafts only, never auto-sends** (owner still reviews and clicks Send) and only acts on clients
        with `billing.autoInvoice` explicitly on.
        Verified: `tsc` clean; lint 0 errors/21 warnings (unchanged baseline); `vitest run` 442/442 (up from
        428 — 14 new tests: seat-limit rejection + fallback-to-default, CSV bulk-import per-row outcomes
        including the seat-limit-mid-batch case, the pause/resume route's audit-event + `FieldValue.delete()`
        semantics, `nextLuxorInvoiceNumber` monotonicity, and `useBusinessModules`'s new `subscriptionStatus`
        resolution/caching — including a fix for a pre-existing test that seeded the old bare-string cache
        format, now migrated to the new `{industry, subscriptionStatus}` JSON shape with a dedicated
        legacy-cache fallback test added); `next build` green, all new routes present in the route table.
        `public/guides/onboarding-guide.html` updated in the same pass (fast-path callout before Phase 1, CSV/
        seat-limit notes in Phase 4, a new "Phase 6 — Ongoing Account Management" section, two new
        troubleshooting rows, version bumped to 2.4) — the resolved NH-6 note above already confirms Vercel
        allows 100 cron jobs/project with only a once-daily frequency cap on Hobby, so the new cron needed no
        further capacity check. **Pushed and live** (2026-09-07, combined with T-055 in one commit `472d14f`,
        owner said "commit and push to github") — production re-verified post-deploy: `/api/health` →
        `200`/`"connected"` with all six capabilities `configured`, unauthenticated webhook `POST` → `401`.
  - [x] T-080 — Stripe payment links for Luxor's own billing, + a Twilio Canadian-number/porting runbook.
        Owner asked three things in one message: (1) had Canadian Twilio+Vapi steps been written (no — T-054
        was never picked, see T-055's note above); (2) how does anyone actually pay anyone in this app
        (nowhere — zero payment code existed before this task, every invoice was generate → email → someone
        marks it paid by hand once money shows up through some outside channel); (3) Stripe or something
        easier. Presented options; owner picked "docs-only for Twilio" (no Twilio account yet) and "Stripe
        Payment Links for our own billing" (not full webhook integration, not client-customer collection).
        **Stripe:** added the `stripe` npm SDK (`^22.6.1`) and a `stripe` capability to
        `src/lib/config/env.ts`'s existing `CAPABILITIES` map (shows up in `/api/health` automatically, same
        pattern as `resend`/`vapi`/etc.). New `src/lib/billing/stripePayments.ts`:
        `createInvoiceCheckoutLink()` builds a one-time Stripe Checkout Session from an invoice's line items —
        card/Apple Pay/Google Pay all render on Stripe's hosted page with zero extra config. Each line item
        collapses to `quantity: 1` with `unit_amount` = that item's own pre-computed `total` in cents,
        deliberately never re-deriving `quantity × unitPrice` for Stripe's own `quantity` field, because this
        app's line items can carry fractional quantities (e.g. "3.5 labor hours") and Stripe's Checkout
        `quantity` must be a positive integer — passing a fractional value through would either throw or
        silently misbill. Tax (already computed and stored on the invoice) is appended as its own line so the
        Checkout total matches the invoice total exactly. New superadmin-gated
        `POST /api/admin/invoices/[invoiceId]/pay-link` creates-or-returns the link and persists
        `stripePaymentUrl`/`stripeCheckoutSessionId` on the invoice doc (new optional `LuxorInvoice` fields) so
        reopening an invoice never spawns a second, orphaned Checkout Session for the same one. `/admin/invoices`
        gained a "Generate payment link" button + a copyable link display (on-screen and on the printed/PDF
        invoice); the send-email route now renders a "Pay now →" button whenever `stripePaymentUrl` is set. Two
        new public (no-auth) pages, `/pay/success` and `/pay/cancelled`, are Stripe Checkout's `success_url`/
        `cancel_url` targets — the payer is a client, not a portal user, so these can't live behind
        `verifySuperadmin`. **Deliberately no webhook** — marking an invoice paid is still a manual click after
        confirming the money landed in the real Stripe dashboard, matching the scope the owner actually picked
        (full auto-mark-paid via webhook is a clearly separate, larger follow-up if ever wanted).
        **Twilio runbook:** `public/guides/onboarding-guide.html` gained an "Option C" under Phase 2 (Canadian
        numbers, or porting a client's existing number in as the primary line instead of just forwarding to it
        — both go through the same Twilio-buy/port → Vapi-BYON-import mechanism) plus a full account-setup
        walkthrough (signup, payment method, buy-or-port, scoped API key, Vapi import). Explicitly marked as a
        manual runbook, not an in-app button — that's still T-054, unblocked once a real Twilio account and API
        key exist to wire in. Also documented the new payment-link button in the guide's Phase 6 section, and
        bumped the guide to v2.5.
        Verified: `tsc` clean; lint 0 errors/21 warnings (unchanged baseline); `vitest run` 462/462 (up from
        450 — 12 new: `createInvoiceCheckoutLink()`'s unconfigured/no-billable-items/fractional-quantity-
        collapse/tax-line/zero-tax/filter-zero-rows/Stripe-failure cases, the `pay-link` route's auth gate +
        already-generated-link short-circuit + persistence + 503-unconfigured + 502-failed paths, plus fixing
        one pre-existing `env.test.ts` case that asserted every capability reports `configured` and needed the
        new `STRIPE_SECRET_KEY` stub added alongside the existing ones — caught by CI-equivalent local
        verification, not missed); `next build` green, `/api/admin/invoices/[invoiceId]/pay-link`, `/pay/success`,
        `/pay/cancelled` all present in the route table. Smoke-tested locally: `/api/health` correctly reports
        a 7th `stripe: "not_configured"` capability, both `/pay/*` pages render 200 with the invoice id
        interpolated, and the pay-link route correctly 401s unauthenticated — no runtime errors in the dev
        server console.

- [ ] Phase 11 — Pre-Demo Polish (owner-added, 2026-09-08) — 6/7
      Found during a full end-to-end trace of the roofing demo→job→invoice pipeline and the
      onboarding→team-invite flow, requested ahead of a demo the following week (see the 2026-09-08 entry in
      "Current snapshot" above for the full audit — everything traced was confirmed connected and
      code-correct; these are gaps/polish, not fixes to something broken). None block the demo as-is.
  - [ ] T-081 — Set `STRIPE_SECRET_KEY` in Vercel so T-080's already-deployed payment-link button actually
        works (`/api/health` currently reports `stripe: "not_configured"` in production). Env-var entry only,
        needs the owner's Stripe dashboard access — not self-executable.
  - [x] T-082 — Corrected onboarding wizard and go-live guide copy: `business.active` does not gate the
        live Vapi line; calls can route once Vapi assistant/phone IDs are attached. Whether to add an
        `active` check to `resolveBusinessId()` is an owner decision (NH-19); changing it could silently drop
        calls on an existing live line. No routing logic changed.
  - [x] T-083 — Add a "Create Job" (or "Book appointment") shortcut on the Leads side of Pipeline, matching the
        one Appointments already has, for a lead that needs to become work without ever going through a
        formal booked appointment. **Done 2026-09-23 (Worker D, branch `task/pipeline-links`, commit
        `48fe6f3`)** — Lead Detail gained `Create <vocab.jobNoun>` reusing the appointments' single prefill
        handshake (`src/lib/pipeline/jobPrefill.ts`), gated on `ready && isEnabled("jobs")` (jobs-disabled
        tenants show no dead button; the appointments tab's own ungated hardcoded button was gated/labeled
        the same way). No "Book appointment" variant was built — no staff-facing appointment-booking flow
        exists (T-076), so such a button would itself be a dead button. Status → `review`.
  - [x] T-084 — Link a call's transcript page forward to the lead/appointment it produced (Pipeline already
        supports the `?lead=`/`?appt=` deep-link — Calendar's "Bookings" strip already uses it in the other
        direction). **Done 2026-09-23 (Worker D, branch `task/pipeline-links`, commit `d0bcdcc`)** — Calls
        page resolves the selected call against leads/appointments by `sourceCallId`
        (`src/lib/pipeline/callLinks.ts`, no API change — both list routes already return the field) and
        renders "View lead"/"View appointment" deep links; Pipeline gained the matching `?lead=` scroll-to-card
        anchor (it previously selected the lead but never scrolled/highlighted it). Status → `review`.
  - [x] T-085 — Clarified in the Job Invoice tab and onboarding guide that tenants can email job
        invoices to their customers without online payment; Stripe Payment Links in `/admin/invoices`
        are only for Luxor billing tenants. Invoice totals, persistence, and letterhead unchanged.
  - [x] T-086 — obsolete — route revived by T-092, has callers. Job detail uses GET to hydrate
        saved invoices, POST to generate/regenerate (`force: true`) idempotently, and PATCH to autosave
        draft edits. Kept `POST /api/jobs/[jobId]/invoice`; nothing deleted.
  - [x] T-087 — Self-led demo link + QR (done 2026-09-08, two-part). **Part 1:** `/try/[vertical]` — a
        public, no-login, statically-generated (`generateStaticParams`, all 11 verticals prerendered at build
        time, zero Firestore reads) landing page: tap-to-call CTA for the live demo number, 3 suggested things
        to say drawn from the vertical template's own FAQ/service data, a short value-prop list. Falls back to
        a "request a walkthrough" mailto for verticals with no phone number yet. Demo Studio (`/hub/demo`)
        gained a matching "Self-led link" panel (its own QR + copy-link button) so the owner can grab this for
        any vertical without asking again. Extracted the roofing-only phone map out of a local const in
        `hub/demo/page.tsx` into a shared `DEMO_LINE_PHONE` export in `templates.ts` so the two surfaces can't
        drift.
        **Part 2, same day — owner pushed back that Part 1 alone was incomplete** ("the call gets logged into a
        pipeline and materials invoicing and calendar are never shown... the demo should be the app in a
        sandbox so they can see the flow, the real app"). Correct: Part 1 only covered the phone call, not what
        it produces. Added a **"See it in the real app →" sandbox entry point**, not a mockup — the actual
        `/company/*` portal (Pipeline, Calendar, Jobs incl. materials/labor/timeline/photos/the client-side
        invoice generator, Library), reached without a password. Mechanism: `POST /api/demo/sandbox-token`
        (public, rate-limited, hardcoded to the allowlisted `demo-roofing`/`isDemo:true` business only — can
        never be pointed at a real tenant) finds-or-creates one shared Firebase Auth identity
        (`sandbox-visitor@luxordev.com`) and upserts its `businessUsers` doc to `role: "viewer"`, then mints a
        Firebase custom token via the Admin SDK. The button on `/try/[vertical]` signs in with that token
        (`signInWithCustomToken`, session-only persistence so it doesn't linger on the prospect's own device),
        pre-sets the same `__session` marker cookie `login/page.tsx` does (avoids a middleware race on the
        client-side nav that follows), and lands on `/company/dashboard`. No new permission model was built —
        "viewer" already exists and was already correctly read-only everywhere that matters: every mutating API
        route already excludes it (`jobs/route.ts`, `company/team/*`, invoice send, etc. all gate to
        `["owner","staff","superadmin"]`), and `firestore.rules`' `isBusinessOwnerOrStaff()` — what every direct
        client-side Firestore write in the company UI depends on — excludes it too, so a sandbox visitor can
        read everything a real viewer teammate could and write nothing, on both write paths the app has. Added
        a persistent amber banner ("You're exploring a live product demo... booking, editing, and sending are
        turned off" + "← Exit demo") in `company/layout.tsx`, gated on a new `isSandboxVisitor` flag (not on
        `role === "viewer"` — a real client's invited viewer teammate must never see demo messaging; the flag
        is set only by this one route and threaded through `AuthContext`'s existing profile spread).
        Verified: `tsc` clean; lint 0 errors/22 warnings (one new pre-existing-pattern `<img>` warning for the
        added QR image, matching the file's existing one); 5 new tests in
        `api/demo/sandbox-token/__tests__/route.test.ts` (the `isDemo` allowlist guard rejecting both a missing
        business and a real/non-demo one, create-vs-reuse of the shared Auth user, the businessUsers upsert
        shape, and rate-limiting) — `vitest run` 467/467 (up from 462, all new, zero flakes); `next build`
        green, `/api/demo/sandbox-token` and `/try/[vertical]` both present in the route table. **Pushed and
        live** (2026-09-08) — production re-verified: `/try/roofing` 200 with the correct `tel:` link,
        `/try/hvac` 200 with the mailto fallback, `/api/health` unaffected.
        **Known operational caveat, stated plainly (not new — same one T-087's Part 1 already flagged for the
        phone number, now also true for the sandbox):** `demo-roofing` is the one shared live business. Both
        the phone persona and the sandbox's Pipeline/Calendar/Jobs data reflect whatever vertical Demo Studio
        last launched. Re-launch Roofing there before sending this link out again if it may have been used to
        demo a different industry in between.

        **Part 3, same day — owner asked to confirm voice field-logging (materials/crew hours → invoice) is
        something a sandbox visitor can actually try, not just view.** Investigated before building anything:
        `verifyFieldAccess()` — the guard already used by every field-logging route
        (`jobs/[jobId]/updates` POST, `field-audio` POST, `photos` POST) — has always accepted **any** session
        role on the business, including "viewer" ("Path 1: session (staff/owner/viewer of this business, or
        superadmin)"), unlike the stricter office-mutation routes. So a sandbox visitor could already submit a
        voice/typed field update, upload a photo, and see it flow into materials/labor/the invoice — this
        needed no backend change at all. Confirmed live against production (not just read): entered the
        sandbox, opened `/company/field`, and posted a real update to job J-1001 via its exact API contract
        ("Used 6 bundles of shingles today, Marco worked 8am to 3pm, found a cracked vent") — DeepSeek parsed
        it correctly (materials, labor with auto-computed hours, an issue), the job's Materials/Labor/Issues
        tab counts updated live, and **Generate Invoice** picked up Marco's 7 hours and the shingles line item
        in the draft. The actual gap was discoverability, not capability: nothing on `/try/[vertical]` or the
        sandbox banner told a visitor Field existed or that it was real, and the banner's "editing... turned
        off" wording was actively wrong for this one path. Fixed both: the sandbox CTA copy on `/try/[vertical]`
        now names Field explicitly with a concrete example line to try speaking; the banner now links straight
        to `/company/field` and says "log a voice update — it's real" instead of the inaccurate blanket
        "editing... turned off." Verified: `tsc` clean; lint unchanged (0 errors/22 warnings); `vitest run`
        467/467 (no new tests needed — no backend logic changed, only page copy and the banner's JSX); `next
        build` green. **Housekeeping note for whoever demos next:** the live verification pass above wrote one
        real field-update entry onto job J-1001 in `demo-roofing` (a small real invoice line, not fake/broken
        data, but not something to explain mid-pitch either) — hit **Reset demo** in Demo Studio before the
        real meeting to start from clean seeded data.

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

**2026-08-27 — Phase 7 added (QoL & Multi-Vertical Expansion), identify-only, nothing executed:** owner asked
for a broad quality-of-life audit — split the demo/onboarding suite onto a dedicated hub/URL, tailor the
client-facing look per industry (a few visual families, not 10 one-offs), make AI-assisted document generation
consistent, make Vapi phone-agent setup clear to the admin (incl. a client talk-track), and research whether
newer AI receptionist voice models exist and whether Canadian phone numbers are reachable — explicitly
**identify and answer only, no execution**. Findings were published as an Artifact and turned into 8 candidate
tasks, T-053–T-060, added to `MASTER_PLAN.md`'s new Phase 7 with full specs (Objective/Evidence/Spec/Deps/
Owns/Constraints/Edge cases/Security/Acceptance/Tests/Rollback/Prohibited scope, same template as every prior
phase). **Direct answers, for the record:** (1) newer voice models exist and don't require leaving Vapi —
Vapi's own "Voices v2" catalog and OpenAI's GPT Realtime (native speech-to-speech) are both live in Vapi's
dashboard now, same order-of-magnitude cost as the current ~$0.09/min Cartesia/GPT-4o-mini/Deepgram stack; (2)
Canadian numbers are reachable via import (buy from Twilio/Telnyx, import into Vapi as bring-your-own-number) —
Vapi's own free numbers are US-only — and it would be a Canadian-area-code VoIP number, not a literal cellular
SIM, same as the current US number today. Notable findings baked into the new tasks: `BusinessConfig.agentVoice`
is a dead field (set by two inconsistent form controls, read by nothing that talks to Vapi — T-053); there is
zero in-app Vapi provisioning today, every tenant's assistant/number ID is hand-copied from the Vapi dashboard
(T-054); per-vertical `color`/`icon` in `templates.ts` only render in the admin Demo Studio card, never in a
tenant's actual `/company/*` portal, which is uniformly teal regardless of industry (T-056); three Twilio type
fields in `src/types/index.ts` are always-false/unused leftovers from the pre-Vapi era (T-059).
**Phase 7 is queued — no task assigned, no code touched this session, nothing pushed.** Owner reviews the
artifact and this phase's specs, then prioritizes before any task starts (same posture Phase 6 held before
2026-07-23). See `docs/SESSION_HANDOFF.md` for the artifact link and `HANDOFF.md`'s matching session entry.

**2026-09-01 — Phase 8 added (Hardening & Discoverability), identify-only, nothing executed:** while
investigating the "no greeting" bug this session (root cause: production Vapi webhook auth was failing 401 on
every call — see NH-1/HANDOFF), a live evidence pass turned up six further gaps, scoped as T-061–T-066 in
`MASTER_PLAN.md`'s new Phase 8: CSP shipping Report-Only with real (logged, unblocked) font-loading violations
on `/login` (T-061); 21 `npm audit` findings (17 moderate, 4 high, all transitive through `firebase-admin`) with
no CI step catching new ones (T-062); zero rate limiting anywhere in `src/`, including on the genuinely public
`/api/webhooks/vapi` and `/api/field/exchange` routes (T-063); inconsistent use of Vercel's "Sensitive" env-var
flag — `VAPI_API_KEY`/`VAPI_WEBHOOK_SECRET` are protected, `OPENAI_API_KEY` pulled back in plaintext during the
same `vercel env pull` (T-064); no alerting on the exact failure mode that caused this session's bug — the 401
storm was found only by manually running `vercel logs`, not by anything automated (T-065). The owner also asked
for hover tooltips/guidance on ambiguous controls, done sparingly — scoped as T-066 (no `Tooltip` component
exists in the repo today). **Phase 8 is queued — no task assigned, no code touched, nothing pushed.** Owner
prioritizes before any task starts, same posture as Phase 6/7.

**2026-09-01, same session — Phase 8 extended with a performance pass + one merge:** owner asked "anything we
can do to make each screen load ultra fast, no lag" and to reorganize the backlog for overlaps. Live evidence
turned up three more gaps, added as **T-067–T-069**: **all 26 pages under `src/app` are client-rendered**, and
`AuthContext.tsx` gates every page behind two sequential network round-trips (ID-token refresh + a Firestore
`businessUsers` read) before anything renders, on every load (T-067); **zero `next/dynamic` code-splitting
exists anywhere**, so `/company/calendar` ships 276kB First Load JS against a 102kB shared baseline — the
heaviest page in the app (T-068); **zero `next/image` usage** — every image, including the brand logo, is a
plain `<img>` tag (T-069). One genuine merge found rather than a new task: T-061's CSP-enforcement fix (Google
Fonts violates the `'self'`-only policy) and the performance ask solve the same root cause — switching to
`next/font/google` self-hosts the font, closing the CSP gap *and* removing an external render-blocking request
from every page — so that font migration is now one task, not two. `MASTER_PLAN.md`'s Phase 8 intro also gained
a **suggested execution order** (quick/independent wins first, the riskiest dependency migration last) since the
phase grew from 6 tasks to 9. No other true duplicates found across Phase 7/8's now-15 combined tasks — the
rest cover genuinely distinct surfaces (voice models, provisioning, visual families, security, discoverability,
speed) and stay separate by design. Nothing assigned or executed.

**2026-09-02 — T-053, T-059, T-066, T-068 self-selected and completed (owner: "pick the next few tasks you can
do on your own and do them now"):** four low-risk, fully-scoped tasks picked from the Phase 7/8 backlog —
explicitly skipped T-054/055/056/058/060 (need real product decisions or carry real cost/risk: buying numbers,
new domains, a PDF library choice, touching the live demo assistant again) and T-061-065/067/069 (good
candidates, deferred to keep this batch focused). All four: `tsc`/lint/full test suite/`next build` green;
the one `example-lib.test.ts` failure each run is the pre-existing documented concurrent-load flake, reconfirmed
clean in isolation every time.

- **T-053** (remove, not wire — the simpler of the spec's two allowed outcomes; wiring means designing a real
  voice-picker UI, T-054's territory): removed the two mutually-inconsistent `agentVoice` form controls
  (onboarding wizard's `alice/woman/man` dropdown, config page's freeform text box), the `BusinessConfig.agentVoice`
  field, both API routes' persistence of it, and the seed script's stale value. Left `PlanPreset.agentVoice`
  (planPresets.ts) untouched — a distinct, unrelated field driving plan-tier comparison-table copy, out of this
  task's owned scope. `onboarding-stepper.test.ts`'s payload-contract test updated (not just relaxed) to drop
  `"voice"` from the expected field list and gained a companion "does not reintroduce" regression test.
- **T-059**: removed `twilioPhoneNumber`/`twilioConfigured`/the `"twilio"` union member (`src/types/index.ts` +
  both API routes hardcoding `twilioConfigured: false`) after a repo-wide grep confirmed zero other references.
  Archived `DEMO-STUDIO-PLAN.md`/`EPIC-PLAN.md`/`PERFORMANCE-CLEANUP.md` to `docs/archive/` via `git mv`
  (history preserved), fixed the resulting dangling links in `docs/README.md` and `CLAUDE.md`'s Key Files list,
  and trimmed `CLAUDE.md`'s `Status:` paragraph to a pointer at `TODO.md`/`docs/SESSION_HANDOFF.md` — the
  Design-system rule sentence immediately after it was preserved verbatim, not touched.
- **T-068**: split `company/calendar/page.tsx` into a thin route wrapper + `CalendarBoard.tsx` (all existing
  logic moved verbatim via `git mv`, zero behavior change) and lazy-loaded the board via `next/dynamic` with
  `ssr: false` and the existing `PageSkeleton` as the loading state. Measured, not assumed: `/company/calendar`'s
  First Load JS dropped from **276kB to 104kB** in `next build`'s own output — the dnd-kit dependency chain now
  loads only once the board actually mounts.
- **T-066**: new `src/components/ui/Tooltip.tsx` — hover/keyboard-focus trigger with a 500ms show delay and
  instant hide, `aria-describedby` injected onto the actual trigger element via `cloneElement` (not just a
  floating styled div), suppressed entirely on touch/no-hover devices via `@media (hover: none)` in
  `globals.css` rather than JS device-sniffing, and respects `prefers-reduced-motion`. Applied to a reviewed,
  bounded list only (not a sweep): the company sidebar's mobile-shortcut icons + hamburger toggle, the
  Calendar's Previous/Next-week chevron buttons, and Library's four icon-only "Remove" (Trash2) buttons —
  replacing their native `title=` attributes (removed to avoid a double-tooltip) with the new component.
  Deliberately left the Calendar's drag-handle grip icons alone — those tiles already carry a visible
  `title="Drag onto a crew + day"` and visible job/customer text, so a second tooltip would be redundant, not
  helpful, matching the spec's own "guideline, not a mandate" framing.
  **Infrastructure note:** this is the first component/DOM test in the repo (everything else is logic/route-level,
  `environment: "node"`) — added `@testing-library/react`/`@testing-library/jest-dom`/`jsdom` as dev
  dependencies, scoped to jsdom via a per-file `// @vitest-environment jsdom` pragma rather than changing the
  global environment, so the other 308 tests are provably unaffected (full suite re-run green after). Also
  needed one `vitest.config.ts` addition (`oxc: { jsx: { runtime: "automatic" } }`) since this Vite version's
  default oxc transform reads `tsconfig.json`'s `"jsx": "preserve"` (correct for Next's own SWC build) and
  can't parse `.tsx` test files without an explicit override — test-pipeline-only, doesn't touch `next build`/
  `tsc`. Six test cases cover show-after-delay, focus parity, instant hide on mouse-leave/blur, a
  cancelled-before-delay case, and the `aria-describedby` wiring. One tradeoff surfaced honestly: `npm audit`
  (including devDependencies) rose from 21 to 23 findings (17→17 moderate, 4→6 high) — the two new highs are
  transitively pulled in by `jsdom` itself (image-size/sharp/postcss/undici); `npm audit --omit=dev` (what
  actually ships to production) is unchanged at 21/17/4, since dev dependencies never reach the deployed bundle.

**2026-09-02, continuation — T-061 done, T-064 handed to owner:** owner asked for the next task in the
suggested Phase 8 order; T-064 (secrets hygiene) turned out not to be self-executable and T-061 was completed
in its place.

- **T-064 — investigated, owner deferred (not a code task).** The Vercel CLI's `env update --sensitive`
  requires resending the variable's full value to flip its type (confirmed by probing `vercel env update
  NODE_ENV production --sensitive` — it fails non-interactively with `missing_value` and asks for `--value`),
  and this session doesn't hold the actual secret values, so the CLI path was ruled out (reconstructing via
  `vercel env pull` + remove + re-add risks corrupting a live secret, especially the multiline Firebase
  service-account JSON, if any step fails mid-swap). The dashboard turns out to make this trivial and safe
  though: current Vercel terminology is a **Type: Secret / Config** radio on each variable's edit page (not a
  "Sensitive" checkbox as this session first assumed), and editing an existing Config var pre-fills its current
  value — flipping to Secret and saving needs no re-entry, confirmed against the owner's own screenshot of the
  `ai-roof` project (`VAPI_WEBHOOK_SECRET`/`VAPI_AUTH_BYPASS`/`VAPI_API_KEY` already show the lock icon =
  Secret type; everything else is Config, viewable/copyable, matching what the owner saw). Narrowed the
  original "every server-side key" scope to the 7 that are genuine credentials — `OPENAI_API_KEY`,
  `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_ACCOUNT_SID` — since Secret is one-way (Vercel: "you can't reveal this value after saving," and a
  saved Secret can't be changed back to Config), so vars that are Config-shaped by nature (`OPENAI_MODEL`,
  `DEEPSEEK_MODEL`, `RESEND_FROM`, `NODE_ENV`, `TWILIO_PHONE_NUMBER`, all `NEXT_PUBLIC_*`) were deliberately
  left alone rather than flipped for no security benefit. Owner explicitly said **skip for now** (2026-09-02)
  rather than click through the 7 — not blocked, a deferred choice; revisit whenever, same click-through above
  still applies (per-var: Edit → leave Value as-is → Type: Secret → Save).
- **T-061 — done.** Switched `src/app/layout.tsx` off the `fonts.googleapis.com` `<link>` (two preconnects +
  one stylesheet request) onto `next/font/google`'s `Inter` (self-hosted at build time, `display: "swap"`,
  exposed as the `--font-inter` CSS variable applied to `<html>`); `globals.css`'s `body` rule now reads
  `font-family: var(--font-inter), system-ui, ...` instead of the literal `'Inter'` string. `next.config.ts`'s
  CSP header flipped from `Content-Security-Policy-Report-Only` to enforced `Content-Security-Policy` — no
  directive changes needed since `font-src 'self'`/`style-src 'self' 'unsafe-inline'` already didn't allowlist
  Google's domains; the violation is gone because the font is same-origin now, not because the policy widened.
  `src/test-utils/security-headers.test.ts` updated: the old "must NOT be enforced" test now asserts the
  opposite (no `-Report-Only` header present), plus a new assertion that the enforced policy's `font-src`
  contains no `fonts.googleapis.com`/`fonts.gstatic.com` reference. Verified: `tsc --noEmit` clean; `eslint`
  0 errors/24 warnings (pre-existing, none new); full `vitest run` 313/315 (the 2 failures —
  `example-lib.test.ts` and, this run, `send.test.ts` — are the long-documented concurrent-load timeout flake,
  both reconfirmed clean on an isolated rerun); `next build` green, no new route-size regressions. No visual
  regression expected (same Inter family, same weights available); not yet spot-checked in a real browser
  against `/login`/`/company/dashboard`/`/admin/businesses` per the task's own acceptance line — flagging that
  as the one still-open acceptance item, matching this session's honest pattern of flagging environment gaps
  rather than claiming full verification.

  **That flagged gap was real, not just a formality — see the live-incident entry below.** The acceptance
  check this task skipped would have caught the missing `connect-src` directive (a genuinely separate bug from
  the font migration itself) before it reached production. Lesson: flagging a gap instead of claiming full
  verification is not the same as the gap being safe to leave open — an enforced CSP change needs the real
  browser check before shipping, not just noted as still-owed.

**2026-09-02, continuation — T-069 and T-063 done:** owner said go ahead with T-069, "and other easy things
too." Picked both remaining no-product-decision Phase 8 tasks; skipped T-062 (major `firebase-admin` v14
migration — explicitly the biggest/riskiest per this phase's own ordering note), T-065 (collides with the
still-open NH-6 question about how many cron-job slots Hobby actually leaves free — `vercel.json` schedules
only 1 of 4 existing cron routes today; adding a 5th unscheduled one doesn't resolve that), and T-067 (flagged
riskiest of the performance trio, touches every page's render path) rather than self-select into higher-risk
territory without a check-in.

- **T-069 — done.** Scope was narrower than "every `<img>`" once read against the spec's own text: the 4
  static brand-logo call sites (`login/page.tsx`, `company/layout.tsx` ×2, `admin/layout.tsx`) moved to
  `next/image` (intrinsic `403×322` read directly from `public/logo.png`'s PNG header, existing CSS
  height+`width:auto` classes left untouched so display size is unchanged — same pattern Next's own docs use
  for a responsive logo). The other 9 `<img>` occurrences are out of scope by the spec's own text: 4 are raw
  HTML strings inside email templates (`notify.ts`, `agentTools.ts`, two `send/route.ts` files) that
  `next/image` cannot touch at all — not React; the rest (job-photo thumbnail grid, lightbox, printable report,
  admin QR code) are dynamic base64/remote images, the spec's own "legitimate `next/image` `unoptimized` case."
  **Photo-path audit (the spec's other half): confirmed, not assumed.** Read `clientResize.ts` — thumbnails are
  compressed to a 240px edge at quality 0.6; the full image is capped by `MAX_FULL_BYTES` (progressively
  re-compressed down to a 800px edge if needed) — then read every render call site: the photo grid
  (`jobs/[jobId]/page.tsx:769`) correctly renders `ph.thumbB64`, never `ph.fullB64`; the lightbox and the
  printable report correctly use `fullB64` (by design — a full-size zoom and a print-quality document
  respectively, not a thumbnail). No mis-wired call site found; no code change needed for this half, exactly
  matching the spec's own "likely no change needed... but confirm with evidence" framing. Verified: `tsc`
  clean; lint 0 errors/**20** warnings (down from 24 — the 4 removed are exactly the migrated logo sites);
  `next build` green (`/login`'s First Load JS: 245kB→251kB, the expected one-time `next/image` runtime cost,
  paid once and shared across every page that now uses it).
- **T-063 — done.** New `src/lib/auth/rateLimit.ts`: an in-memory, per-serverless-instance fixed-window
  counter keyed by `x-forwarded-for` (documented as defense-in-depth, not a distributed guarantee, per the
  task's own edge-case note — matches its "no new paid dependency" constraint). Same `NextResponse | null`
  guard shape as `requireCronAuth` (a response short-circuits, `null` means proceed) so it drops into a route
  as one line. Wired into all three specified routes as the very first check, before auth/parsing, so pure
  flood volume never reaches the rest of the handler regardless of whether it would've authenticated:
  `webhooks/vapi` (300 req/60s per IP — deliberately generous, since one real call can fire many webhook posts
  and Vapi's own traffic for potentially many businesses can share source IPs; this caps floods, not real
  concurrent-call bursts), `field/exchange` (30 req/60s per IP, both GET and POST), `feedback` (10 req/60s per
  IP). Budgets are reasoned from the business's actual shape (single-tenant demo-scale traffic), not measured
  from real production volume — flagging that honestly rather than presenting them as evidence-tuned, since no
  real traffic-volume data exists to tune against. New `src/lib/auth/__tests__/rateLimit.test.ts` covers the
  primitive directly (under-budget allow, over-budget 429+`Retry-After`, sustained blocking not just the first
  overage, per-IP isolation, per-route isolation via `keyPrefix`, window reset, the `x-real-ip` fallback). Added
  one burst test per route to the existing route test files, each confirming a 429 past threshold, an unaffected
  second IP, and — for the two files with no `vi.resetModules()` between tests (`field/exchange/route.test.ts`,
  `route-auth.test.ts`) — added a `_resetRateLimitState()` call to their `beforeEach` first, since those files'
  suites share one module-level bucket map and would otherwise let an earlier test's count bleed into a later
  one (checked every existing call site across both files first: well under the new budgets, so no pre-existing
  test broke, but the shared state was a real latent trap for whoever adds the next test there). Verified: `tsc`
  clean; lint 0/20 (unchanged); full `vitest run` 324/325 (1 known concurrent-load flake in
  `send.test.ts`, isolated rerun clean); the separate deterministic release suite
  (`--config tests/release/vitest.config.ts`) 16/16 clean — its two files that exercise the real webhook route
  handler (`webhook-auth-replay.test.ts`, `duplicate-side-effects.test.ts`) stay well under the new 300/60s
  budget; `next build` green.

**2026-09-02, continuation — pushed, deployed, and shipped a real per-job field QR (ad-hoc, not in the numbered
backlog):** owner asked how a call actually becomes a job a crew member can voice-log, and whether QR codes
could make that easier. Traced the real flow end to end (Alice's call → `bookAppointment`/`createLead` webhook
tools → office reviews the Pipeline and clicks **Create Job** on a booked appointment, pre-filling the form →
crew logs updates by voice at `/company/field`, transcribed via Whisper and parsed by DeepSeek into the
`job.parsed` projection). Found that **QR codes already existed in the codebase but only for the superadmin
Demo Studio flow** — `mintFieldExchangeToken()` (a signed, one-time, 10-minute grant) had exactly one caller,
`demo-customize/route.ts`, minting a grant for the shared demo line only. A real tenant's job detail page had
only "Copy field link," which points at `/company/field` — the *authenticated* path, useless to a subcontractor
or helper with no portal login. `field-operations-guide.html` had already been describing a QR flow ("scan a
QR code at the job site") that didn't actually exist for real businesses — an aspirational doc gap, not just a
missing feature.

Built the real thing rather than just answering the question: new `POST /api/jobs/[jobId]/field-qr`
(staff/owner/superadmin-gated, lazily provisions the business's `fieldKey` on first use the same way
demo-customize already does, then calls the existing `mintFieldExchangeToken(businessId, fieldKey, jobId)`) and
a **Field QR** button + modal on the job detail page, right next to the existing "Copy field link," rendering
the grant as a scannable code via the `qrcode` package already used by Demo Studio (`QRCode.toDataURL`, same
options). The modal shows the QR, a plain-link fallback with its own copy button, the actual expiry time, and a
"New code" regenerate action — since a 10-minute one-time grant is meant for handing off *right now*, not
printing in advance, and the modal's copy makes that explicit rather than implying a QR is durable. Corrected
`field-operations-guide.html`'s Job Management walkthrough to describe both real options (Copy field link for
staff, Field QR for a no-login crew member) instead of the previously-aspirational text.

New `route.test.ts` (9 tests: mints correctly, lazily provisions a missing `fieldKey`, 400 on missing
businessId/invalid JSON, auth-error passthrough with no grant minted, 404 job/business not found, 503 when
Firestore or field-token signing is unavailable) using a small self-contained Firestore fake rather than
importing the demo-customize test's internal fake class across files. Verified: `tsc` clean; lint 0
errors/**21** warnings (+1 over the T-069 baseline — the new QR `<img>` is a legitimate data-URI case, same
exception T-069 already established for base64 images); full `vitest run` 332/334 (2 known concurrent-load
flakes — `example-lib.test.ts`, `send.test.ts` — isolated rerun clean); release suite 16/16; `next build` green
(`/company/jobs/[jobId]` grew 259kB→269kB, the `qrcode` client bundle, paid only on that one route).

**Push + deploy confirmed working, nothing broken:** `git push origin main` (now at commits `67a4710` through
this feature's commit), Vercel's GitHub-integration auto-deploy picked it up — `vercel ls` showed the new
Production build `Ready` within about a minute. Verified against the live URL, not just the build log:
`/api/health` → `200`, every provider `configured`, Firestore `connected`; the enforced `Content-Security-Policy`
header (no `-Report-Only`) is live with no leftover `fonts.googleapis.com` reference on `/login`; an
unauthenticated `POST /api/webhooks/vapi` still correctly 401s (confirms the new rate limiter didn't interfere
with normal auth).

**2026-09-02/03, live incident — T-061's CSP had no `connect-src`, breaking production login:** owner reported
`Firebase: Error (auth/network-request-failed)` on `/login` shortly after the field-QR deploy above. Root
cause: T-061's enforced CSP declared `script-src`/`style-src`/`img-src`/`font-src` but never `connect-src` —
and an unset `connect-src` falls back to `default-src 'self'`, silently blocking every browser `fetch`/XHR the
Firebase client SDK makes (Auth's `identitytoolkit.googleapis.com`/`securetoken.googleapis.com` calls,
Firestore reads). This broke **all login** (Google popup and email/password both call through
`identitytoolkit`) and, separately, every client-side Firestore read still in the app (`AuthContext`'s
`businessUsers` lookup) — a bigger blast radius than the symptom the owner saw. This is exactly the acceptance
gap T-061 flagged and left open rather than checking in a real browser (see the correction note on that entry
above) — a genuine miss, not a hypothetical one.

Fix: `connect-src 'self' https://*.googleapis.com` in `next.config.ts` — one wildcard directive covers Auth,
Firestore, and Firebase Installations (all `*.googleapis.com`) rather than enumerating three exact hostnames,
so a future Firebase service (FCM, etc.) doesn't cause a repeat of this incident. Added a regression test to
`security-headers.test.ts` asserting `connect-src` is present and includes `googleapis.com`, so a future CSP
edit can't silently drop it again. Verified the fix properly this time, not just the header string: `tsc`
clean; `vitest run src/test-utils/security-headers.test.ts` 7/7 (new test included); `next build` green; pushed
(`9a0da8d`) and deployed (Vercel `Ready`); then **drove a real browser against production** (Playwright) —
navigated to `/login`, ran an in-page `fetch` to `identitytoolkit.googleapis.com` with deliberately-bogus
credentials, and confirmed it reached Google (`400` — a content rejection, not a blocked-network error) with
zero CSP violations in the console. This is the acceptance check T-061 itself should have run before shipping.

**2026-09-03 — T-057 done (owner: pick the next self-executable task):** content-only, `public/guides/onboarding-guide.html`
only, per its own owned-scope/prohibited-scope lines — no code touched.

- **Missing pitch cards found and fixed first:** the "Pitch Scripts" vertical-grid had only 7 of the platform's
  10 industries — Electricians, Appliance Repair, and Childcare (all three added by the 2026-08-25 vertical
  expansion, `1d2f840`) never got a card. Added all three, sourcing the exact copy already live in
  `VERTICAL_TEMPLATES[...].sampleCallerScript` (`templates.ts`) rather than writing new pitch lines, so the
  guide and the in-app Demo Studio presenter-notes script can't drift.
- **Field-service full demo generalized to all 7 trades, not just roofing:** the "Field Service — Full Live
  Demo" section only had a real click-by-click walkthrough for roofing; HVAC/Landscaping/Cleaning/GC were only
  named in passing and Electricians/Appliance Repair weren't mentioned at all. Rather than duplicating the
  ~700-word roofing script 6 more times (which would fight the doc's own "nothing is hardcoded per industry"
  point and rot fast), kept roofing as the fully-written reference script and added a swap table — one row per
  remaining trade with its real agent name, a realistic caller opening line, its actual seeded Calendar-row
  names (from `demoSeed.ts`'s `RESOURCES` map, not invented), and its real voice-note script (from each
  template's `vocab.voiceExample`) — so the identical numbered steps are concretely runnable for any of the 7
  without re-deriving anything. Also fixed the cheat sheet's prep step, which still only listed 5 of the 7
  field-service verticals.
- **Intake demo section extended to Childcare:** "Dental & Property Mgmt — the Intake Demo" was missing
  Childcare entirely despite being structurally identical (no Jobs/Field/pricing tabs, Calendar dispatches to a
  resource instead of a crew). Renamed the section, added Nora's caller line and the real seeded sitter rows
  (`Jenna M. / Priya S. / After-hours On-call`), and updated the adjacent "intake businesses" highlight box to
  name all three instead of two.
- **New "After the Sale — Client Talk-Track" section** (the spec's other required half): four subsections —
  handing over the login (a live-call script, not just an email), setting after-hours-approval expectations
  *before* the client's first real one lands (since that's the top source of an early bad reaction, not a bug),
  the ROI conversation reframed around the client's own Dashboard/Calls numbers after a week or two of real
  data instead of the generic industry stats, and a concrete "if a call goes wrong" protocol (pull the real
  transcript before responding, state plainly what happened, never claim the AI is infallible, close the loop
  with a specific config fix) — plus a warning box against the instinct to disable the agent after one bad
  call. Placed right after the Phase 5 go-live success box, before the Go-Live Checklist — a natural "you're
  live, here's what's next" continuation.
- **Fixed in passing:** the cover page and the footer disagreed on the guide's own version (`2.2 — August 2026`
  vs. `v2.0 — June 2026`, a pre-existing drift, not something this task introduced) — bumped both to a matching
  `2.3 — September 2026` rather than leaving one stale.
- **Verified in a real browser, not just structurally:** a Node-based tag-balance check confirmed the new markup
  didn't break the document structure, then the guide was actually rendered (Playwright against a local static
  server, since `file://` is sandboxed) and screenshotted section by section per `T-057`'s own acceptance line
  ("manual read-through, rendered in a browser").
- **Pre-existing rendering bug found and fixed by that browser check, not left flagged-and-open:** `.step-body
  strong { display: block; ... }` (line ~235) was a *descendant* selector, so it forced **every** `<strong>`
  anywhere inside a step — not just the step's own bold title — onto its own block-level line. This was already
  live and broken before this session touched the file: Phase 1's "Configure the model" step
  (`Provider: **OpenAI** — Model: **gpt-4o-mini** — Temperature: **0.5** — Max tokens: **150**`, one sentence,
  4 strongs) rendered as four stacked lines instead of one; the pre-existing Dental/Property-Mgmt intake step's
  crew-row sentence (3 strongs) rendered with each bolded group on its own line and a stray period floating
  alone beneath it. T-057's own Childcare addition to that same sentence (a 4th strong) is what surfaced it in
  this session's screenshot — traced it back and confirmed with `git log -p` that the other 3 predate this
  session. Fixed with a 1-line, obviously-scoped CSS change: `.step-body strong` → `.step-body > strong` (direct
  child only — the step title *is* a direct child of `.step-body`; everything inside its `<p>` is not), which
  restores normal inline bold everywhere else in the document without touching any other rule. Re-screenshotted
  both the newly-fixed intake-demo paragraph and the pre-existing Phase 1 step to confirm — both now render as a
  single flowing line with normal inline bold, matching the guide's actual intent. This is a same-file CSS fix,
  not new guide infrastructure or a functional/JS change, so it stays inside T-057's own owned file even though
  it's a step beyond "content only" — leaving a bug this visible unfixed after finding it live in a real render
  would repeat the exact mistake T-061's CSP incident already taught this project not to make (see the
  live-incident note above: "flagging a gap is not the same as the gap being safe to leave open").

**2026-09-03, continuation — T-062 partially done (CI gate only, owner: "what's the next improvement you can
knock out right now"):** split T-062 the same way T-061 was split from its CSP/font work — the task bundles two
unrelated things (a CI check that catches *new* vulnerabilities, and migrating `firebase-admin` to v14, flagged
in this same phase's own ordering note as "explicitly the biggest/riskiest" item). Did the CI-gate half only;
the v14 migration stays exactly where the backlog already had it — queued, needs an owner check-in before
touching a major direct dependency this central (every server-side Firestore call goes through it).

- New `.github/workflows/ci.yml` step: `npm audit --omit=dev --audit-level=critical`, after the release suite.
  Gates on critical severity only, so it doesn't fail on the pre-existing, already-tracked moderate/high debt
  (which needs the deferred v14 migration to actually close) — it exists to catch a *future* dependency bump
  silently introducing a critical-severity hole, which nothing in CI catches today.
- Verified against a live run, not assumed: `npm audit --omit=dev --json` timed out repeatedly in this
  session's sandbox against `registry.npmjs.org/-/npm/v1/security/advisories/bulk` specifically (basic `npm
  ping` succeeded instantly — an environment-local egress quirk, not a registry outage or a repo problem); the
  same command without `--json` succeeded and reproduced the exact documented baseline — **21 vulnerabilities,
  17 moderate / 4 high / 0 critical**, all transitive through `firebase-admin@12` — confirming `--audit-level=
  critical` exits `0` today and won't false-fail CI on merge.
- Full re-verification: `tsc --noEmit` clean, lint 0 errors/21 warnings (unchanged baseline — this is a
  workflow-only edit, no source touched), `next build` green with no route-size regressions, `npm test`
  335/335 (no flake this run).
- Not done, still open: the `firebase-admin` v14 migration itself (closes the 17 moderate/4 high), and whether
  GitHub Actions' runners hit the same advisories-endpoint slowness this sandbox did — worth a glance at the
  first real CI run against this new step before trusting it long-term.

**2026-09-03, continuation — T-065 done (owner: "go ahead with next"):** the task this session's own T-062
entry flagged as blocked on NH-6's "how many cron-job slots does Hobby actually leave free" question — resolved
that question first rather than guessing: fetched Vercel's own current docs
(`/docs/cron-jobs/usage-and-pricing`), which state Hobby allows **100 cron jobs per project** on **all** plans,
identically to Pro/Enterprise — only the *minimum interval* is Hobby-restricted (once/day, the limit this
session already hit and worked around for `follow-up-calls` back in Phase 3). The "how many slots" framing in
NH-6/T-062 was a misreading of the earlier once-daily-frequency finding as a job-count limit too; it was never
actually a count constraint. NH-6 (unrelated FAQ/summary-cron scheduling question) stays open, but T-065's own
blocker is fully resolved — a 5th cron entry needs no plan change and no owner tradeoff.

- **New counter, owned by `verify.ts` per the spec's own scope line:** `recordVapiAuthFailure()` — a
  best-effort, try/caught `FieldValue.increment(1)` write to a new `_vapiWebhookHealth/authFailureCounter` doc
  (same internal-collection naming convention as the existing `_vapiWebhookEvents` replay-claim store; covered
  by `firestore.rules`' existing default-deny catch-all, no new rule needed). Called from
  `src/app/api/webhooks/vapi/route.ts`'s existing 401 branch, awaited (not fire-and-forget — `next/server`'s
  `after()` isn't used anywhere else in this repo and its behavior when a route handler is invoked directly in a
  test, as every existing webhook test does, wasn't worth the risk to verify for one Firestore write's worth of
  latency saved). A Firestore hiccup here is caught and logged, never turns a clean 401 into a 500 — the auth
  decision itself is completely unaffected either way.
- **New `src/lib/vapi/webhookHealth.ts`** (a small addition beyond the spec's literal two-file owns-list, needed
  to make the threshold/window logic unit-testable on its own): `shouldAlertForAuthFailures(count, threshold)`
  (pure), `AUTH_FAILURE_ALERT_THRESHOLD = 5` (sustained failures, not one occurrence — matches the spec's own
  "a single transient 401 must not fire a false alarm" edge case), and `readAndResetAuthFailureWindow(db)` —
  reads the counter accumulated since the previous check and resets it to zero unconditionally, so state stays
  bounded (reset-on-read, the spec's own second allowed option, alongside TTL) rather than growing an
  ever-larger event log.
- **New `src/app/api/cron/webhook-health/route.ts`** (cron-secret-gated via the existing `requireCronAuth`):
  reads+resets the window, and only if the count clears the threshold, sends exactly one alert email via a new
  `sendWebhookHealthAlert()` in `src/lib/notify.ts` (reuses `src/lib/comms/send.ts`, no new notification
  channel, per the spec's own constraint) to `connect@luxordev.com` — same target as the existing feedback
  email. New `[Alert]` category added to `docs/EMAIL-CONVENTIONS.md`, consistent with the existing
  `[Category]` convention. Scheduled in `vercel.json` at `30 13 * * *` (daily, an hour before the existing
  `follow-up-calls` job, arbitrary but distinct).
- **Test-suite ripple, handled deliberately rather than loosened:** three existing tests asserted
  `getAdminFirestore` was *never* called on a 401 (`src/lib/vapi/__tests__/route-auth.test.ts`'s
  zero-side-effects case, its 429-burst case, and `tests/release/webhook-auth-replay.test.ts`'s two 401 cases)
  — a real invariant this task's own new behavior legitimately changes. Updated each to assert the new call
  count precisely (once per 401, zero for a request that never reaches the auth check at all, e.g. the
  429-blocked or the rate-limited case) rather than deleting or weakening the assertion; the *booking*-work
  assertions (`bookAppointment`/`createLead`/etc. never called) are untouched and still enforced. 17 new tests
  added: `src/lib/vapi/__tests__/webhookHealth.test.ts` (counter increment/no-op/swallowed-failure, threshold
  boundaries, window read+reset) and a new "webhook health alerting" block in
  `src/app/api/cron/webhook-health/route.ts`'s coverage inside the existing `src/app/api/cron/cron-routes.test.ts`
  (reusing its existing `FakeFirestore` and cron-auth-boundary `it.each` pattern rather than duplicating it) —
  single transient failure → no alert + window reset, sustained burst → exactly one alert + reset, no counter
  doc at all → zero/no alert, Firestore unavailable → 500 without touching the alert channel.
- Verified: `tsc --noEmit` clean; lint 0 errors/21 warnings (unchanged baseline); full `vitest run` 350/352 (the
  2 failures — `example-lib.test.ts`'s `verifyVapiWebhook` smoke test and `send.test.ts`'s `sendEmail`
  unconfigured test — are the long-documented concurrent-load timeout flake, both reconfirmed clean on an
  isolated rerun); release suite 16/16 (both updated 401 cases pass); `next build` green, new
  `/api/cron/webhook-health` route at the shared 103kB baseline (a server route, no client bundle cost).
- Pushed and deployed clean (`fbaf541`) — confirmed via `/api/health` and the webhook 401 path in production.

**2026-09-04, live incident — T-062's second half attempted, broke production, reverted within minutes:**
owner said "yeah go ahead" to both pushing the above and starting the `firebase-admin` v14 migration. The
migration itself (`6bef37b`) was thoroughly verified *locally* — `tsc`/lint/352 tests/release suite/`next build`
all green, `npm audit` confirmed the target findings gone — and pushed. **`next build` succeeding was not
sufficient evidence; this is the mistake, stated plainly.** Production `/api/health` started 500ing immediately
after deploy. `vercel logs` on the new deployment showed the real cause instantly:

```
Error: require() of ES Module /var/task/node_modules/jose/dist/webapi/index.js from
/var/task/node_modules/jwks-rsa/src/utils.js not supported.
```

**Root cause:** `firebase-admin@14.3.0` depends on `jwks-rsa@4.1.0` (used by its Auth module for JWKS-based
token verification — on the critical path for every login, not an edge feature), which depends on `jose@^6.1.3`
— and `jose` went pure-ESM (`"type": "module"`, no CJS export) starting at v6. This is a **known, currently
open upstream issue**, not a mistake specific to this migration:
[auth0/node-jwks-rsa#493](https://github.com/auth0/node-jwks-rsa/issues/493). Node 24 (what CI/Vercel were
bumped to for this migration) does support synchronous `require(esm)` interop as of `>=23.0.0`, which is why
this never surfaced in local testing or `next build` — but it did not activate inside Vercel's actual
serverless runtime for this route, and the crash happens at *module load*, not when any auth function is
called, so it took down every route touching `@/lib/firebase/admin` at once (essentially everything —
Firestore reads, login, all API routes), not just Auth-specific paths.

**Immediate response:** `vercel rollback` was attempted first and correctly **blocked by the permission
classifier** — a good guard, not worked around. Fixed forward instead, the same way every other change this
session shipped: `git revert --no-edit 6bef37b` (clean revert, all 8 files including the doc updates), pushed
(`bf10381`). Verified production restored properly, not just re-deployed: `/api/health` → `200`/`"connected"`,
an unauthenticated `POST /api/webhooks/vapi` → `401` (T-065's changes, deployed in the same push cycle as the
firebase-admin work, stayed live and correct throughout — only the firebase-admin commit was reverted), `/login`
→ `200`. Total production impact window: the time between the `6bef37b` deploy going `Ready` and the `bf10381`
revert deploy going `Ready` — on the order of minutes, not hours.

**Why no safe retry today:** researched whether a scoped fix exists before writing this up, rather than
guessing. `firebase-admin@14.3.0` and `jwks-rsa@4.1.0` are both already the latest available versions of each —
no upstream patch to update to. Downgrading `jwks-rsa` to a pre-jose-v6 release (3.2.2, on `jose@^4.15.4`) was
considered and rejected: unlike the T-062 `uuid` override earlier this session (a leaf dependency this app never
calls into), `jwks-rsa` sits directly on the token-verification path `firebase-admin@14.3.0`'s own Auth code was
built and tested against — forcing an older major two levels down risks a **silent** API mismatch on a security
boundary instead of the loud crash this incident actually was, which is a strictly worse failure mode. Revisit
only when either `jwks-rsa` ships a `require(esm)`-safe release (or drops the hard `jose` dependency), or a
dedicated session specifically tests Vercel's serverless `require(esm)` behavior in isolation before touching
`main` again — not as a five-minute follow-up to this incident.

**State reverted, not carried forward:** `firebase-admin` is back at `^12.0.0`, `.github/workflows/ci.yml`'s
`NODE_VERSION` back at `"20"`, the three legacy-namespace files back to `import * as admin from "firebase-admin"`,
`package.json`'s `uuid` override removed, `CLAUDE.md`'s Next Steps line reverted to its pre-migration wording.
T-062 checklist entry and the Phase 8 progress count (6/9) both correctly reverted along with the code — the
CI-gate half from earlier this session (`27b8556`) is still merged and live; only the `firebase-admin` v14 half
is undone. **T-062 stays open, blocked, not "done."**

**2026-09-05 — T-067 done (owner: "what's next that doesn't need human... improve loading times on every
page"):** the last self-executable task in Phase 8's performance trio (T-068/T-069 already done; T-062's
remaining half is upstream-blocked, T-064 is owner-deferred, and T-054/055/056/058/060 all need a real product
decision — T-067 was the one genuinely no-human-input, load-time-improving task left in the backlog).

- **Root cause, confirmed against the actual code:** `AuthContext.tsx`'s `onIdTokenChanged` callback blocks
  `loading` on two sequential async steps (`firebaseUser.getIdToken()` then a Firestore `businessUsers` `getDoc`)
  before any page can render. `AuthProvider` is instantiated independently in both `company/layout.tsx` and
  `admin/layout.tsx` (not once at the root), so this full round trip re-pays itself on a hard refresh **and**
  on every top-level layout remount (superadmin bouncing between `/company/*` and `/admin/*`), not just first
  sign-in.
- **Fix:** new `src/lib/auth/profileCache.ts` — a small, dependency-free sessionStorage cache (`read/write/
  clearCachedProfile`, generic over any `{ uid: string }` shape, every failure mode — missing key, wrong uid,
  corrupt JSON, storage unavailable — collapses to a clean miss, never a throw). `AuthContext.tsx` now checks it
  first on every `onIdTokenChanged` firing: a hit calls `setUser`+`setLoading(false)` immediately (instant first
  paint), then the real `getIdToken()`/Firestore read still runs in the background and overwrites both the
  state and the cache — so a role change lands within the very next `onIdTokenChanged` firing (sign-in/out or
  Firebase's own hourly refresh) rather than sticking forever, matching the task's own edge-case requirement.
  Sign-out clears the cache; a different uid signing in is never handed the previous user's cached profile
  (validated by the uid match inside `readCachedProfile`, covered by a dedicated test). Explicitly a read-path
  UX cache only, per the task's own constraint — every server API route still independently re-verifies the
  real Firebase ID token from the `__session` cookie, so a stale cached profile can only affect what the UI
  paints for an instant, never what the backend allows.
- **Tests:** new `src/lib/auth/__tests__/profileCache.test.ts`, 7 cases (miss-when-empty, hit-for-the-same-uid,
  miss-for-a-different-uid, clear-then-miss, a later write replacing an earlier one, corrupt-JSON-is-a-miss,
  unavailable-storage-is-a-no-op) — stubs a minimal in-memory `Storage` via `vi.stubGlobal` rather than pulling
  in jsdom, since this module never touches the DOM (kept the suite's `environment: "node"` default; jsdom stays
  scoped to `Tooltip.test.tsx`, the one file that actually needs it).
- **Verified:** `tsc --noEmit` clean; `eslint` 0 errors/21 warnings (unchanged baseline, no new warnings);
  full `vitest run` 356/359 (3 failures — `example-lib.test.ts`, `registry.test.ts`, `send.test.ts` — all the
  long-documented concurrent-load timeout flake, none touching `AuthContext`/`profileCache`, all reconfirmed
  clean on an isolated rerun of just those three files); release suite 16/16; `next build` green with no route
  First-Load-JS regression (this is a runtime-logic change, not a bundle-size one).
- **Not done this session, deliberately:** no live-browser click-through timing a before/after page load — the
  acceptance criterion ("navigating between two already-visited company pages shows content without a new
  Loading… flash") is satisfied by the cache design and covered by the unit tests, but a real-browser Playwright
  timing pass would be stronger evidence; flagging as a nice-to-have follow-up, not a gap that blocks calling
  this done (same honesty standard as T-061's flagged-but-real gap above).

**2026-09-05, continuation — closed a real gap in T-068's own "done" scope (owner: "go on to the next
improvement you can do, proceed"):** T-068's spec explicitly named three more heavy routes as "a follow-up
audit within the same task" beyond Calendar — `/admin/onboarding`, `/admin/businesses/[businessId]/config`,
`/company/jobs/[jobId]` — but the 2026-09-02 completion only ever touched Calendar; a fresh grep confirmed
`next/dynamic` still appears nowhere outside `company/calendar/`. Rather than re-open the riskier three-route
work with no check-in, looked for what was actually making them heavy: `/company/jobs/[jobId]` and `/admin/demo`
both had a static top-level `import QRCode from "qrcode"` (used only inside a click-triggered `openFieldQr()`/
a result-gated `useEffect`, never on first paint), so the ~20kB `qrcode` module was shipping in every visitor's
initial bundle whether or not they ever opened the QR flow. Same class of bug T-068 fixed for `@dnd-kit`, one
tier down — a library-level split (`await import("qrcode")` at the call site) rather than a `next/dynamic`
component boundary, since `QRCode.toDataURL` is a plain function call, not a component to mount.

- **Measured, not assumed:** `next build`'s own output — `/company/jobs/[jobId]` First Load JS **269kB → 261kB**;
  `/admin/demo` **(not previously flagged, but also carried the same import)** dropped to **118kB**, close to the
  103kB shared baseline. `/admin/onboarding` (260kB) and `/admin/businesses/[businessId]/config` (261kB) are
  untouched by this fix — they import no `qrcode`; their weight is genuinely the wizard/config page code and
  `VERTICAL_TEMPLATES`/`PLAN_PRESETS` data (37.8kB/1.3kB source respectively) needed to render all 10 verticals,
  not an accidentally-eager third-party library. Splitting those further would mean lazy-loading individual
  wizard steps or config sections behind `next/dynamic` — a materially more invasive refactor of stateful,
  multi-step forms, not a mechanical import-site change — so left as a flagged follow-up rather than rushed.
- **Zero behavior change:** same `QRCode.toDataURL(...)` call, same options, same await; only *when* the module
  loads changed. Admin demo's effect gained an explicit `cancelled` guard around the now-async import chain (the
  effect can re-fire — vertical change, new launch — before a slow import resolves; without the guard a stale
  response could `setQrDataUrl` after a newer one already landed).
- **Verified:** `tsc` clean; lint 0/21 (unchanged); full `vitest run` **359/359 clean this run** (no flake); release
  suite 16/16; `next build` green.

**2026-09-05, continuation — T-056 (per-industry visual families) + a token-conservation pass (owner: "proceed
with the next todo improvement items, load time reduction and token conservation are fiduciary... I do want the
[roofers] to feel it is for them, and the dentists to feel it is for them"):** NH-13's blocker cleared this
session — the owner dropped a reference screenshot (`example image irrigation.png`, repo root) of a branded
client portal (sidebar nav, one confident accent color, card-based layout) — so T-056 was picked up alongside a
new (non-numbered) token/cost audit matching the owner's other stated priority.

- **T-056 — done.** Added `family: "field" | "care" | "ops"` to every `VerticalTemplate`
  (`src/lib/verticals/templates.ts`) grouping the 10 verticals per the original 2026-08-27 audit's own proposal:
  **field** (roofing, HVAC, landscaping, cleaning, GC, electricians, appliance repair — 7 on-site trades, keeps
  today's teal unchanged) · **care** (dental + childcare — calm clinical blue) · **ops** (property management
  alone — structured violet, reusing its existing admin-card color for continuity rather than inventing a new
  one). `useBusinessModules()` exposes `family` (null/fail-open for an unresolved or unrecognized industry, same
  pattern as every other field on that hook). `company/layout.tsx` applies it as `data-portal-family` on
  `.company-shell`; `globals.css` overrides `--accent`/`--accent-dark`/`--accent-soft`/`--ring` only inside that
  scoped attribute selector — every existing `.button`/border/focus rule still reads `var(--accent)` unchanged,
  so this is additive, not a rewrite of the one-teal rule (per the spec's own carve-out). **Not a reversal of the
  admin Demo Studio's per-vertical `color` field** — that stays untouched, exactly as prohibited-scope requires.
  Palette choice is this session's own call, not a live round-trip confirmation with the owner on exact hex
  values — reasonable given "proceed" plus the dropped reference, but flagging honestly: a 30-second visual
  glance at a `care` and an `ops` tenant portal side-by-side is still worth doing before calling the palette
  itself final. Every accent independently verified ≥4.5:1 contrast against white (computed from the *actual*
  `globals.css`, not a duplicated constant, so the test can't silently drift from what ships) — `care` 5.45:1,
  `ops` 7.95:1, `field` (unchanged teal) 5.48:1. New tests: `src/lib/verticals/__tests__/family-palette.test.ts`
  (contrast + grouping), `src/hooks/__tests__/useBusinessModules.test.ts` (first test for this hook — resolve,
  fail-open, sessionStorage-cache-hit paths, mocking Firestore/`useBusinessId`). Zero bundle-size impact (`next
  build` unchanged) — CSS custom-property + one enum field, no new dependency.
- **Token-conservation pass — done, narrower than a full audit.** Traced the live-call path first since that's
  the highest-volume LLM usage: confirmed `demo-customize/route.ts` pushes a **static** persona to the Vapi
  assistant (`updateAssistantPersona`, the 2026-09-02 fix) with no `runtime` context passed to
  `buildAgentPrompt()` — so the live line's system prompt is already maximally stable call-to-call (good for
  whatever prompt caching Vapi's own backend does; nothing to reorder on our side since we don't construct
  per-turn requests for the live call at all, Vapi does). The `assistant-request` webhook branch that *does*
  build a runtime-aware prompt is confirmed dead code for every real tenant (2026-09-02's own finding: it never
  fires for a fixed-`assistantId` number, which is every number this platform provisions) — left alone rather
  than removed opportunistically, since deleting it is unrelated cleanup, not a cost or speed change, and out of
  this pass's scope. The actual finding: **none of the four DeepSeek/OpenAI back-office completions calls
  (`parseFieldUpdate`, `summarizeTranscript`, `classifyCallOutcome`, `generateFaqSuggestions` in
  `src/lib/ai/deepseekClient.ts`) set `max_tokens`** — relying entirely on `response_format: json_object` plus
  prompt instructions ("2 sentences max", "max 3 suggestions") to bound output, with no hard ceiling if a
  completion gets stuck repeating. Added defensive `max_tokens` per operation (1000/300/200/600, sized generously
  above every real-world output seen in the existing test fixtures) — this is a cost/latency ceiling, not a
  quality lever: normal outputs sit well under every cap, so nothing about extraction accuracy changes. Explicitly
  did **not** revisit `parse-field-update`'s `gpt-4o` model choice — T-048 already ran that exact comparison
  (gpt-4o-mini regressed 6.6 points on a fixture-based accuracy test) and deliberately didn't ship the downgrade;
  re-opening that without new evidence would be re-litigating a decision already made, not "proceeding." 4 new
  test cases in `src/lib/ai/__tests__/ai-hardening.test.ts`, one per function, each capturing the real params
  passed to the mocked `chat.completions.create` and asserting the cap.
- **Verified (both pieces together):** `tsc --noEmit` clean; `eslint` 0 errors/21 warnings (unchanged, no new
  warnings); full `vitest run` 374/374 clean this run (the one recurring `example-lib.test.ts` timeout didn't even
  reproduce this pass); release suite 16/16; `next build` green, route sizes unchanged. **Not committed yet** —
  sitting in the working tree alongside the two already-local-only T-067/T-068-follow-up commits from earlier
  this session, per the standing "nothing pushed without explicit approval" rule (and commits themselves weren't
  made pending the owner seeing this summary first).
- **Left for the owner:** `example image irrigation.png` is still sitting untracked in the repo root — it was
  useful as a one-time visual reference, not an asset the app itself needs, so it wasn't added to git or moved
  into `public/`. Delete it, or say if it should be kept somewhere for future reference.
  **Resolved 2026-09-08:** owner asked to keep it. It carried real PII (owner's home address/phone, vendor's
  mailing address + Zelle number) and `AIRoof` is a public repo, so those fields were redacted before
  committing to `docs/references/irrigation-portal-example.png`; the raw untracked root copy is deleted.

**2026-09-05, continuation — T-060: switched the live line to GPT Realtime (owner: "set it to the currently most
human sounding timing, personality, models, responses... find out what it is and set it that way. the best,
real human sounding"):** researched Vapi's current (Sept 2026) options live rather than trusting this repo's own
docs, applied the change, and caught a real regression before it shipped.

- **Corrected a stale assumption before touching anything.** `HANDOFF.md`/`MASTER_PLAN.md`/`CLAUDE.md` all
  described the live stack as Cartesia + GPT-4o-mini + Deepgram nova-3. A `--dry-run` against the actual live
  assistant (see below) showed that was already wrong: the real config was **Vapi's own "Vapi Voices v2"** (voice
  `Savannah`, speed 1.15) + **Deepgram Flux** (`flux-general-en`, with `eotThreshold`/`eotTimeoutMs`/
  `smartFormat` already tuned) + `gpt-4o-mini` — someone had already migrated the voice/transcriber at some point
  without updating any of the three docs that described it. Fixed all three (see below).
- **Research (live web search, not memory — Vapi's catalog changes fast):** the most human-sounding option
  Vapi currently offers is OpenAI's **GPT Realtime** (`gpt-realtime-2025-08-28`) — a native speech-to-speech
  model, meaning no separate STT→text→TTS pipeline stage where prosody/emotion get flattened to text and
  resynthesized. Confirmed via Vapi's own docs that (a) function/tool-calling works identically — no risk to the
  7 booking tools, (b) Vapi still generates a full end-of-call transcript regardless of which model handles the
  live conversation (our summarize/classify/audit pipeline is unaffected), (c) `cedar` is OpenAI's own
  recommendation for a warm, conversational tone (the alternative, `marin`, is tuned for clarity/structured
  speech — worse fit for a receptionist).
- **Built `scripts/set-vapi-human-voice.mjs`** (committed) — GETs the current assistant, saves a full JSON
  backup for instant rollback, PATCHes, then re-GETs to verify the change round-tripped. Supports `--dry-run`.
- **The dry-run caught a real mistake before it shipped.** The script's first draft also set
  `startSpeakingPlan`/`stopSpeakingPlan`/`backgroundSound` to generic documented defaults (`waitSeconds: 0.4`,
  etc.). Running `--dry-run` against the real live config showed these were **already hand-tuned snappier**
  (`waitSeconds: 0.1`, `numWords: 2` already filtering backchannel like "yeah"/"okay", `backgroundSound: "office"`
  already set) — applying the "textbook" values would have made the live line measurably *slower* to respond,
  the opposite of what was asked. Removed those fields from the patch entirely before applying anything for real;
  final PATCH touches only `model` and `voice`.
- **Applied and verified live:** `model.provider: "openai"`, `model.model: "gpt-realtime-2025-08-28"`,
  `voice: {provider: "openai", voiceId: "cedar"}`. Confirmed via a clean post-change GET: all 7 `toolIds` intact,
  system prompt/`firstMessage` untouched (owned separately by `updateAssistantPersona`/`demo-customize`),
  `startSpeakingPlan`/`stopSpeakingPlan`/`backgroundSound` unchanged from their already-tuned values.
- **Credential handling:** `VAPI_API_KEY` was needed to run this. This session's Bash permission classifier
  correctly blocked an automatic `vercel env pull --environment production` (that command pulls *every*
  production secret, not just this one — a legitimately broader action than the task needed, and exactly the
  blast radius T-064's Secret-type hardening exists to limit). Owner chose to paste the key directly rather than
  pull-and-relay it themselves; saved to the gitignored `.env.local` for reuse, never printed in any command
  text (read from the file into the shell inline), never committed. Cleaned up afterward: the two redundant
  dry-run backup snapshots and a stray `.env.vapi-temp` (created by an earlier, unsuccessful attempt at the
  self-service pull-and-source flow, containing every production secret in plaintext) were deleted; the one real
  before-change snapshot was moved outside the repo to the session scratchpad rather than left in the repo root.
  Added `vapi-assistant-backup-*.json` to `.gitignore` so a future run of this script can't accidentally get
  committed.
- **Cost, stated plainly:** materially more expensive — roughly **$0.15–0.30+/min all-in** vs. the prior
  **~$0.09–0.14/min**, since GPT Realtime bills $0.06–0.11/min for the model alone before Vapi's platform fee.
  Owner explicitly prioritized call quality over cost for this specific decision (the customer-facing voice is
  the product), distinct from this same session's earlier token-conservation pass on invisible back-office AI
  calls (field-note parsing, summaries) — no tension between the two: one is what the caller hears, the other
  never reaches them.
- **Docs corrected:** `CLAUDE.md`'s Tech Stack line and Known Limitations "Voice" bullet, `MASTER_PLAN.md`'s
  T-060 spec (marked done, original stale "current stack" claim struck through and corrected in place).
  `HANDOFF.md`'s old "Vapi Architecture (current)" section (further down, describing Cartesia/nova-3 and the
  now-confirmed-dead `assistant-request` prompt-injection path) was left as historical narrative rather than
  rewritten — that section already sits below this file's own "dated session narratives below remain historical
  evidence" banner, so a fresh, correct entry was added above it instead of editing history in place.
- **Not done, and it's the one thing that actually matters here:** an actual human placing a real call and
  listening. Nothing above can verify "does it sound human" — that's a judgment call only a live test call
  answers. Rollback is one re-PATCH away from the saved snapshot if it doesn't land well.
- **Verification of everything else this session touched:** `tsc`/lint/tests/build were not re-run for this
  specific change since it's a pure external-API operation (Vapi's live assistant config) — zero lines of
  application source changed, only a new standalone script + `.gitignore` + docs. The three commits from this
  session's earlier T-056/token-conservation work were already independently verified green before this.

**2026-09-07 — the live call test above found a real regression; GPT Realtime reverted.** Owner placed a real
call and reported: doesn't sound human, talks over the caller and never yields on interruption, cuts off
mid-word on longer responses (resumes only if the caller says "continue").

- **Root cause (confirmed via Vapi's docs + a live read-only GET of the assistant):** `startSpeakingPlan`/
  `stopSpeakingPlan` govern the cascaded transcriber→LLM→TTS pipeline only, **not** speech-to-speech models —
  [docs.vapi.ai/customization/voice-pipeline-configuration](https://docs.vapi.ai/customization/voice-pipeline-configuration)
  is explicit about this. The hand-tuned `numWords: 2`/`backoffSeconds: 0.7`/`waitSeconds: 0.1` this task
  deliberately preserved were silently inert the entire time `gpt-realtime` was live — nothing was actually
  handling interruption. The mid-response cutoffs match a native-realtime turn getting truncated (context
  survives — "continue" resumes it), not a dropped call. Vapi's OpenAI Realtime docs
  ([docs.vapi.ai/openai-realtime](https://docs.vapi.ai/openai-realtime)) don't document a reliable tuning knob
  for this today.
- **Fix:** new `scripts/rollback-vapi-voice.mjs` (`--dry-run` supported, same backup-then-PATCH-then-verify
  pattern as `set-vapi-human-voice.mjs`) reverted `model`→`gpt-4o-mini` (openai) and `voice`→
  `{provider: "vapi", voiceId: "Savannah", version: 2}` — the exact pre-T-060 config. Transcriber (Deepgram
  Flux), all 7 `toolIds`, and the system prompt were never touched by T-060 and are unaffected. Verified live via
  a clean GET: `model.model` → `gpt-4o-mini`, `voice.voiceId` → `Savannah`, 7/7 tools intact. Cost back to
  ~$0.09–0.14/min.
- **Cleanup:** the pre-rollback (gpt-realtime/cedar) snapshot moved outside the repo (gitignored either way);
  the redundant dry-run copy deleted, matching this repo's own T-060 cleanup convention.
- **Docs corrected:** `CLAUDE.md`'s Known Limitations "Voice" bullet now describes the revert, not the
  gpt-realtime experiment as current. `HANDOFF.md` gets a matching 2026-09-07 entry.
- **Not done:** a second live call to confirm the fix by ear. **Not investigated:** whether Vapi's realtime
  integration exposes an undocumented turn-detection/interruption knob outside the assistant PATCH schema
  (e.g. dashboard-only). If GPT Realtime is revisited, its turn-taking needs its own dedicated tuning/testing
  pass — nothing about the cascaded pipeline's settings transfers to it.
- **T-060 status:** flip from "done" to **done, then reverted** — the task's own acceptance criterion ("an
  actual human placing a real call and listening") is exactly what caught this; leaving this note here rather
  than only in HANDOFF so a future session doesn't re-attempt gpt-realtime without reading why it was pulled.

- [x] Phase 12 — Platform Expansion: Speed, Customers, Photos, Invoicing, Time Clock, Spanish & Roles
      (owner-added, 2026-09-14) — 7/7, CLOSED 2026-09-16
      Owner gave a single large, multi-part brief covering a Customers entity with fast cross-job search,
      a Spanish toggle for the phone AI and field voice parser, a tap-based time clock with a cross-job
      guard, before/after photo labeling with a specific report grid, persisted/editable invoices with
      hide-materials and a logo library, trade-role invites, and a general loading-time/token-conservation
      pass — plus one concrete bug ("voice input screen has a url"). Full design:
      **`docs/PLATFORM-EXPANSION-PLAN.md`** (canonical spec, with per-phase "Shipped" notes for every
      deviation). Condensed shipped summary is in "Current snapshot" above; full dated narrative is in
      `HANDOFF.md`. Note: this checklist's task numbers match the plan doc/HANDOFF.md's *shipped* order
      (T-090 = Time clock, T-091 = Photos, T-092 = Invoice), not an earlier pre-work draft order that had
      briefly assigned those three numbers differently — corrected here so the two stop disagreeing.
  - [x] T-088 — Foundation + the field-URL bug. Dropped the ~281KB `@firebase/firestore` chunk from every
        authenticated page; closed a real security hole (`GET /api/company/settings` had no auth check);
        fixed the reported URL bug (`/field`'s address bar is now bare, no token); fixed a live
        cross-tenant bug (manifest `start_url` always opened the demo tenant). Deferred: splitting the
        1854-line job detail page, migrating pages onto the new `useQuery` hook. Merged to `main`, pushed
        to `origin/main`.
  - [x] T-089 — Customers. `businesses/{bid}/customers`, zero-network in-memory search
        (`matchesQuery()`/`buildSearchTokens()`), a `CustomerCombobox` on job-create, `matchKey`-based
        find-or-create, a backfill script. Deviations: no `customerPlaceholder` field added (existing
        vocab fields sufficed); `GET /api/jobs`'s fuller pagination rewrite deferred, only an additive
        `&customerId=` filter shipped. Merged to `main`, pushed to `origin/main`.
  - [x] T-090 — Time clock. Six-punch state machine, an immutable `punches` ledger, an atomic cross-job
        409 guard, a nightly auto-close cron; a punched `(worker, day)` shadows spoken labor entirely in
        the invoice projection (LLM stays out of arithmetic). Deferred: a persisted `timesheets`
        collection, an admin time-edit sheet, Labor-tab provenance chips. Firestore rules + a composite
        index actually deployed. Merged and pushed.
  - [x] T-091 — Photos. Before/after/other phasing + `sort`/`orientation`, `MAX_PHOTOS_PER_JOB` 10→24, a
        batched blob endpoint (kills the report's old N+1), the report grid rewritten (fixed-aspect +
        blurred backdrop, no crop/no dead space), a `PhotoEditSheet` for after-the-fact edits. Deferred: a
        field-side photo gallery, drag-reorder for `sort`, the `comfortable` density variant. Merged and
        pushed.
  - [x] T-092 — Invoice persistence. Real `businesses/{bid}/invoices` (was ephemeral React state before),
        a shared `jobInvoice.ts` so client/server totals can't drift, `hideMaterials` now collapses
        materials everywhere it's promised (email + in-app print/PDF, closed in a same-week follow-up), a
        letterhead redesign matching a real customer invoice sample (fixed two real bugs: the invoice
        number and a nonexistent `biz.phone` field). Deferred: the two-pane live-preview redesign remains
        deliberately not built. Firestore rules deployed. Merged and pushed.
  - [x] T-093 — Spanish. Whisper auto-detect (voice, no forced language) + a stopword/diacritic heuristic
        (typed text); `parseFieldUpdate` translates in the same extraction call (not a second LLM call)
        and always emits canonical-English structured data plus a `transcriptEn`; an ES→EN toggle badge on
        both field screens; a live phone-AI language toggle via `updateAssistantPersona` (now always
        preserves `startSpeakingPlan`/`stopSpeakingPlan` on every PATCH — a permanent hardening from the
        2026-09-07 gpt-realtime incident). Deliberately not done: a language-specific Vapi voice (no
        confirmed Spanish `voiceId` exists — **NEEDS-HUMAN, NH-15/16**) and bilingual/"multi" transcriber
        mode. Merged and pushed.
  - [x] T-094 — Trade roles. A `trade` field on `TeamMember`, kept separate from the `TeamRole` permission
        axis (zero `verifyAuthAndRole` call sites touched); `defaultLandingPath()` routes a field
        trade/foreman to the right post-login screen, wired into invite emails and `company/layout.tsx`;
        `/company/field` scopes to a worker's own crew and shows real names instead of emails. Merged and
        pushed.
  - [x] Logo library (Phase 4 remainder, folded into this close-out session). A real upload/variant/
        default library, wired into the invoice letterhead, emailed invoice, and job report cover — fixed
        a real live bug where the report's colored header bar flattened every logo (including full-color
        ones) to a white silhouette. Merged and pushed.

## Phase 32 — Calm, accessible product-system pass (UX audit, 2026-09-28)

Queue after the remaining call-flow/booking work. Goal: decluttered simplicity without removing a capability. Keep the one-teal brand, role/tenant guards, manual-send gates and voice-tool contracts. Audit basis: implemented company shell, Dashboard, Calls, Pipeline, Calendar, Jobs, Field, Library/Customers, Settings, Team, shared UI, and existing 375/1280 e2e specs; benchmarked against Nielsen heuristics, Apple/Material interaction guidance and WCAG 2.2 AA. **Visual evidence:** the seeded roofing owner flow was inspected at 1440×900 and 390×844 before and after the local call-to-cash scenario; the harness was then stopped. **Junior execution specification:** `MASTER_PLAN.md` → “Phase 32 execution specification — screen and security audit, T-157–T-171”; it describes each observed screen and implementation path in words so workers do not need the auditor's screenshots or chat. Read that spec for the assigned task before code and re-run its specified browser checks before accepting it.

- [x] **T-157 — (deployed 2026-09-29 — see the Phase 32 stream table) Small, enforceable visual-and-feedback system (P1).** Evidence: company screens/components contain roughly 1,100 inline `style={{...}}` uses, including one-off colors, spacing and surface rules; `globals.css` has useful tokens but is not the single source of truth. Do **not** bulk-convert every local style. Inventory repeated patterns, add semantic tokens/primitives only when they have at least two consumers (page actions, quiet metadata, state notice, compact section header, responsive action row), and migrate high-traffic Dashboard/Calls/Pipeline/Calendar/Jobs plus shared UI first. Leave data-driven geometry/local layout inline. Define paired state background/border/text tokens, preserve industry accents, keep one primary action per common state, reserve danger styling for destructive actions, and remove redundant nested panels only where headings/spacing retain grouping. Add a short usage note. Acceptance: no new arbitrary colors/spacing, automated token/contrast coverage, reviewed desktop+phone screenshots for a dense office page and dark Field screen, visible keyboard focus. No API/data/business/print changes.
  - **Review 2026-09-28 (P32-R7):** the paired state tokens already exist (`--c-{danger,success,info,warn,neutral}-{bg,fg,bd}`, `--ring`, `--r-*`); this task is adoption + the C-D spacing/control scale. Stream D.

- [x] **T-158 — (deployed 2026-09-29 — see the Phase 32 stream table) Accessible overlays and command search (P0/P1).** Evidence: Modal/Sheet are shared foundations, but CommandBar is a hand-rolled overlay without dialog semantics, focus containment/return, accessible search/result navigation, or an actionable fetch-failed state; some page dialogs are also bespoke. Create one lightweight overlay contract for Modal, Sheet, CommandBar and Calendar time/block dialogs: labelled dialog, modal semantics, initial focus, Tab/Shift+Tab containment, Escape/click-away behavior that preserves unsaved work, focus restore, scroll lock and visible 44px close control. Turn CommandBar into a labelled search dialog/combobox: Ctrl/Cmd+K, arrow + Enter results, announced loading/count/no-results/request-failed status, and client routing rather than hard navigation. Keep searches bounded/server-side at scale. Audit changed controls for semantic element, focus, icon name and form-error association. Acceptance: Playwright keyboard tests for open/close/restore, containment, Escape, arrows/Enter and injected fetch failure; manual screen-reader smoke; focused axe assertions only if dependency-free.
  - **Review 2026-09-28 (C-E):** Stream D builds the contract inside `Modal`/`Sheet`/`CommandBar` with optional props only; C1/C2 convert bespoke dialogs to them. Keyboard tests are testing-library unit tests in D; Playwright coverage is the integrator's.

- [x] **T-159 — (deployed 2026-09-29 — see the Phase 32 stream table) Navigation follows the workday (P1).** Evidence: desktop shows eight primary destinations before Team/Settings/Guide/Feedback; the mobile bar repeats shortcut icons and the menu. It is role/industry-aware, but first-time users must learn backend-shaped destinations. Validate against seeded roofing, dental, viewer and crew personas, then make **Today / Calls / Pipeline / Schedule / Work** the explicit primary sequence. Place Customers/Library in contextual **Manage**; Team/Settings/Guide/Feedback in labelled secondary/support. Mobile should expose the current task plus at most two high-frequency shortcuts; its menu remains the complete, scrollable source of truth. Retain all direct routes/deep links, role gates and the crew-only Field experience. Acceptance: route-role matrix proves no orphan; 375/desktop views show no duplicated nav; smoke owner/viewer/crew/dental; release/Guide note says where moved functions live.
  - **Review 2026-09-28 (P32-R9, D1):** renaming to Today/Schedule/Work is an owner decision (NH-30); default keeps the current labels and only regroups (Manage / Account / Help). Team is owner-only today, not staff. Stream C1.

- [x] **T-160 — (deployed 2026-09-29 — see the Phase 32 stream table) One clear calls-to-booking-to-calendar story (P1).** Evidence: Phase 31 records a phone booking twice in Calendar (left list and Phone bookings row), status wording varies by Dashboard/Pipeline/Calendar, and 24/7 time lists start at midnight. Choose one canonical unassigned-booking representation linking to the same detail. Define a shared display-state map for caller-facing booking state, office action and time context (requested/confirmed/past/after-hours) without changing engine fields. Sort slots by tenant hours/caller intent; only true 24/7 tenants may begin at midnight. Pending/success/failure/retry feedback must be clear and prevent duplicate submission. Acceptance: unit tests state map + ordering; e2e call/booked request → Pipeline → Calendar exactly once, past request, failed confirm/retry and 24/7 ordering; booking scenarios if scheduling changes, reviewed phone screenshots.
  - **Review 2026-09-28 (P32-R10):** the demo tenant is 24/7, so 24/7 lists start at the first slot ≥ 7:00 AM with "Show earlier times"; keep the time-anchored Phone bookings row and drop the left-list duplicate. `openTimes.ts` stays outside the Booking-change gate. Stream C1.

- [x] **T-161 — (deployed 2026-09-29 — see the Phase 32 stream table) Progressively disclose Job-record complexity (P1).** Evidence: `jobs/[jobId]/page.tsx` is a large multi-workflow screen where lifecycle tabs, field evidence, documents, pricing and destructive actions compete. First inventory owner/staff/crew/viewer actions; preserve numbered lifecycle tabs and deep links unless evidence says otherwise. Each tab leads with object/status, next legitimate action and one primary CTA. Move document options, pricing-source explanations, print/send variants and destructive edits into labelled More/Document options/detail surfaces, never icon-only hiding. Keep locked/sent recovery copy explicit. Extract presentational regions only when testability improves; no speculative data/API/print rewrite. Acceptance: before/after action inventory proves functions remain reachable with no added common-task clicks; tests draft/sent/no-price/no-email/viewer; office and Field 375px screenshots reviewed.
  - **Review 2026-09-28:** Stream C2, together with T-164's Job-detail bullet (one design, one owner of `jobs/[jobId]/**`).

- [x] **T-162 — (deployed 2026-09-29 — see the Phase 32 stream table) Responsive representations for dense data (P1/P2).** Evidence: global CSS relies on horizontally scrolling tables; Calendar's phone board is still constrained. Inventory Calls, Pipeline, Jobs, Customers, Team, Library and Admin Usage at 1440/1024/768/390. Retain the 2–4 decision fields; disclose secondary metadata in expandable detail/drawer. Define reusable compact list/table behavior with visible active filters/Clear and contextual menus for secondary row actions. For Calendar implement a phone-first agenda/day representation (or documented equally usable alternative) with time, assignee, booking state and next action without sideways scrolling; retain desktop-board power features and keyboard alternative. Acceptance: no 390px overflow, practical 44px targets, no role-safe data leak, e2e/screenshots of list/table/calendar phone+desktop.
  - **Review 2026-09-28:** company pages + Calendar agenda → Stream C1; Admin Usage → Stream D; Team cards → Stream C2 (T-168).

- [x] **T-163 — (deployed 2026-09-29 — see the Phase 32 stream table) Status, copy and error recovery sweep (P2).** Evidence: CommandBar silently swallows failure; labels mix abbreviations/internal-ish terms; local forms sometimes rely on placeholders/aria labels where visible labels reduce recall. Reuse PageError, EmptyState, BlockedAction and StatusChip rather than parallel patterns. Audit initial/background load, save/send/delete/upload, empty and blocked states: precise non-PII what/why/next messages; background failure never erases usable content. Standardize visible labels, required indication and field-associated errors; preserve correction/manual-send/legal gates. Add a small industry-aware glossary for booking/request/lead/inspection/job/crew/after-hours and apply incrementally, not a risky global replace. Acceptance: negative load/save/send/duplicate-submit tests; changed empty/blocked states answer what/why/next; keyboard-accessible errors.
  - **Review 2026-09-28 (C-F):** shared components, `FormField`, `InlineNotice` and the glossary → Stream D; each page owner (C1/C2) applies the words and states on its own pages. No persisted field or voice-tool name changes.

- [x] **T-164 — (deployed 2026-09-29 — see the Phase 32 stream table) Roofing first-run and request-review hierarchy (P1; visual audit evidence, 2026-09-28).** Tested locally as the seeded roofing owner at 1440×900 and 390×844, both before and after the emulated call-to-cash scenario. Fix the specific observed issues before general restyling:
   - **Mobile app bar:** it shows six icon-only shortcuts (Add, Calls, Calendar, Jobs, Team, Menu). Even with accessible names, this makes users recall icon meanings and duplicates navigation. Keep the visible primary creation action plus Menu; retain at most one contextually justified shortcut, with a visible label/tooltip where space permits. The Menu must remain the complete route list, current route must be apparent, and no role/industry route may be lost.
   - **Dashboard:** the seven-row “Get your business ready” checklist fills the first phone viewport and pushes Today’s Work below the fold. Show progress plus only the next incomplete action by default; let users expand the remaining steps and retain Hide/Continue. Do not conceal urgent calls, bookings, escalation alerts or a checklist failure behind it. On desktop, constrain the empty dashboard’s reading width so the checklist is purposeful rather than a very wide bordered slab.
   - **Pipeline request card:** a confirmed booking with a Job already created still presents four same-weight stacked actions—Review request, Call Back, Create Job and Cancel. Make the current legitimate next action primary; demote secondary actions to a labelled More menu; replace Create Job with Open job after successful creation and make it impossible to accidentally duplicate/cancel a converted request. Preserve manual review and cancellation safeguards. The phone card must retain booking time, customer/contact context and its one next action without forcing a long scroll.
   - **Jobs list:** at phone width Export CSV, Field view and New Job carry equal visual weight above six status filters. Keep New Job primary, move Export CSV to a labelled overflow, and show Field view contextually (or as a secondary link) without reducing field access. Preserve search and filters; show the active status/filter state and a clear reset affordance.
   - **Field no-job state:** the screen accurately says “No jobs for you today,” but then presents a large inactive microphone and disabled Photo/Finding controls that read as broken actions. Replace the inactive action cluster with one concise explanation and the recovery path (“ask the office to assign a job”); retain the useful time-clock action and distinguish its enabled/disabled state clearly.
   - **Job detail, mobile:** the compact lifecycle is strong, but customer metadata, QR/link actions, lifecycle, nine tabs, locked-document notice and update card all compete in the first viewport. Apply T-161’s progressive-disclosure rules here first: compact customer/contact summary, contextual link/QR menu, current-tab/next-step priority, and one concise lock notice. Do not hide the status, sending/locking evidence, or deep links.
   - Acceptance: extend the relevant Playwright specs to assert the no-duplicate job state, next-checklist-only default/expand behavior, mobile shortcut count and all retained routes, then review screenshots for Dashboard, Pipeline, Jobs, Field and a sent/invoiced Job detail at 390px and 1440px. Run `e2e:call` because the request→job state is touched; run booking scenarios if scheduling behavior changes.
  - **Review 2026-09-28 (P32-R10):** partly stale — the Pipeline already shows "Open job" when `jobId` is set and `/api/jobs/from-request` writes `jobId` back to the request and its siblings; reproduce before changing the conversion path. Split: Job-detail bullet → Stream C2; everything else → C1 (with T-168's checklist order).

- [x] **T-165 — (deployed 2026-09-29 — see the Phase 32 stream table) Make customer-facing documents deliberate, editable and easy to find (P1; visual audit evidence, 2026-09-28).** Inspected the populated roofing Job’s Quote, Report and Invoice tabs at 1440×900 and 390×844 after the real local call-to-cash flow. The current Quote exposes its customer preview far below the internal line editor; “What the customer sees” is a small collapsed disclosure immediately above it. The preview independently lists Labor and Materials with per-line prices, while “Estimated total” is only a calculated line-item sum. On phone, the line editor is a dense row of tiny controls and the customer-preview choice is below the fold. The accepted Quote and paid Invoice are correctly locked, but that makes an undiscoverable pre-send choice impossible to recover from.
  - **Do not treat hiding materials as merely a CSS visibility toggle.** Add an explicit, draft-only **Customer version** panel at the top of Quote and Invoice, beside the customer-visible total and before internal line editing. It must state plainly: “This controls what your customer receives; your internal line items remain visible only to your team.” Its preview link should scroll/focus the actual customer document; do not make admins hunt for a collapsed disclosure.
  - Provide customer presentation choices that preserve function: **Itemized** (the current default), **Bundle materials** (one Materials subtotal, no material quantities/unit prices), and **Project price** (one customer-facing total, no labor/material breakdown). Do not promise a “hide materials” state that still reveals a material subtotal or per-line price elsewhere in on-screen preview, print/PDF, email HTML, or attachment.
  - When the admin selects Bundle materials or Project price, show an editable, currency-formatted **Customer-facing total** prefilled from the internal calculated total. The value is independent of internal line totals: show a quiet internal-only comparison (“Internal estimate $X · customer sees $Y”), an explicit **Reset to calculated total** action, and an optional internal-only explanation for a variance. Never silently overwrite a manually set total after a line edit; instead mark the internal estimate changed and offer the reset. Validate non-negative, finite currency, tax/discount arithmetic and server-side ownership; retain the existing manual-send/locked-document gates.
  - Persist a customer-presentation snapshot with each draft and carry it Quote → Invoice intentionally. Accepted/sent/paid documents remain immutable; a new revision/draft, never an in-place mutation, is required to correct a customer-visible price. Keep the report price-free unless its existing “Include quote” choice is explicitly enabled, in which case it must render the same saved customer presentation—not a fresh internal breakdown.
  - Simplify the document tabs without removing content: on desktop, keep the lifecycle bar but group Activity/Photos/Materials/Labor as **Job details** and Findings/Quote/Report/Invoice as **Documents**; on phone, make both groups horizontally reachable with the active tab pinned/announced and no hidden ninth-tab trap. In each document tab, lead with status + one next action (Draft/Save/Send or Sent/Print/Mark paid); secondary Print/Regenerate/QR/link actions live in a labelled More menu. Explain locked state once, in the document’s action area.
  - Apply the same visible **Customer version** convention to Report: its customer output is price-free by default, and its “What the customer sees” disclosure should name the actual outcome (“No prices included” or “Includes accepted quote total”) rather than hiding the key decision behind a generic caret.
  - Acceptance: unit tests for all presentation modes, variance/reset behavior, Quote-to-Invoice snapshot inheritance, and server rejection of invalid totals/cross-tenant changes; e2e creates a draft quote, switches each mode, edits a customer-facing total, checks browser preview + captured email/PDF text, accepts/sends it, and proves it locks; desktop and 390px screenshots of Quote, Report, Invoice and the mobile tab groups are reviewed. Include negative keyboard/focus assertions for the Customer version controls. This task changes billing/document behavior, so run `e2e:call` on the merged batch; no booking engine scope.
  - **Review 2026-09-28 (P32-R6, C-C, D2/D3/D10):** "Bundle materials" is the existing `hideMaterials`; `hideLabor` must stay available. Quotes have no tax/discount; invoices do. No quote→invoice carry-over and no revision flow exist today. A typed Project price is stored beside the calculated subtotal and becomes the one total the customer sees (no second total). Stripe is not involved (Luxor admin invoices only). Stream C2.

- [x] **T-166 — (deployed 2026-09-29 — see the Phase 32 stream table) One understandable superadmin workspace and an honest client inventory (P1; visual audit evidence, 2026-09-28).** Inspected the actual local superadmin Clients, Demo Studio, Onboarding and Playbooks screens at 1440×900, alongside the owner’s production screenshots. The problem is information architecture, not lack of features: the Admin sidebar exposes Demo Studio/Playbooks *and* “Open Hub,” which opens a visually identical second shell; all seeded demo/test tenants look like real clients; the summary and global action still say Vapi even though ElevenLabs is the active demo provider.
  - **Unify the shell, not every workflow into one giant page.** Retire the separate Hub chrome: render Demo Studio, onboarding and playbooks under the existing Admin shell and preserve `/hub/*` as redirects/deep links only. Use a compact Admin navigation with Client accounts, Operations (Demo), Usage & billing, and Resources (Onboarding/playbooks). “+ Client” launches the onboarding wizard; “Launch demo” opens Demo Studio in the same shell. Keep routes distinct for URL/share/back-button behavior—do not stack forms or make one endless admin screen.
  - **Make client provenance unmistakable.** Add a server-owned, non-editable lifecycle/purpose classification (Client, Demo, Test, Archived) plus optional environment/source metadata. Default the client list and headline count to actual Client accounts; show Demo/Test in a visible filter or collapsed “Demo & test data” group. Do not guess from the name, auto-delete records, or alter tenant/phone routing; create a one-time migration/review list for existing rows such as `Carlita Roofing (ElevenLabs test)` and `* Demo`. Every row needs a human-readable “why it exists” label and a last activity/owner signal.
  - Replace the obsolete “Vapi active / Needs Vapi / Vapi assistant” metrics and table column with provider-neutral **Phone line**, **Voice provider**, **Connection state**, and **Purpose**. Show whether it is a real/dedicated number or shared demo line, but never show secrets or raw provider IDs in the default list. The Vapi persona-sync operation becomes provider-aware, appears only for eligible Vapi clients, and moves into Advanced/connection details; it must not imply that every client needs Vapi or that clicking it affects ElevenLabs tenants.
  - Surface the two demo numbers deliberately: **US demo** `+1 (689) 204-2643` and **Canada demo** `+1 (778) 907-9769`, each with country, assigned tenant, readiness and last-test status. First complete T-130’s app-side Additional phone number/configuration and live-call verification; until then label Canada as “provisioned—awaiting app connection,” never Ready. Do not fabricate a working status from Twilio ownership alone.
  - Keep superadmin safety: existing server-side `verifySuperadmin`, tenant scoping, demo-reset guards and manual provider-apply semantics remain unchanged. Acceptance: route redirect/deep-link tests; admin e2e proves default client inventory, filters, purpose badges, no Vapi wording for ElevenLabs-only tenants, and both number states; desktop/phone screenshots reviewed; a migration dry-run produces no writes until explicitly approved.
  - **Review 2026-09-28 (P32-R8, C-A, D6/D7):** keep the `/hub/*` URLs and page files — unify the chrome only (hub layout renders the Admin shell); `/hub` redirects to `/hub/demo`. `demo-roofing` is server-derived Demo; every other tenant starts Unclassified and stays in the default Clients view until the owner approves the mapping. Server field + dry-run script → Stream I; UI → Stream D.

- [x] **T-167 — (deployed 2026-09-29 — see the Phase 32 stream table) Turn Demo Studio and Playbooks into a five-minute, current runbook (P1; visual audit evidence, 2026-09-28).** The rendered Playbooks iframe contains an exhaustive 20-minute narrative, multiple giant industry tables, troubleshooting internals, legacy Vapi references, and hard-coded `ai-roof.vercel.app` URLs while the live product is `crm.luxordev.com`. It makes the operator scan a manual instead of helping them demonstrate the product. Demo Studio simultaneously says “20-minute demo” and exposes a technical raw missing-config key in the local state; its phone/status card does not clearly distinguish the US and Canadian demo lines.
  - Replace the default playbook with a one-screen **Run a demo in 5 minutes** checklist: choose prospect/industry → launch → call the selected line → open Calls/Pipeline → open the prepared job → show Field → show Quote/Invoice. Each step has one sentence, a visible expected result, one safe button/deep link, and a compact “if this fails” recovery link. Keep the longer scripts, all-industry reference, provider troubleshooting, pitch deck and onboarding material as searchable secondary resources—not the first rendered document.
  - Use one canonical URL source for every visible/copyable product link, QR code and guide. The user-facing default must be `https://crm.luxordev.com`; legacy `ai-roof.vercel.app` is retained only as an explicitly marked operational fallback if still required. Add a CI/content check that fails on an unapproved old production URL in active guides. Do not expose localhost/test URLs outside the e2e harness.
  - Reword readiness failures for operators: “Demo calling is not ready—open connection details” first; show raw missing-env/provider-key field names only in a protected advanced diagnostic panel. The primary Demo Studio card must state selected industry/company, selected line/country, readiness, last verified test, and the next safe action. Keep the existing reset confirmation/allowlist and do not make Reset prominent beside Launch.
  - Reconcile the demo duration: default five-minute path; optional 20-minute deep-dive explicitly labelled as such. Remove stale claims and links rather than merely adding a correction footer. For the Canada line, link the exact prerequisite/verification state from T-166/T-130, then provide a dial/copy action only once it is ready.
  - Acceptance: content inventory proves all active guide links use the canonical URL; browser e2e walks the five-minute checklist without reading a long iframe; visual checks at desktop/390px confirm launch status, a blocked state and US/Canada line states are understandable; link tests cover redirects and copied URLs. No provider dashboard writes or line reassignment in this task.
  - **Review 2026-09-28 (P32-R11):** 19 old-domain links in `onboarding-guide.html` + 1 in `pitch-deck.html`; use `getAppUrl()`. The live ElevenLabs tool URLs intentionally stay on `ai-roof.vercel.app` — the URL check covers user-facing guides only. Line status comes from contract C-B; show "Status unavailable", never Ready, until Stream I merges. Stream D.

- [x] **T-168 — (deployed 2026-09-29 — see the Phase 32 stream table) Give every company owner a calm People & company-setup experience (P1; visual audit evidence, 2026-09-28).** Inspected the actual roofing owner’s Dashboard, Team, and Settings at desktop and 390px. The capabilities exist—invite, role edit, disable, seats, crew link, QR emergency revoke, setup checklist—but the owner must translate a dense member table and a long settings form into their own mental model. On phone, the Team table becomes a very tall stack of repeated labels; Settings starts with invoice prose and Florida legal notices, while phone/messaging, hours, and the team link are scattered or below the fold.
  - **Make “People & access” the owner’s clear home for staff administration.** Keep the existing `/company/team` deep link, server checks, role model, tenant scope, last-owner guard and QR-revoke semantics. Redesign its default view as a compact roster with Active, Invited, and Disabled states, a visible seat count, search/filter only when it earns its space, and one dominant “Invite person” action. A row/card should answer at a glance: person, email, plain-language role, crew(s), access state, invitation/last-sign-in signal, and the next safe action. Desktop may use a table; 390px must use purposeful member cards—not a transposed desktop table.
  - **Turn the invite and edit flow into a short decision, not a permissions quiz.** Collect name, email, and role first; make crew assignment an optional, plainly explained next step. Replace implementation-flavoured labels such as generic “Type” with “Role,” and provide a short, always available comparison: Admin (runs the company), Office staff (calls/bookings/jobs), Inspector, Technician/field, and View only. A change-role review must say exactly what will change before save. Do not silently promote a user, permit cross-tenant changes, or expose a role the current owner is not authorized to grant.
  - **Make restriction/recovery obvious and safe.** Present Disable access, Re-enable, Resend invite, and Cancel invite only when their state allows it; explain the consequence in human language and use confirm/cancel for an access removal. Show why an action is unavailable (for example, the last active admin cannot be disabled) instead of simply hiding it. Keep audit-relevant identity/status data and the existing emergency “Revoke all field QR links” action, but move that destructive all-crew action into a clearly marked Security/Field access section with its scope and recovery path stated before confirmation.
  - **Separate everyday company setup from document/legal configuration.** Reorganize Settings into small navigable sections or routes: Company profile, Hours & timezone, Phone & notifications, Documents, Terms & notices, and Advanced. The first owner session and Dashboard’s existing “Get your business ready” checklist should lead in the operational order: confirm line → hours/timezone → services/prices → crew/team → logo → test call; each item has one verb, a one-sentence outcome, and one destination. Keep document/legal wording protected and explicitly draft/review-gated, but do not make it the first thing a newly provisioned company admin sees. Preserve unsaved-change warnings and immediate-effect copy where it is true.
  - **Make ownership boundaries legible.** The owner needs to know which changes they can make themselves and which require Luxor (for example, a managed phone-line change), with one contextual “Contact Luxor” escape hatch—not a blanket instruction that sends normal configuration work to support. Add a concise Phone & notifications status that distinguishes email notifications, SMS availability, selected business line(s), and any action awaiting Luxor/carrier approval. This must consume the safe readiness state from T-169 rather than claim texting is enabled.
  - **Acceptance:** owner can invite, alter role, restrict, re-enable, resend/cancel an invitation, and reach crew assignment with no training; all unsafe/unauthorized/last-admin cases have explanatory blocked states. Cover owner, office, technician, viewer, disabled and pending-invite access with negative authorization tests; assert tenant isolation and QR-revoke confirmation remain intact. Add browser flows for new-owner setup plus Team desktop/390px and review screenshots for card readability, keyboard focus, error recovery and no horizontal scrolling. Do not weaken `verifyRole`, Firestore rules, businessId scoping, or manual send gates.
  - **Review 2026-09-28:** no new server capability is needed — Resend invite (`/api/company/team/[uid]/resend`) and Disable/Enable (`PATCH active`) exist; "Cancel invite" is the same `active:false` call with invite wording. Team + Settings → Stream C2; the Dashboard checklist order → Stream C1; Phone & notifications reads contract C-B.

- [x] **T-169 — (deployed 2026-09-29 — see the Phase 32 stream table) Send verification texts from the exact demo line the caller dialed (P1; routing and readiness backlog, 2026-09-28).** Product requirement: a caller who dialed the US demo line **+1 (689) 204-2643** must receive a verification/confirmation text from that US line; a caller who dialed the Canadian demo line **+1 (778) 907-9769** must receive it from that Canadian line. Route by the *called inbound number*, normalized to E.164 and retained on the authoritative call/request/appointment record—not by the caller’s area code, locale, profile country, or a guessed default. A Canadian caller who dials the US line therefore receives a US-line message, and vice versa.
  - Create one server-owned, tenant-scoped line capability record/lookup for each inbound number: country, voice assignment, approved SMS sender identity, SMS readiness (`not configured`, `pending registration`, `ready`, `blocked`), and allowed message purposes. Carry the selected called line through booking/verification creation to the outbound SMS seam, and require the outbound `from` to be that exact approved line. Do not silently fall back to another country’s number, a shared unrelated sender, or an unverified `from` address; when no exact eligible sender exists, send nothing and return a clear operator/customer-safe fallback path (email or call as appropriate) with an auditable reason.
  - Keep SMS disabled until the compliance prerequisites are actually met. US activation is blocked on **NH-29** (A2P 10DLC brand/campaign/Messaging Service approval and explicit owner approval); Canada needs a read-only provider capability/registration verification for the Canadian number before its status can become Ready. T-130’s app-side additional-number configuration and live inbound-call test are prerequisites to representing the Canadian path as connected. No provider dashboard write, sender reassignment, live text, or environment-flag flip belongs in this task without the owner’s separate approval.
  - Add a compact, non-technical **Phone & notifications** status in the company-owner experience and the demo/admin views: each line’s country/number, inbound connection state, SMS status, and the next safe action. If a controlled test-message capability is later enabled, it must require an explicit destination and selected ready line, show the exact sender before send, respect consent/STOP handling and rate limits, and record actor, tenant, purpose, called line, sender line and outcome. Never expose provider credentials or let a tenant select another tenant’s line.
  - Preserve the existing texting module’s manual send gates, opt-out/consent rules, businessId scope, booking behavior, and provider contracts. Treat phone line + sender selection as security-sensitive configuration: validate E.164, reject a line belonging to another tenant, reject missing/disabled/pending senders, and log a non-secret failure reason. Add migration/read-only inventory tooling before any data backfill; it must produce no writes until explicitly approved.
  - **Acceptance:** unit/route tests prove US-called → US-sender and Canada-called → Canada-sender, including contradictory caller-country fixtures; prove unknown, disabled, pending, cross-tenant and malformed-line cases send no SMS and surface the defined fallback. E2E uses the local SMS/outbox seam only (never a live send) to trace called line through call → booking/verification → sender; snapshots show truthful Pending/Ready/Blocked states at desktop and 390px. After the separate carrier approvals and owner authorization, the integrator performs one controlled real send from each ready number and records the sender/recipient evidence without exposing phone-number credentials.
  - **Review 2026-09-28 (P32-R4, D4/D5):** the dialed number is already stored for ElevenLabs calls (`conversationRecords.calledNumber`) but never reaches the appointment; three `sendSms` callers (booking-received in `toolDispatcher` — Booking-change gate —, office Confirm, inspector notice). The T-156 Canadian delivery came from the env fallback sender, not the Canadian line. The fallback is removed; no dialed line → the tenant's default sender, if Ready. Production `SMS_ENABLED` state unverified. Stream I.

- [x] **T-170 — (deployed 2026-09-29 — see the Phase 32 stream table) Make tenant isolation and superadmin elevation provably fail-closed (P0; authorization audit, 2026-09-28).** Current server API authorization is strong in the core path: `verifyAuthAndRole` resolves the authenticated user’s single `businessUsers/{uid}` membership and requires its `businessId` to equal the requested tenant; `verifySuperadmin` trusts only the verified Firebase custom claim; client Firestore writes to business/user/phone records are denied or superadmin-only. However, Firestore rules still accept `businessUsers/{uid}.superadmin == true` as a fallback while server APIs do not. That split is an elevation-risk maintenance trap even if ordinary client users cannot write the field today.
  - Establish one canonical superadmin authority: a verified Firebase custom claim issued only through a deliberately protected, audited operator procedure. Remove the Firestore document-field fallback after a read-only migration audit confirms every real superadmin has the claim. A `businessUsers` document must never by itself confer platform authority; a stale `role: "superadmin"` or `superadmin: true` field is displayed/sanitized as non-authoritative and cannot unlock the admin shell, Firestore records, or API routes.
  - Replace the broad one-off elevation script with an explicit least-privilege procedure: require an exact approved UID/email target, an interactive typed confirmation, a reason/ticket field, and an append-only audit event; refuse bulk input, client-tenant accounts, and ambiguous/email-only matches. The operator must explicitly refresh the target token and verify the claim before success is reported. Do not put a superadmin allowlist, credentials, or owner email into client code. Any emergency break-glass path needs the same auditability and a separate owner-approved task.
  - Treat `businessId` from a URL/query/body as untrusted on every company route. Inventory all `/api/company`, `/api/jobs`, `/api/businesses`, documents, calls, appointments, library, export, and field routes; each must derive/revalidate tenant authority at the server boundary before reads/writes. Superadmin preview is a read context selected by a verified superadmin only—not a grant of membership or a way for a company user to set `preview`, `businessId`, role, `active`, seat limit, sender line, or provider configuration for another tenant. Preserve the signed field-session model and its job scope; do not turn it into general tenant access.
  - Ensure invitation and account-management paths can create only the five normal tenant roles and only inside the caller’s own tenant. Client owners may manage their own members but cannot mint owner access in another tenant, create/modify a platform admin, alter custom claims, or modify `businessPhoneNumbers`; disabled users must immediately fail new API calls after token revocation. Keep last-active-owner protection and ensure a user cannot hold accidental conflicting tenant memberships without an explicit, audited platform migration.
  - **Acceptance:** negative-first tests cover unauthenticated, forged/stale document `superadmin`, missing/wrong/refreshed custom claim, client-owner/admin/staff/viewer/crew attempts against every admin route, foreign `businessId` on representative route families, cross-tenant object IDs, disabled accounts, and preview-query tampering. Firestore rules emulator tests prove direct reads/writes are denied across tenants and that only a genuine custom-claim superadmin can reach platform-only collections. Add an authorization route inventory/CI check so a newly added API route cannot bypass the central guard; browser e2e proves each seeded role sees only its permitted tenant and screens. This is a security task: review the final diff and deploy only after the full auth/rules gate, with no compatibility bypass left enabled.
  - **Review 2026-09-28 (P32-R1–R3):** the rules fallback is a live exposure, not only a trap — NH-28's stale `superadmin: true` doc grants direct Firestore superadmin today. Also: three admin routes take the audit actor from the request body; `verifyIdToken` does not check revocation (a removed claim lasts ≤ 1 h); `provision-superadmin.mjs` also writes `businessId: "demo-roofing"`; `@firebase/rules-unit-testing` is not installed. Stream I, first.

- [x] **T-171 — (deployed 2026-09-29 — see the Phase 32 stream table) Onboard a client phone line without touching the shared demo (P0/P1; operating playbook + guardrails, 2026-09-28).** A client onboarding form currently creates the tenant, an owner login, and an inactive `businessPhoneNumbers` record, but a safe live cutover needs an explicit line-assignment workflow. The shared `demo-roofing` agent/US+Canada numbers are for prospects and must never be repointed, renamed, reset, or used as a new client’s fallback.
  - Make the default decision explicit before provisioning: **new dedicated number**, **customer-owned number forwarded to a dedicated Luxor/voice-provider number**, or **port-in**. Record ownership, country, provider, intended tenant, consent/recording obligations, and cutover/rollback contact. Do not accept a number merely because it was typed into onboarding; normalize to E.164 and perform a server-side collision check across all primary, additional, demo and pending mappings. A collision, missing provider capability, or ambiguous ownership is a blocked state—not a best-effort assignment.
  - Provision/configure the new line as a tenant-specific voice assignment (dedicated agent/provider connection or a safely isolated per-call configuration), then create exactly one active, server-owned inbound-number mapping to that tenant. Store a lifecycle such as Draft → Provisioned → Connected → Test passed → Live → Retired, display its next safe action, and make activation a separate confirm step after an inbound test proves the call appears only in that tenant’s Calls/Pipeline. Never add a client line to `demo-roofing.elevenlabs.extraPhoneNumbers`, reuse the demo agent configuration, or run Demo Studio reset/customization against a client tenant.
  - Preserve prospect demos as their own classified tenant/line set: demo launch/reset has an allowlist that remains limited to the demo tenant; production client create/edit screens cannot select a demo line; client phone changes require the same verified superadmin and audit trail as other platform routing changes. Add read-only preflight and a dry-run diff before any line mapping write; require a clear rollback that restores the prior mapping/forwarding without deleting a tenant or losing call records.
  - Give the new company owner a simple handoff only after the platform operator marks the line Test passed: sign-in link, what the assistant answers, their public/business number, who can change it, and the next self-service setup steps. Do not show provider IDs, raw webhooks, or another client’s phone details. Link owner-facing SMS readiness to T-169; do not promise confirmation texting until its exact sender line is Ready.
  - **Acceptance:** unit/route tests reject duplicate, cross-tenant, demo-line and malformed mappings; prove demo reset/launch cannot write client configuration and client edit cannot mutate the demo tenant. Local e2e creates a client in Draft, completes a simulated inbound call only after explicit activation, then proves calls/data remain absent from demo and all other tenants; test rollback preserves records and restores the prior route. Run a controlled production cutover only after owner approval: capture preflight/dry-run, one inbound call, tenant-visible call record, outgoing caller-ID verification, and rollback owner. No live provider/number action is authorized by this task’s implementation alone.
  - **Review 2026-09-28 (P32-R5, C-B):** keep the existing config-route 409 conflict check and the `DEMO_BUSINESS_IDS` allowlist; the gaps are the create route's unchecked `businessPhoneNumbers` write, no demo reservation, and no lifecycle/test state. `businessPhoneNumbers` is not read by call routing, so it becomes the line registry shared with T-169. Stream I.

**Execution (integrator review, 2026-09-28 — supersedes the old one-task-per-branch order).** Four file-disjoint streams start together; each stream's work order, owned files, contracts and decisions are in `MASTER_PLAN.md` → "Phase 32 review — verified corrections, decisions, contracts and stream work orders" (P32-R/D/C/S/T). Prompts: `docs/WORKER_QUEUE.md` section **J**. Merge order: I first, then D/C1/C2 as they finish. Workers run only tsc + changed-file eslint + unit tests for new pure logic (owner, 2026-09-28); the integrator runs every browser/e2e/rules/booking gate (P32-T).

| Stream | Agent | Worktree · branch | Tasks (in order) | Status |
|---|---|---|---|---|
| I | Integrator — Claude Opus 5.5 | `D:\Apps\air-wt-p32-authority` · `task/p32-authority` | T-170 → T-171 → T-169 (+ contracts C-A account purpose, C-B phone-line registry) | **deployed 2026-09-29** (`592d0ee`, `f9849b5`, `75e2fe4`, `9df5334`; merge `b385e5d`; `firestore:rules` released) |
| D | Deepseek V4.1 Flash, Thinking: Hard | `D:\Apps\air-wt-p32-system` · `task/p32-system` | T-157 → T-158 → T-163 (shared parts) → T-166 (UI) → T-167 (+ T-162 Admin Usage) | **deployed 2026-09-29** (merge `cf1d2bc` + integration `f930ed4`) |
| C1 | Codex GPT-6 Sol, medium | `D:\Apps\air-wt-p32-workday` · `task/p32-workday` | T-159 → T-164 (all but Job detail) → T-160 → T-162 (company pages + Calendar agenda) | **deployed 2026-09-29** (merge `53a7a77`; integration fix: a Crew login keeps Feedback). Open question answered: Customer cards show total jobs (no open-jobs count in the slim API) — accepted |
| C2 | Codex GPT-6 Sol, medium | `D:\Apps\air-wt-p32-documents` · `task/p32-documents` | T-161 + T-164 Job-detail bullet → T-165 → T-168 (Team + Settings) | **deployed 2026-09-29** (merge `82666ed`; Settings now imports the shared `PhoneLineView`). Known limits: selecting a Job tab does not update `?tab=` (links still open the right tab); no quote revision flow (D10) |

**Final-tree evidence (2026-09-29, local main after C1 + C2 + `945e123`):** full vitest green (2 import-heavy suites needed a longer timeout under load); `next build` green; `npm run e2e:call` 12/12; full Playwright 141 passed / 2 failed (spec strictness, fixed, green alone) / 5 skipped. Real regressions the merged run caught and `945e123` fixed: phone Calendar agenda never loaded other weeks; closed More menus overflowed Jobs (desktop) and Team (phone); two primary buttons on an empty Jobs list; Team lost its role comparison and "Just you so far". **Merged-state evidence (2026-09-29, local main `f930ed4`):** full vitest 1,733 passed / 0 failed; `next build` green;
`npm run test:rules` 9/9 (4 of them fail on the old rules); `e2e/phase32-admin.spec.ts` + `admin-setup.spec.ts` 37 passed
(desktop + phone, phone screenshots read). Integration fixes at merge: client list uses the server's `accountPurpose`;
Demo Studio always shows both demo numbers ("Not connected in the app yet" when unregistered); Deepseek's
IMPLEMENTATION_LOG entry re-encoded (its writer turned "—"/"→" into "�"/"?" and altered one older line — reverted);
"New client" no longer shows a doubled "+". Still owed: `e2e:call` after C1 + C2 merge; full `e2e:test` before push;
after deploy — `firebase deploy --only firestore:rules`, the ElevenLabs agent test for the booking wording, one real call +
transcript read (Booking-change gate).

Gates: `test:rules` 9/9, the booking scenario suite, `e2e:call` 12/12 and full `e2e:test` all ran before the push (evidence below). **Still owed after deploy:** one real booking call + transcript read (Booking-change gate for T-169's `toolDispatcher` change) — the owner's call. Live SMS enablement stays blocked on NH-29 (US) and D5 (Canada); client line go-live needs owner approval per line (T-171).

## Phase 33 — Roofing hardening + Nielsen audit follow-ups (2026-10-03)

Source: `docs/USABILITY-AUDIT-2026-10-03.md` (the ⚠️ items). The audit's fixes are on branch `ccr-8c0916c7-3r7kkm`
(not merged/deployed). Each task below is small and independent. **How to do one:** read its audit-doc paragraph,
change only the files named, keep "one primary action per card/screen" (T-144/T-164), then run `npx tsc --noEmit`,
eslint on changed files, `npx vitest related <files>`, and on the harness (`npm run e2e:up:bg`, then `npm run e2e:call`
to fill the screens) `npx playwright test e2e/screen-audit.spec.ts` **plus** the changed screen's own spec; read the
phone screenshot `test-results/screens/phone/audit-<screen>.png`. Mark `[x]` with the commit.

- [x] **T-172 — (done `b3fada4`, 2026-10-04) Calls: one way into a call (H8).** Phone call card shows "Open call", "Details" and "Booked · open in
  Pipeline". Keep "Open call" as the only button; move the Pipeline link inside Details. File: `src/app/company/calls/page.tsx`.
  Accept: one button per card at 375 px; `e2e/call-flow.spec.ts` + `e2e/call-to-cash.spec.ts` green.
- [x] **T-173 — (done `b3fada4`, 2026-10-04) Calls: hide the classifier's internal reason line (H8).** The "[…] Caller provided contact info…" line
  under the outcome badge is internal; show it to superadmin only. File: `src/app/company/calls/page.tsx`.
- [x] **T-174 — (done `df33e46`, 2026-10-04) Job page: no duplicate field-note content (H8).** Activity shows each note's parsed chips and the Work log
  repeats the same lines. Collapse a note's chips behind "View parsed" (keep the AI-parsed badge and View original).
  File: `src/app/company/jobs/[jobId]/page.tsx` (`ParsedUpdateCard`). Accept: `page.test.tsx` + `e2e/call-to-cash.spec.ts` green.
- [x] **T-175 — (done `b3fada4`, 2026-10-04) Calendar: "Manage crews" icon (H4).** Uses a + (add) icon for a manage link; use a Users icon.
  File: `src/app/company/calendar/` header. Accept: `e2e/crews-calendar.spec.ts` green.
- [x] **T-176 — (done `df33e46`, 2026-10-04) Field QR: no install banner on an inactive link (H8).** Hide `<InstallPrompt />` while `accessDenied`.
  File: `src/app/field/page.tsx`.
- [x] **T-177 — (done `b3fada4`, 2026-10-04) Library tabs on a phone (H8).** Five tabs wrap 2+2+1 with "Work catalog" alone. Make the strip one
  horizontal scroll row (like the job tabs) or a 3+2 grid. Files: `src/app/company/library/page.tsx`, `globals.css`.
- [x] **T-178 — (done `b3fada4`, 2026-10-04) Settings: sticky section switcher (H7).** Replace the "Jump to" select with a sticky chip row (Company ·
  Hours · Phone · Documents · Terms · Advanced) that highlights the section in view. File: `src/app/company/settings/page.tsx`.
  Accept: `page.test.tsx` green; phone screenshot shows the row pinned while scrolling.
- [x] **T-179 — (done `b3fada4`, 2026-10-04) Dashboard subtitle (H8, owner taste).** Subtitle repeats the tiles; drop it or replace it with the one
  next thing to do. File: `src/app/company/dashboard/page.tsx`. Cosmetic — ask the owner if unsure.
- [ ] **T-180 — (PLANNED, not built — see `docs/T-180-ACTIVITY-SIGNAL-PLAN.md`: it touches Booking-change-gate code that needs a real call; unnecessary once NH-32 is done) Live data without polling (perf, larger).** Polling is ~10x cheaper after the audit but still reads
  Firestore every 10–60 s per open screen. Add one cheap "anything changed?" signal (e.g. `lastActivityAt` on
  `businesses/{id}`, bumped by the call/booking/job writers) so screens re-fetch only when it moves. Touches many
  writers — write a short plan in `docs/` first. Optional if NH-32 (Blaze) is done.

- [x] **T-181 — Field updates: which job, who, and a clear time clock (owner, 2026-10-04; done `df33e46`).** One
  `FieldNoteComposer` for both field screens (job + author printed before talking, wrong-job warning when clocked in
  elsewhere, receipt that names job + author, correction bound to its job, type option on both screens); server-side
  author (`resolveAuthor`: login name/uid, QR typed name required) stored as `submittedBy/submittedByUid/submittedVia`;
  collision-proof ledger ids; time clock in plain verbs with a running timer, today's
  total and a confirm on Clock out. Spec: `e2e/field-updates.spec.ts`. Second pass same day: `JobPicker` (search + 5 likeliest + Show all; finished jobs reachable, tagged Done; a sub from another crew finds the job), one-line target/so-far, Photo+Finding on one row, "office" not "shop", no refusal on finished jobs. Crew name on office note cards shipped
  (`submittedByCrewId`/`submittedByCrew`, 2026-10-04). Open follow-up: the per-member "who's on which job today" board.

- [ ] **T-182 — Pipeline declutter (C4/C6/C10, found 2026-10-04).** Collapse "Past & Cancelled" by default ("Show 25 past"), cap each section to ~10 with "Show all N", and merge each card's "Details" and "More" into one disclosure. Files: `src/app/company/pipeline/page.tsx`. Accept: phone screenshot with 30 bookings ≤ 3 screen-heights; `e2e/booking.spec.ts` + screen-audit green.
- [ ] **T-183 — Jobs list: the card is the link (C2/C6/C10).** Drop the per-card "Open job" button and "Details" disclosure; whole card opens the job, next step stays as one line; first 15 then "Show more". Files: `src/app/company/jobs/page.tsx`. Accept: ≤ 1 button per card, phone height at 30 jobs ≤ 3 screens, empty-states spec green.
- [ ] **T-184 — Calls list: one way in (C4/C6/C10).** One "Open call" per card, details inside; show newest 15 with "Show more". Files: `src/app/company/calls/page.tsx`.
- [ ] **T-185 — Admin client config: sticky section switcher (C1/C4, superadmin, low priority).** Reuse the Settings chip row. File: `src/app/admin/businesses/[businessId]/config/page.tsx`.
- [ ] **T-186 — Automate C2/C4 (guard).** Extend `e2e/screen-audit.spec.ts` to record primary-button count, interactive elements above the fold and phone height per screen, with budgets from `docs/SCREEN-CLARITY-HEURISTICS.md`, so clutter fails CI instead of an audit.

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

**Demo next week (2026-09-08 note):** of the items below, **NH-8** is the one actually worth doing before the
demo — it's the only residual gap the 2026-09-08 code review couldn't close by reading (a live click-through of
Calendar drag→confirm and a real-phone field QR + hold-to-speak). Everything else on this list is
production/legal sign-off, not demo risk — the roofing call→job→invoice path and owner-onboarding→team-invite
path were both traced end-to-end and confirmed connected/correct this session (see "Current snapshot" above).

| ID | Needed | Blocks | Notes |
|---|---|---|---|
| NH-1 | Vapi dashboard: confirm server-URL secret matches production; confirm assistant model/voice/7 tool schemas/retry/recording; remove any obsolete bypass-era console config; confirm `cancelAppointment` includes optional `confirmCancellation` and `appointmentNumber` without renaming legacy fields | Production sign-off | Console-only; the 2026-08-23 health check proves Vapi env configuration exists, not that dashboard values/schemas match |
| NH-2 | ~~Set Vercel `VAPI_WEBHOOK_SECRET`, `CRON_SECRET`, and `RESEND_FROM`~~ — production health reports Vapi, cron, and Resend configured (2026-08-23); runtime `VAPI_AUTH_BYPASS` behavior is absent | Closed for env presence | Exact secret matching remains part of NH-1; deliverability remains NH-3 |
| NH-3 | ~~Resend: verify `luxordev.com` sending domain~~ — domain verified in Resend (DKIM/SPF/DMARC present); production `RESEND_FROM` set to `Luxor CRM <crm@luxordev.com>` 2026-09-25, test email delivered. Remaining: read the headers of one test email (dkim/spf/dmarc=pass) | T-041 live verification | DNS access required |
| NH-4 | Legal/privacy: recording disclosure wording, retention windows, deletion policy, callback consent, emergency-message wording | T-042 sign-off (dev proceeds with 90d defaults) | Owner/legal |
| NH-5 | Product: confirm defaults D-1 (booking = requested time) and D-2 (demo isolation = in-code guards, same project) or override | T-030/T-035 final | Defaults proceed unless overridden |
| NH-6 | Decide whether `daily-call-summary` + `faq-suggestions` get scheduled in `vercel.json` | T-032 scope edge | Routes get secured either way. The "how many cron slots does Hobby leave free" sub-question is resolved (2026-09-03, T-065): Vercel's own docs confirm **100 cron jobs/project on every plan**, Hobby only caps *frequency* at once/day — slot count was never actually the constraint, so this is now purely a scheduling-cadence decision, not a capacity one |
| NH-7 | ~~GitHub branch protection on `main` (require CI green)~~ — **Done 2026-09-23** (owner OK): required check `gate`, `enforce_admins: false` (owner/integrator can still push directly), no force-push/deletion. Found while doing it: CI had been RED on 21 of the last 30 runs because `npm audit --audit-level=critical` flagged **Next.js itself** (RCE advisories GHSA-2xp9-vwfh-vxw4 / GHSA-p293-qw3h-jr36, fixed in >=15.5.24); upgraded 15.5.23 -> 15.5.26 (`f70ed1b`), CI green again. | Closed | firebase-admin v14 (T-062) is still the only open dependency debt (moderate/high, transitive) |
| NH-8 | Human click tests: calendar drag→confirm on desktop browser; `/field` QR + hold-to-speak on a real phone | T-030/T-034 acceptance | 10 minutes with the live app |
| NH-9 | Callback consent policy for pre-existing leads (auto-call grandfathered leads or not) | T-032 backfill | Default: existing leads are NOT auto-called |
| NH-10 | Official Luxor Developments LLC website: **found 2026-09-28 — https://www.luxordev.com is live** ("Luxor Developments", with `/english-privacy-policy` and `/english-terms-conditions`). Owner: confirm it is yours and may be linked from emails/guides; it needs the SMS clause for NH-29 | T-041/T-052 content, NH-29 | 2 min |
| NH-11 | Firestore TTL: enable collection-group TTL policies on `_vapiWebhookEvents.expiresAt` and `vapiAppointmentConfirmations.expiresAt` | T-010/T-011 deploy | Code writes server-clock timestamp fields; production TTL policy requires an authenticated console/gcloud deployment action by the integrator |
| NH-12 | ~~Decide whether a tenant-removal/deactivation capability should be built at all~~ — **Decided 2026-07-23: hold off.** No `DELETE` endpoint exists for businesses (verified 2026-07-21); owner confirmed not to build it now. Revisit only if the owner raises it again. | T-043 scope (closed) | If revisited, this is a new destructive admin capability (needs its own scoped task, confirm/allowlist semantics like T-035's demo reset) — not bundled into any email-only scope without fresh owner sign-off |
| NH-13 | ~~Owner to research/paste reference apps for visual direction~~ — **Closed 2026-09-05:** owner dropped a client-portal screenshot (`example image irrigation.png`, repo root, untracked — not moved into the app) showing a branded sidebar-nav portal with one confident accent color; T-056 shipped using it as direction. | T-056 (per-industry visual families) | Added 2026-09-01; see T-056's 2026-09-05 note for the palette actually shipped and the quick sign-off still worth doing |
| NH-14 | Add `STRIPE_SECRET_KEY` to Vercel's production env vars (T-080's code is deployed but the key was never set — `/api/health` confirms `stripe: "not_configured"` live) | T-081 | Needs the owner's Stripe dashboard access; not something the integrator can self-serve |
| NH-15 | Pick a real, confirmed-working Spanish voice in the Vapi dashboard's voice picker and test it on a real call; then set its provider, voice ID, and optional model in the superadmin business config page's Spanish voice fields | T-093 (Spanish) full completion | No code change is needed. Until a Spanish override is configured, the Español toggle leaves the live dashboard-selected voice untouched while switching the transcriber and prompt/greeting. |
| NH-16 | Real-phone/Vapi-dashboard verification for T-093 (Spanish): record a Spanish field note on an actual phone and confirm the ES→EN badge + invoice line items; set a business to Español and call the demo line, then check in the Vapi dashboard that `startSpeakingPlan`/`stopSpeakingPlan` survived the PATCH | T-093 gate table (Phase 6, `docs/PLATFORM-EXPANSION-PLAN.md`) | No phone/dashboard access in this sandbox — logic is unit-tested (transcriptEn fold guard, whisperPrompt, detectLanguage) but this specific live check has not been done |
| NH-17 | Finish the `crm.luxordev.com` domain move: add the GoDaddy CNAME record, add the custom domain in Vercel, add it to Firebase Auth's authorized-domain list, set `NEXT_PUBLIC_APP_URL=https://crm.luxordev.com` in Vercel per environment, and decide whether to repoint the Vapi assistant's Server URL (or leave it on `ai-roof.vercel.app`) | Phase 13 completion | T-095's code side is done (2026-09-23) — every app-generated link now reads `NEXT_PUBLIC_APP_URL` with the old domain as a safe fallback, so this is purely console/account access (GoDaddy, Vercel, Firebase, Vapi dashboards), nothing left for the integrator to do first |
| NH-18 | Live-call verification of the T-098/T-099 safety boundaries: launch Care Homes and Daycares in Demo Studio, call the demo line, and try the adversarial asks — a caller claiming to be family asking whether a named person is a resident / how they are doing (Care Homes); a caller asking to release a child, or asking whether a specific child is at the center (Daycares); plus a fall/elopement/injury report in each. Confirm the agent refuses to confirm/deny/discuss and escalates immediately | T-098/T-099 production sign-off | Unit tests prove the rules are present in the generated prompt (`buildAgentPrompt`), not that the voice model obeys them on a real call — this is the same class of gap as the 2026-09-07 gpt-realtime incident, where config that looked right didn't behave right live. No phone access in this sandbox. Neither vertical has its own provisioned number; they run on the shared `demo-roofing` line via Demo Studio |
| NH-19 | Decide whether `business.active` should gate `resolveBusinessId()` for the live Vapi line | T-082 product decision | Today routing uses `vapiAssistantId`/`vapiPhoneNumberId` even when the tenant is flagged inactive. Adding an `active` check could silently drop calls on an already live line; decide the behavior and migration plan before changing routing. |
| NH-20 | ~~ElevenLabs API key + secrets~~ **DONE 2026-09-24:** key in `.env.local` (gitignored) + Vercel prod (sensitive), tool secret generated + applied via the setup script; `ELEVENLABS_WEBHOOK_SECRET` is still pending (NH-23) | — | Key is restricted (ElevenAgents write; no Webhooks permission) |
| NH-21 | ~~Twilio Upgrade~~ **DONE 2026-09-27:** the account is out of trial (no trial message); +1 689 204 2643 stays on the agent, and +1 778 907 9769 (T-130) was bought and imported onto the same agent. Still optional: rotate the Twilio Auth Token once everything works. | — | — |
| NH-22 | ElevenLabs privacy review: data retention / call-recording settings and data-processing terms for call audio and transcripts (ties to NH-4 recording notice and the T-102 disclosure) | Before any real caller reaches ElevenLabs | Set the shortest retention that still supports your support needs |
| NH-23 | ~~ElevenLabs post-call webhook + signing secret~~ **DONE 2026-09-24:** workspace post-call webhook `Luxor post-call` created (HMAC), events transcript + call-initiation-failure (audio off), signing secret in `.env.local` + Vercel prod (sensitive), production redeployed, route returns 401 unsigned. Original task text: (owner): create the webhook `https://ai-roof.vercel.app/api/webhooks/elevenlabs/post-call` (HMAC; transcript + call-failure events) in the ElevenLabs dashboard, copy the signing secret ONCE into `.env.local` as `ELEVENLABS_WEBHOOK_SECRET`, tell Claude (it pushes to Vercel and redeploys). | Call transcripts/records for ElevenLabs calls appearing in the app | Exact dashboard labels were not verifiable from the docs — look under ElevenAgents Settings -> Post-call webhooks OR Developers -> Webhooks |
| NH-24 | **Rotate the Firebase service-account key** — it was printed into the 2026-09-25 session output by a parse error (local transcript only). Firebase console -> Project settings -> Service accounts -> generate a new key, put it in Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` (+ `.env.local`), redeploy, then delete the old key. Also mark `RESEND_API_KEY` **Sensitive** in Vercel ("Needs Attention" badge) | security hygiene | 15 min |
| NH-25 | Open the "[Test] Luxor CRM email deliverability check" email in Gmail -> Show original -> confirm `dkim=pass`, `spf=pass`, `dmarc=pass` and that it landed in the inbox, not spam (closes NH-3) | T-122 | 2 min |
| NH-26 | **Live run-through** (nobody has done this end to end): call +1 689 204 2643 and book -> `/company/calls?preview=carlita-elevenlabs-test` (the call must be listed) + Pipeline -> Review request card: confirm + create job -> job Field QR on a phone, one English + one Spanish update -> Timeline/Materials/Labor -> Report, Quote, Invoice: edit and email each to yourself (check logo, photos, hide toggles, NO prices on the report) | T-113/T-107/T-122 | 15 min |
| NH-27 | Check plans before selling: Vercel (Hobby forbids commercial use -> Pro); Firebase stays on Spark for now by owner decision (revisit at the first paying customer or when photos near 1 GiB); Twilio Upgrade out of trial (NH-21); ElevenLabs/Vapi concurrency limits; legal: ToS, privacy policy, recording-notice wording (NH-4) and retention (NH-22) | pricing model 2026-09-25 | varies |
| NH-28 | **Not optional (corrected 2026-09-28, P32-R1):** kwamwad@gmail.com's `businessUsers` doc carries a stale `superadmin: true`. The app's API/UI ignore it, but `firestore.rules` still honours it, so that login has direct Firestore superadmin access to every tenant until T-170 removes the fallback. Confirm with the owner, then delete the field; your real admin login is connect@luxordev.com. **Audit 2026-09-29 (`scripts/audit-superadmins.mjs`, read-only):** 12 Auth accounts; exactly 1 claim holder (connect@luxordev.com); 1 stale doc flag without the claim (kwamwad@gmail.com, owner of `carlita-elevenlabs-test`). The T-170 rules were deployed 2026-09-29, so the flag is now inert (re-audited after deploy); delete it when convenient | T-123, T-170 | 2 min |
| NH-29 | **Text-message confirmations — carrier registration (A2P 10DLC).** Checked in Twilio 2026-09-28 (read-only): account upgraded (Full); +1 689 204 2643 is SMS-capable and **no text has ever been sent on the account**; no brand/campaign/Messaging Service/toll-free verification yet; the only Trust Hub profile is an *individual* one. Owner: add the SMS clause to luxordev.com's privacy policy, then Business profile → Low Volume Standard brand → campaign → add the 689 number (click-steps + paste-ready answers: `docs/NEEDS-HUMAN-CHECKLIST.md` NH-29). Code ships OFF (`SMS_ENABLED=false`, T-152); on approval Claude flips it and sends one test text. | T-146, T-152 | 30 min + 1–3 weeks carrier review |
| NH-30 | **Phase 32 owner decisions** (`MASTER_PLAN.md` P32-D). Work proceeds on these defaults; override any: **D1** keep nav labels Dashboard/Calendar/Jobs (vs. Today/Schedule/Work); **D2** Project price = one typed customer price stored beside the line total, the only total the customer sees; **D3** a new invoice inherits an accepted quote's presentation and customer price; **D4** texts for bookings with no dialed line (office-made, email) come from the tenant's default Ready line, else no text; **D5** the Canadian line's texting stays off until a read-only provider check + your OK; **D7** approve the account-purpose list from `scripts/classify-accounts.mjs` (dry-run); **D9** name every account that should be a superadmin (expected: connect@luxordev.com only); **D10** no quote-revision flow (locked documents stay locked). Also: approve `scripts/phone-lines.mjs --apply` for the two demo lines, and each client line's go-live | T-159, T-165, T-166, T-169, T-170, T-171 | 10 min |
| NH-31 | **Production facts found 2026-09-29 (read-only) — decide what to do:** (1) the Canadian demo number +1 (778) 907-9769 is **not in demo-roofing's routing** (`elevenlabs.extraPhoneNumbers`), so T-130's app-side step was never done — calls to it don't reach the demo tenant; add it on Admin → demo-roofing → Configure (it will pass the new conflict check) and make one test call. (2) `SMS_ENABLED` is **not set** in Vercel production, so the app sends no texts there today (the T-156 delivered text was not app-sent). (3) A stale `VAPI_AUTH_BYPASS` variable still exists in production; no code reads it — safe to delete. (4) `scripts/phone-lines.mjs` dry run: the US demo line's old record `demo-roofing-main` needs only its missing fields filled (purpose demo, status live) — approve `--apply`. (5) `scripts/classify-accounts.mjs` suggests: carlita-elevenlabs-test + the five "… Demo" sample tenants → test; coastal-landscaping, premier-hvac → client (confirm they are real) | T-130, T-166, T-169, T-171 | 15 min |
| NH-32 | **Move Firebase to Blaze before selling** (2026-10-03 audit). Spark caps reads at 50k/day for the whole platform; when it runs out, every tenant's screens and the phone AI's booking tools fail together. Polling was cut ~10x on 2026-10-03, but the hard cap is still a single point of failure. At current volume Blaze costs cents/month; set a budget alert in Google Cloud. | T-180, T-128 | 10 min |

## Deferred (from CIB — do not schedule without owner request)

Pagination/search/virtualization; field-theme unification; toast component unification
beyond T-040's single banner; offline field queue; operator replay console; SMS; Google Calendar OAuth; Stripe.
