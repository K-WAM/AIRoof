# SESSION_HANDOFF.md — Current state

Updated: 2026-08-23 by Codex.

## Repository

- Root: `C:\Users\karee\Desktop\Apps\AI Roofing Agent`
- Branch: `main`
- Pushed baseline: `cfa6102` (`origin/main`, latest remote commit verified before the maintenance pass)
- Local state: maintenance cleanup/docs are uncommitted and unpushed. The pre-existing
  `.claude/settings.local.json` Playwright permission change belongs to the owner and was preserved.
- No worker branches, active worktrees, pending reviews, or development blockers.

## Product status

- Phases 0–6 are fully merged: 100% of the currently scoped audited release and UX/demo work.
- Latest baseline GitHub Actions run passed on `cfa6102`.
- Live check on 2026-08-23: `/api/health` returned `200`, Firestore `connected`, and OpenAI, DeepSeek, Resend,
  Vapi, Firebase, and cron all `configured`; `/login` returned `200`.
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

## Next actions

1. Review and commit the maintenance diff; do not include the owner's `.claude/settings.local.json` unless the
   owner explicitly wants that settings change committed.
2. Push/deploy only when requested.
3. Complete NH-1/NH-3/NH-4/NH-8/NH-11 production sign-offs.
4. Scope dependency majors as a dedicated migration with full browser/provider regression testing.
