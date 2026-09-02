# SESSION_HANDOFF.md — Current state

Updated: 2026-09-02 (Claude) — live incident fix, demo-persona architecture fix, Phase 8 backlog, 7 tasks done,
1 (T-064) deferred by owner.

## Repository

- Root: `D:\Apps\AI Receptionist` (this machine).
- Branch: `main` (this session's work landed on `docs/qol-audit-2026-08-27` and `chore/qol-cleanup-2026-09-02`,
  each fast-forward-merged into `main` and pushed — see HANDOFF.md's 2026-09-02 entry for the full commit list).
- Pushed baseline: `origin/main` is at `67a4710` (T-061/T-069/T-063 + doc updates), pushed and confirmed
  deployed — `vercel ls` showed the new build `Ready` within ~1 min, `/api/health` returns `200` with every
  provider `configured`, CSP header confirmed enforced (no `-Report-Only`) with no leftover
  `fonts.googleapis.com` reference on `/login`, and the Vapi webhook still correctly 401s an unauthenticated
  POST (rate limiter didn't break normal auth flow).
- Vercel: deployed to production directly via `vercel --prod` mid-session (ahead of the git push, to unblock
  live debugging) and again via the GitHub-integration auto-deploy on each push to `main`.
- No worker branches, active worktrees, or development blockers otherwise.

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

- Phases 0–6 are fully merged: 100% of the currently scoped audited release and UX/demo work. Phase 7: 2/8
  done (T-053, T-059). Phase 8: 5/9 done (T-066, T-068, T-061, T-069, T-063) — added and worked this session;
  T-064 investigated and deferred by owner choice (see continuation entries above).
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

1. **Review and prioritize the remaining Phase 7/8 backlog** (`MASTER_PLAN.md`, T-054–058/060 and
   T-061–065/067/069) — decide what to greenlight next; nothing remaining is assigned or started.
2. **NH-13**: owner to paste reference organizing/roofing apps for T-056's per-industry visual palette work.
3. Complete NH-1/NH-3/NH-4/NH-8/NH-11 production sign-offs. NH-1's Vapi-dashboard-config-matches-production
   concern is now substantially addressed by this session's incident fix, but the human dashboard review itself
   (assistant model/voice/retry/recording settings) is still outstanding.
4. Scope dependency majors (Next.js 16, Firebase 12, Firebase Admin 14) as a dedicated migration with full
   browser/provider regression testing — T-062 (Phase 8) now formally tracks the `npm audit` half of this.
5. **T-054 when picked up**: owner confirmed Twilio (not Telnyx) as the Canadian-number provider — buy the DID
   from Twilio, import into Vapi as bring-your-own-number.
6. Optional: a live click-through of the three newest verticals (Electricians, Appliance Repair, Childcare) in
   Demo Studio — now meaningfully testable end-to-end on a real call, since T-054's sibling fix this session
   made the Demo Studio → live-call persona push actually work.
