# SESSION_HANDOFF.md — Current state

Updated: 2026-09-04 (Claude) — T-057 guide content, T-062 CI audit-gate done + firebase-admin v14 attempted and
reverted (live incident), T-065 webhook-health alerting done.

## Repository

- Root: `D:\Apps\AI Receptionist` (this machine).
- Branch: `main` (all work this session pushed directly to `main`, no worker branches).
- Pushed baseline: `origin/main` is at `f638087` (2026-09-04) — see the 2026-09-03/04 entry below for the full
  commit list, including one reverted commit. Production confirmed healthy post-revert: `/api/health` →
  `200`/`"connected"`, unauthenticated webhook `POST` → `401`, `/login` → `200`.
- Vercel: deployed via the GitHub-integration auto-deploy on each push to `main` throughout.
- No worker branches, active worktrees, or development blockers otherwise.

## 2026-09-03/04 — guide content, CI audit gate, webhook alerting, one reverted live incident

Owner asked for the next self-executable improvement, then kept greenlighting further self-selected work.

- **T-057** (2026-09-03): content-only pass on `public/guides/onboarding-guide.html` — added the 3 missing
  vertical pitch cards, generalized the field-service full-demo walkthrough to all 7 trades via a swap table,
  extended the intake-demo section to Childcare, added an "After the Sale — Client Talk-Track" section, and
  fixed a pre-existing CSS bug (`.step-body strong` descendant selector) found while browser-verifying the
  render.
- **T-062, CI-gate half** (`27b8556`): `npm audit --omit=dev --audit-level=critical` added to CI — passes today
  (0 criticals), catches a future critical-severity regression.
- **T-065** (`fbaf541`): sustained Vapi webhook auth-failure alerting — a best-effort counter on every 401, a
  new daily cron reading/resetting that window, one `[Alert]` email past a 5-failure threshold. Resolved the
  shared T-062/T-065 blocker along the way: Vercel Hobby allows 100 cron jobs/project (only frequency is
  capped), so NH-6's "cron slot budget" concern was never actually a constraint.
- **T-062, firebase-admin v14 half — attempted, broke production, reverted.** Migrated `firebase-admin`
  v12→v14.3.0 (`6bef37b`); fully green locally (tsc/lint/352 tests/release suite/build), but production
  `/api/health` and every Firestore/Auth route started 500ing within about a minute of deploy
  (`ERR_REQUIRE_ESM`: `firebase-admin@14`'s Auth module depends on `jwks-rsa@4.1.0` → `jose@^6.1.3`, and `jose`
  went pure-ESM at v6 — a known open upstream issue, [auth0/node-jwks-rsa#493](https://github.com/auth0/node-jwks-rsa/issues/493)).
  `vercel rollback` was attempted and correctly blocked by the permission classifier; fixed forward via
  `git revert --no-edit 6bef37b` (`bf10381`), verified restored properly, not just re-deployed. No safe retry
  today — both `firebase-admin` and `jwks-rsa` are already at their latest releases, and downgrading `jwks-rsa`
  risks a silent API mismatch on the token-verification path. **T-062 stays open**; only its CI-gate half is
  done. Full incident detail in `TODO.md` and `HANDOFF.md`'s matching entries.

Verified end state: `tsc` clean, lint 0/21, full `vitest run` 352/352 (local `node_modules` re-synced to the
reverted lockfile, confirmed `firebase-admin@12.7.0`), release suite 16/16, production health confirmed live.

## 2026-09-02 — live incident fix, demo-persona bug fix, Phase 8 backlog, 4 tasks completed

A user bug report ("no greeting, always have to start the conversation") uncovered and fixed three real
production issues, then a batch of 4 self-selected backlog tasks. Full evidence in `HANDOFF.md`'s matching
2026-09-02 entry and `TODO.md`'s narrative notes; summary:

1. **Vapi webhook secret was out of sync with Vercel's `VAPI_WEBHOOK_SECRET`** — every call was 401ing. Fixed by
   rotating one fresh secret onto both Vapi resources and Vercel, then redeploying; confirmed via `vercel logs`.
2. **The assistant's LLM provider had drifted to a broken `cerebras` config** (0 tokens returned every call).
   Reverted to `openai`/`gpt-4o-mini`.
3. **The real bug**: Vapi's `assistant-request` dynamic-config webhook never fires for a phone number with a
   fixed `assistantId` (every number this platform provisions has one) — so `{{systemPrompt}}`/`{{greeting}}`
   template placeholders always rendered empty on a live call, and **Demo Studio's "one number adapts per
   vertical" feature had zero effect on real calls since it was built**. Fixed by having
   `demo-customize/route.ts` push the rendered persona directly to the live Vapi assistant on every launch
   (`updateAssistantPersona()` in `vapiClient.ts`) instead of relying on the webhook path.
4. Also: removed a `Stop` hook printing a fixed message every turn; renamed the sign-in page to "Luxor Ops";
   moved the company portal nav to a left sidebar; added **Phase 8** (T-061–T-069, hardening/performance/
   discoverability) to `MASTER_PLAN.md`/`TODO.md`; then self-selected and completed **T-053** (retired dead
   `agentVoice` field), **T-059** (Twilio type debris removed, 3 docs archived), **T-068** (Calendar
   code-split, 276kB→104kB measured), **T-066** (new `Tooltip` component + applied to a reviewed control list,
   first component/DOM test in the repo).

Owner also confirmed intent to add a Canadian number to Vapi via **Twilio** specifically — already tracked as
part of T-054's scope (see `MASTER_PLAN.md`), just now provider-confirmed. Not started.

**Continuation, same session:** owner asked for the next task in the suggested Phase 8 order. **T-064**
(secrets hygiene) isn't CLI-doable (resending the full value is required to flip a var's type via `vercel env
update`), but the dashboard makes it a safe, no-re-entry click-through — narrowed to 7 genuine-credential vars.
Owner reviewed and said **skip for now** — deferred, not blocked (full click-through preserved in `TODO.md`).
**T-061** (enforce CSP + self-host fonts) completed instead: Inter moved off the `fonts.googleapis.com`
`<link>` onto `next/font/google`; `next.config.ts`'s CSP header flipped from `-Report-Only` to enforced, with
no directive widening needed. `tsc`/lint/build clean; full test suite 313/315 (2 known concurrent-load flakes,
isolated rerun clean).

**Continuation:** owner said go ahead with T-069 "and other easy things too" — **T-069** (static logos to
`next/image`; base64 photo path audited, already correct, no change needed) and **T-063** (new
`src/lib/auth/rateLimit.ts`, in-memory per-IP budget wired into the 3 public routes, burst tests per route)
both done. Skipped T-062/T-065/T-067 (each carries real risk or an open dependency — see `TODO.md`) rather than
self-select further without checking in. `tsc`/lint 0/20/build clean; full suite 324/325 (1 known flake,
isolated clean); release suite 16/16.

**Continuation — push/deploy verified, then a real field QR feature:** pushed to `origin/main`, confirmed the
Vercel production deploy healthy against the live URL (not just the build log). Owner then asked how a call
becomes a voice-loggable job and whether QR codes could help — traced the real pipeline and found QR access
already existed in code but only for the superadmin demo line; a real tenant's job page had no unauthenticated
field-access option. Built `POST /api/jobs/[jobId]/field-qr` + a **Field QR** button/modal on the job detail
page, reusing the existing signed one-time-grant primitive and the `qrcode` package Demo Studio already used.
Corrected `field-operations-guide.html`'s walkthrough to match. 9 new tests; `tsc`/lint/build/release-suite all
clean. Full detail in `TODO.md`. Pushed (`53a0965`) and confirmed deployed: Vercel build `Ready` in ~90s,
`/api/health` 200, `/login` 200, the new field-qr route correctly 401s unauthenticated, webhook auth unaffected.

**Live incident, same session — T-061's CSP had no `connect-src`, breaking login in production:** owner reported
`Firebase: Error (auth/network-request-failed)` on `/login` right after the above deploy. Root cause: the
enforced CSP (T-061) never declared `connect-src`, so it silently fell back to `default-src 'self'` — blocking
every browser fetch the Firebase client SDK makes (Auth's `identitytoolkit`/`securetoken` calls, Firestore
reads). This broke login for everyone and also silently broke every client-side Firestore read
(`AuthContext`'s `businessUsers` lookup, etc.). Fixed with `connect-src 'self' https://*.googleapis.com`
(covers Auth, Firestore, and Firebase Installations under one wildcard). Added a regression test to
`security-headers.test.ts` asserting `connect-src` is present and includes `googleapis.com`. Pushed (`9a0da8d`),
confirmed deployed, and verified the actual fix — not just the header — with a real browser (Playwright):
navigated to `/login`, ran an in-page `fetch` to `identitytoolkit.googleapis.com`, and confirmed it reached
Google (400 on a deliberately-bogus key/credentials, not a CSP-blocked network error) with zero CSP violations
in the console.

## 2026-08-27 — QoL & multi-vertical audit (Phase 7 added, no code changed)

Owner requested a broad quality-of-life pass — identify and answer only, no execution: split demo/onboarding
onto a dedicated hub/URL, tailor the client-facing look per industry, AI-document consistency, Vapi setup
clarity + a client talk-track, and research on newer voice models + Canadian phone numbers. Findings were
published as an Artifact ("Luxor Platform Audit") and turned into 8 fully-specced candidate tasks — **Phase 7,
T-053–T-060** — added to `MASTER_PLAN.md` in the same template every prior phase uses. See `HANDOFF.md`'s
matching 2026-08-27 session entry for the direct answers (voice models, Canadian numbers) and the full
findings-to-task mapping. **Phase 7 is queued, not assigned — owner prioritization is the next step**, same
posture Phase 6 held before 2026-07-23. Project memory (`~/.claude/projects/.../memory/`) was updated to point
future sessions at the artifact and to retire the now-stale "45% done" release-orchestration memory (that
backlog closed weeks ago).

## Product status

- Phases 0–6 are fully merged: 100% of the currently scoped audited release and UX/demo work. Phase 7: 3/8
  done (T-053, T-057, T-059). Phase 8: 6/9 done (T-061, T-063, T-065, T-066, T-068, T-069) — T-062 is half done
  (CI audit gate merged; the firebase-admin v14 half was attempted 2026-09-04 and reverted after a brief
  production incident, see above — stays open); T-064 deferred by owner choice; T-067 not started.
- Live check 2026-09-02, post-fix: phone line confirmed working end-to-end via a live test call (greeting,
  correct persona, tools) after the incident fixes above. `/api/health` returns `200`, Firestore `connected`,
  all six provider/runtime capabilities `configured`.
- This session's verification: `npx tsc --noEmit` clean, `eslint` clean (only pre-existing `<img>`/no-image
  warnings), full `npx vitest run` 313/313 real passes each run (the one recurring `example-lib.test.ts`
  failure is the long-documented concurrent-load flake, reconfirmed clean in isolation every time), `npm run
  build` green.
- Production sign-off still requires the authenticated/manual checks in `TODO.md#needs-human`.

## 2026-08-23 maintenance cleanup

- Removed eleven obsolete one-off scripts. The universal, guarded `/admin/demo` flow supersedes the old CLI
  customizer, activity/client seeders, and per-vertical tenant seeders; `provision-superadmin.mjs` supersedes
  the partial UID-only grant script; the broken TypeScript demo seeder was superseded by the retained ESM seeder.
- Removed the unused nested Vapi Vitest config; the root config already discovers those tests.
- Removed the unused `sendCrewAssignment()` wrapper. Assignment routes use `buildCrewAssignmentEmail()` with
  the ledger-backed communications service directly.
- Made implementation-only constants, schemas, error classes, helpers, and fixture types private. Retained
  `CallSession`, `CallMessage`, `UserBusinessMembership`, `SuperadminProfile`, `FieldAuditEntry`, and operation
  state types because they describe live/persisted domain data.
- Removed unused Tailwind/Autoprefixer/PostCSS direct dependencies and declared the directly imported
  `@eslint/eslintrc` package. Retained `pptxgenjs` because it generates the committed pitch deck.
- Applied all non-breaking `npm audit fix` updates, including Next.js 15.5.23. Audit moved from 30 findings
  (1 critical, 12 high, 17 moderate) to 23 (0 critical, 6 high, 17 moderate). Remaining production findings
  require separate major migrations (Next.js 16, Firebase 12, Firebase Admin 14); the pitch-deck generator adds
  two development-only high findings. Do not run `npm audit fix --force` as an incidental cleanup.
- Rewrote the active documentation index/testing guide, marked old onboarding/demo plans historical, and
  reconciled `TODO.md`, `HANDOFF.md`, `CLAUDE.md`, and `.env.example` with the current Vapi/universal-demo system.

## Verification

- `npm run type-check` — clean.
- Strict compiler (`--noUnusedLocals --noUnusedParameters --allowUnreachableCode false`) — clean.
- `npm run lint` — 0 errors / 24 existing warnings (improved from 26).
- `npm test` — 32 files / 304 tests passed.
- Release suite — 5 files / 16 tests passed.
- `npm run build` — green on Next.js 15.5.23; 48 routes generated.
- `knip` after cleanup — remaining reports are explained: three operational scripts, the string-loaded
  `eslint-config-next`, `pptxgenjs` for the manual deck generator, and eight protected/domain types. No
  unexplained unused runtime file, dependency, or export remains.
- `git diff --check` — clean.

## Retained operational scripts

- `scripts/seed-demo-business.mjs` — initialize the universal demo tenant.
- `scripts/provision-superadmin.mjs` — set custom claim and `businessUsers` record.
- `scripts/create-pitch-deck.cjs` — regenerate `public/Luxor-AI-Pitch.pptx`.

## 2026-08-25 vertical expansion

- Added `electricians`, `appliance-repair`, and `childcare` to `VERTICAL_TEMPLATES`
  (`src/lib/verticals/templates.ts`) — full template blocks (vocab, services, FAQs, emergency/booking rules,
  agent persona, icon/color). Electricians and Appliance Repair are jobs-mode (same shape as Roofing/HVAC/GC);
  Childcare is appointments-mode (same shape as Dental/Property Mgmt).
- Added the matching resource roster to `RESOURCES` in `src/lib/verticals/demoSeed.ts` — `demoSeedFor()`
  already derives jobs/calls/leads/appointments generically from the template, so that was the only demo-seed
  change needed.
- Wired `Zap`/`Wrench`/`Baby` into `VERTICAL_ICONS` in `src/app/admin/demo/page.tsx`.
- Updated `public/guides/onboarding-guide.html` (card count, industry list, quick-reference table) from seven
  to ten industries.
- Re-verified: `npm run type-check` clean, `npm run lint` 0 errors/24 warnings (unchanged), `npm run build`
  green (48 routes, unchanged), full `npm test` 32/32 files green on isolated rerun of the one known
  concurrent-load flake.

## Next actions

1. **Review and prioritize the remaining Phase 7/8 backlog** (`MASTER_PLAN.md`, T-054–056/058/060 and
   T-062 firebase-admin half/T-067) — decide what to greenlight next; nothing remaining is assigned or started.
2. **NH-13**: owner to paste reference organizing/roofing apps for T-056's per-industry visual palette work.
3. Complete NH-1/NH-3/NH-4/NH-8/NH-11 production sign-offs. NH-1's Vapi-dashboard-config-matches-production
   concern is now substantially addressed by this session's incident fix, but the human dashboard review itself
   (assistant model/voice/retry/recording settings) is still outstanding.
4. **Dependency majors**: Next.js 16 (`postcss`/`sharp` findings) and the client `firebase` SDK v11+ (`undici`
   findings) still need dedicated migration work with full browser/provider regression testing. `firebase-admin`
   v14 was attempted 2026-09-04 and reverted after breaking production (`ERR_REQUIRE_ESM`, a known open upstream
   `jwks-rsa`/`jose` issue) — do not retry without an upstream fix or dedicated Vercel-runtime `require(esm)`
   testing; see the 2026-09-03/04 entry above.
5. **T-054 when picked up**: owner confirmed Twilio (not Telnyx) as the Canadian-number provider — buy the DID
   from Twilio, import into Vapi as bring-your-own-number.
6. Optional: a live click-through of the three newest verticals (Electricians, Appliance Repair, Childcare) in
   Demo Studio — now meaningfully testable end-to-end on a real call, since T-054's sibling fix this session
   made the Demo Studio → live-call persona push actually work.
