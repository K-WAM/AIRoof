# Testing guide

Updated: 2026-08-23

## Automated release gate

Install from the committed lockfile, then run every gate from the repository root:

```powershell
npm ci
npm run type-check
npm run lint
npm test
npx vitest run --config tests/release/vitest.config.ts
npm run build
```

The main Vitest suite covers authorization, webhook authentication and replay protection, Vapi appointment
identity, scheduling conflicts, calendar rollback, field-token exchange/scope, AI schema hardening, operation
ledger idempotency, communications, retention/redaction, Demo Studio isolation, onboarding, and key UI click
paths. The separate release suite is deliberately redundant at the highest-risk boundaries.

Tests must not use the network. Mock Firestore and all providers at the existing seams. Never add real-looking
provider keys to the workflow environment; readiness tests intentionally verify missing-configuration paths.

## Local development check

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/login`. For Firestore-backed manual testing, provide the variables from
[`../.env.example`](../.env.example). To initialize the universal demo tenant on a development Firebase
project, place the service-account file at `firebase-service-account.json` and run:

```powershell
node scripts/seed-demo-business.mjs
```

Use `/admin/demo` for normal demo personalization/reset. Do not mutate demo Firestore with ad-hoc scripts;
the route is guarded by the superadmin check, demo allowlist/marker, backup, reset lock, and typed confirmation.

## Production smoke test

Run this after any release affecting authentication, Vapi, scheduling, field access, or communications:

1. Confirm `/api/health` returns `200`, Firestore is `connected`, and all six capabilities are `configured`.
2. Sign in as superadmin and launch one vertical in Demo Studio. Confirm the dashboard contains populated calls,
   leads, appointments, resources, and (for field-service verticals) jobs.
3. Call the universal demo number. Verify the selected company/vertical greeting, caller record, lead or booking,
   and transcript appear under the same tenant.
4. Drag an unassigned job/appointment in Calendar, confirm the mutation, and verify it remains assigned after a
   reload. Force or simulate a failed mutation in development and confirm the UI rolls back with an alert.
5. Scan the field QR on a real phone. Verify the reusable key is stripped after exchange, hold-to-speak records,
   one retry handles a transient upload failure, and a proposed correction requires confirmation.
6. Generate an invoice and report, print each to PDF, then send to a controlled inbox. Confirm document-only
   printing, branded subject/body, a single delivery, and visible failure status when sending is unavailable.
7. Verify unauthenticated admin/API requests return `401`, an expired/replayed field token fails, and a token
   scoped to job A cannot access job B.

Record authenticated browser/phone evidence in [`IMPLEMENTATION_LOG.md`](IMPLEMENTATION_LOG.md). The automated
tests do not replace this production smoke because they intentionally do not contact live providers.

## Focused commands

```powershell
# One test file
npx vitest run src/lib/vapi/__tests__/verify.test.ts

# Security/release acceptance only
npx vitest run --config tests/release/vitest.config.ts

# Strict unused-local and unreachable-code compiler check
npx tsc --noEmit --noUnusedLocals --noUnusedParameters --allowUnreachableCode false
```

## Current manual sign-offs

The remaining human-owned checks live in [`../TODO.md`](../TODO.md) under `NEEDS-HUMAN`, notably Vapi dashboard
configuration, Resend DNS deliverability, recording/retention policy approval, Firestore TTL policies, and the
authenticated Calendar/field/PDF smoke paths.
