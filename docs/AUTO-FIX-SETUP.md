# AUTO-FIX-SETUP.md — catch errors, draft fixes, owner merges (T-229)

**Status:** not started. Planned for after the Tuesday 2026-11-03 roofing demo; don't change production monitoring right
before a demo. Owner request 2026-10-30.

**The loop:** something breaks → it is noticed → an AI agent writes a fix on its own branch → the checks run → the owner
approves on GitHub (the phone app is enough) → Vercel deploys it → the next nightly run confirms the error stopped.
**The bot never pushes to `main` and nothing merges without the owner.** Vercel **Instant Rollback** undoes any deploy in
one click.

Order: Phase A in week 1 (detection is most of the value), B1–B3 in week 2 (on-demand only, judge the fix quality),
B4 + D in week 3 once the fixes are trusted.

## Phase A — Foundations

- [ ] **A1. Protect `main`.** GitHub already requires the `gate` check (CI), but the owner's account bypasses it, and
  Claude sessions push straight to `main`. Decide: (a) require a PR + 1 approval for everyone, so Claude sessions open
  PRs too (one extra click per change), or (b) keep direct pushes for owner-led sessions and require PRs only for the
  bot's branches (`claude/*`, `dependabot/*`). Recommended: (b) first, then (a) once the PR flow feels normal.
- [ ] **A2. Browser tests in CI.** Add a job to `.github/workflows/ci.yml` that runs the keyless harness
  (`node scripts/e2e/up.mjs --detach --prod`), `npm run e2e:call` and `npx playwright test`, and uploads
  `test-results/` (phone screenshots) as an artifact. The harness needs Java for the Firebase emulators
  (`actions/setup-java`) and the Playwright browsers (`npx playwright install --with-deps chromium`). Today only
  type-check, lint, build, vitest and the release suite run in CI. Run it on PRs and nightly, not on every push to `main`
  (about 15 min).
- [ ] **A3. Vercel PR copies are safe.** Confirm that Preview deployments do not use production Firestore, the live
  phone line or real email/Resend keys (Vercel → Project → Settings → Environment Variables → Preview column). If they
  do, either give Preview its own values or turn Preview deploys off for bot branches. This must be settled before a
  bot opens its first PR.
- [ ] **A4. Error tracking in PostHog.** PostHog is page views only today (`src/components/analytics/PostHogPageViews.tsx`
  drops every other event in `before_send`). To add errors:
  - Browser: enable exception capture and let `$exception` through `before_send`, keeping the scrubbing (no names,
    phones, emails, addresses or tokens in messages, URLs or stack frames).
  - Server: `posthog-node` from Next.js's `instrumentation.ts` `onRequestError` hook. This is where the important
    failures happen (booking tools, emails, ElevenLabs webhooks, crons). Same scrubbing; never send request bodies.
  - No privacy-policy change needed (`/legal/privacy` already lists PostHog); check `src/lib/http/csp.ts` still allows
    the host.
  - PostHog alert: email connect@luxordev.com on a **new** error type.
- [ ] **A5. Uptime monitor.** Better Stack or UptimeRobot (free) on `https://crm.luxordev.com/api/health` every
  3–5 minutes, alerting connect@luxordev.com.
- [ ] **A6. Credit alerts.** ElevenLabs and OpenAI: turn on auto-recharge or low-balance emails in each dashboard. A
  daily cron that reads balances (`src/app/api/admin/ai-status/route.ts` already does this) and emails below a threshold
  is the in-app option.
- [ ] **A7. Retarget the webhook health check.** `src/app/api/cron/webhook-health/route.ts` watches the old Vapi
  webhook. Add the ElevenLabs paths (initiation + post-call + tool calls), or the live line has no failure alarm.
- [ ] **A8. Sanity:** the existing booking canary (`/api/cron/booking-canary`) keeps running and emailing; no change.

## Phase B — The fixing bot (Claude Code GitHub Action)

- [ ] **B1. Install.** In Claude Code run `/install-github-app`. It installs the Claude GitHub app on `K-WAM/AIRoof`,
  adds `.github/workflows/claude.yml` and stores the API key as a GitHub secret (never in the repo, never echoed). Set a
  monthly spend cap on the Anthropic account.
- [ ] **B2. Bot rules.** Add a short "Automated fixes" section to `AGENTS.md`. The bot may fix ordinary screen and API
  bugs, each with a test that fails before the fix. It must **open an issue only, never a PR**, for:
  - auth, roles, superadmin, tenant isolation, `firestore.rules`
  - invoice, quote, payment and tax math
  - `/legal/*`, recording/texting consent wording
  - the live phone agent's prompt, model or tools (the Booking-change gate needs a real call)
  - data migrations, backfill scripts, anything that deletes data
  - secrets, env vars, `vercel.json` crons, `app-status.json`

  It must also: keep each PR small (one problem); run the AGENTS.md "Definition of done" checks; write the PR text in
  plain English (what broke, who saw it, what changed, how it was tested); never merge, never push to `main`.
- [ ] **B3. On demand.** The owner (or Claude in a session) writes `@claude fix this` on an issue → branch `claude/…`,
  failing test, fix, checks, PR. Run this for two weeks and judge the PRs before turning on B4.
- [ ] **B4. Nightly triage.** A scheduled workflow (or a Claude routine via `/schedule`), e.g. 6 AM Eastern:
  1. Collect the last 24 h: PostHog errors, Vercel runtime errors, ElevenLabs conversations that failed or had a tool
     error, the booking-canary result, uptime incidents.
  2. Skip anything that already has an open issue (match on error type + route).
  3. Open one issue per new problem: how often, which tenant(s) (business id only, no customer details), first/last seen.
  4. For a clear-cut bug outside the B2 no-PR list, open a **draft** PR with the fix and a test.
  5. Comment on issues whose fix merged: still happening → reopen; gone for 3 nights → close.
  6. Email a short morning summary to connect@luxordev.com (only when there is something to report).

  Read-only credentials for the collectors (PostHog personal API key with read scope, Vercel token with read access,
  ElevenLabs key) live in GitHub secrets.

## Phase C — The owner's routine (about 5 minutes a day)

- [ ] **C1.** Morning: read the summary. For each PR, read the plain-English text, open the Vercel preview, then
  **Merge** or **Close**. Booking-related fix → make one real call on the demo line after it deploys.
- [ ] **C2.** If production breaks after a merge: Vercel → Deployments → previous one → **Instant Rollback**.
- [ ] **C3.** Weekly: skim closed/reopened issues, so recurring problems get a real fix, not repeated patches.

## Phase D — Keep dependencies current

- [ ] **D1. Dependabot.** `.github/dependabot.yml`: npm weekly, grouped (one PR for minor/patch, one per major), plus
  GitHub Actions monthly. The same CI gate checks them. Majors already tracked as their own tasks (Firebase Admin 14 /
  T-062, Next.js 16) stay manual: ignore those in the config.
- [ ] **D2.** When a Dependabot PR fails CI, `@claude` on it to fix the breakage on the same branch.
- [ ] **D3. Optional:** GitHub CodeQL (free security scanning) on PRs.

## Costs (rough)

- Claude API: a few dollars on nights with errors, near zero on quiet nights. Cap it (B1).
- GitHub Actions: 2,000 free minutes/month for a private repo. Nightly full browser suite (~15 min × 30 ≈ 450) plus PR
  runs fits; watch the usage page.
- PostHog error tracking, uptime monitor, Dependabot, CodeQL: free tiers at current size.

## Done when

An error deliberately thrown on a test route in production (then removed) produces, without anyone touching anything:
a PostHog alert email, a GitHub issue the next morning, a draft PR with a test, and a "gone" comment after the fix is
merged and deployed.
