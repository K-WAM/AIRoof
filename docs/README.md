# Documentation index

Updated: 2026-08-23

The AI Receptionist Platform is a live, multi-tenant Next.js application for seven service-business
verticals. The audited release plan and its UX/demo follow-up are complete. Use the documents below according
to their role; older plans are retained for history and are not the current operating instructions.

## Current sources of truth

- [`../TODO.md`](../TODO.md) — live status, remaining human sign-offs, and deferred work.
- [`../MASTER_PLAN.md`](../MASTER_PLAN.md) — completed release task specifications and acceptance criteria.
- [`../AGENTS.md`](../AGENTS.md) — repository execution, cleanup, and verification rules.
- [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) — compact current-session state.
- [`IMPLEMENTATION_LOG.md`](IMPLEMENTATION_LOG.md) — append-only implementation and verification evidence.
- [`TESTING.md`](TESTING.md) — automated gates and manual production smoke test.

## Operator guides

- [`../public/guides/onboarding-guide.html`](../public/guides/onboarding-guide.html) — current Demo Studio and
  client-onboarding playbook, including Vapi setup.
- [`../public/guides/field-operations-guide.html`](../public/guides/field-operations-guide.html) — field voice,
  photos, reporting, and invoicing workflow.
- [`ADMIN-QUICK-START.md`](ADMIN-QUICK-START.md) and [`ADMIN-ONBOARDING.md`](ADMIN-ONBOARDING.md) — historical
  pre-Vapi onboarding references. Do not follow their Twilio or Google Calendar steps.

## Architecture at a glance

- Next.js 15 App Router and React 19.
- Firebase Authentication plus Firestore tenant data under `businesses/{businessId}`.
- Vapi for inbound/outbound voice; incoming webhook authentication is fail-closed and replay-protected.
- OpenAI for live/field AI paths and DeepSeek for configured back-office paths.
- Resend through the ledger-backed communications service.
- Seven vertical templates: Roofing, HVAC, Landscaping, Cleaning, Dental, General Contractors, and Property
  Management. Demo Studio reconfigures the single `demo-roofing` live line instead of using separate tenants.

## Local development

```powershell
npm install
npm run dev
```

Required configuration is documented in [`../.env.example`](../.env.example). The app runtime uses
`FIREBASE_SERVICE_ACCOUNT_JSON`; the two retained Firestore operations scripts read the gitignored
`firebase-service-account.json` file from the repository root.

Useful operational scripts:

```powershell
node scripts/seed-demo-business.mjs
node scripts/provision-superadmin.mjs
node scripts/create-pitch-deck.cjs
```

Demo launches and resets should normally go through `/admin/demo`, whose server route applies the allowlist,
demo marker, backup, reset lock, and explicit confirmation guard.

## Quality gate

```powershell
npm run type-check
npm run lint
npm test
npx vitest run --config tests/release/vitest.config.ts
npm run build
```

Tests mock Firestore and external providers; they must not contact Vapi, Resend, OpenAI, DeepSeek, or live
Firestore. See [`TESTING.md`](TESTING.md) for the manual authenticated smoke sequence.

## Historical design records

- [`EPIC-PLAN.md`](EPIC-PLAN.md) — completed field operations, Library, Calendar, reporting, and invoice epic.
- [`DEMO-STUDIO-PLAN.md`](DEMO-STUDIO-PLAN.md) — original multi-vertical design; universal-line routing now
  supersedes its per-tenant assumptions.
- [`HANDOFF.md`](HANDOFF.md) — superseded 2026-05 snapshot.
- [`../consolidated_implementation_brief.md`](../consolidated_implementation_brief.md) — audit that produced the
  completed release plan.
