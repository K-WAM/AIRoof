# E2E-ROLE-TEST-PLAN.md - every user type, one truth table, a full browser run to build next

Built 2026-11-05 (T-314, stream K5). Test data and tests only: this adds no product code.

## 1. What exists today

- The local smoke harness (`docs/SMOKE-HARNESS.md`) runs the real Next.js app on the Firebase emulators. It needs no keys
  and cannot reach a live service. Accounts use the shared password `E2e-Passw0rd!`.
- `e2e/role-matrix.spec.ts` already loops over every `ACCOUNTS` key. For each account it opens every nav page, checks the
  landing redirect and checks that denied routes redirect away. It also proves the viewer cannot write settings.
- `e2e/field-updates.spec.ts` and `e2e/bilingual-crew-day.spec.ts` cover the Field screen: voice notes, photos, the time
  clock and a Spanish call and note.
- `e2e/call-to-cash.spec.ts` walks call to paid invoice in the UI. `scripts/e2e/scenarios/call-to-cash.cjs` does the same
  over the API with no browser (`npm run e2e:call`).
- `TENANTS.pros` (`e2e-roofpros`, "E2E Roof Pros") is a roofing tenant with one account for every user type. The seed gives
  it `seatLimit 15`, `showcase { finances, payroll, payments }`, `outboundEmailAllowlist ["owner@roofpros.e2e.test"]` and one
  crew ("Pros Field Crew") holding the foreman, technician and inspector.

## 2. The truth table

`e2e/roles/expectations.ts` exports `ROLE_EXPECTATIONS`, keyed by the `ACCOUNTS` keys. Each entry records, from the owner's
rules and not from the code:

- `tenant`: the `TENANTS` key.
- `landing`: where sign-in lands.
- `navMustShow` and `navMustNotShow`: nav labels that must appear or must not appear.
- `showcaseNav`: Finances / Payroll, on the pros tenant only. The browser spec checks these after the showcase switch is
  merged.
- `canWrite`, `fieldVoiceNote`, `seesPrices`: the write, field voice note and price rules.
- `apiProbes`: 3 to 6 real routes each, with the method, path, expected status and a reason. `body` is present only when a
  route needs it to reach the auth gate (the team PATCH reads `businessId` from the body).

`src/app/company/__tests__/role-expectations.test.ts` is the fast check. It compares `visibleNavLinks` and
`defaultLandingPath` against every entry except the superadmin. The superadmin's Hub is not the company shell.

To add a new user type:

1. Add one account to `scripts/e2e/config.cjs` (`ACCOUNTS`). Add a tenant only if the type needs its own business.
2. Add one entry to `ROLE_EXPECTATIONS` with the same key.
3. Run `npx vitest run src/app/company/__tests__/role-expectations.test.ts`.
4. If the product disagrees with the owner's rule, do not change the product and do not weaken the entry. Mark that one
   case `it.fails(...)` with `MISMATCH: <app does X, rule says Y>` and list it in the handoff.

## 3. The full browser run to build next (Codex, later - not in this change)

New spec: `e2e/role-journeys.spec.ts`. It reads `ROLE_EXPECTATIONS` so new accounts join automatically. For every account:

- Sign in and check the landing URL.
- Read the rendered nav and assert every `navMustShow` label is present and every `navMustNotShow` label is absent.
- Open every nav page. Assert no error page, no crash overlay and no console or 5xx errors. Take a desktop 1280 px and a
  phone 375 px screenshot and read the phone screenshots.
- Run every `apiProbe` with that account's session. Assert the status. For View only, also assert that no create, send or
  delete button is visible.
- For every role with `fieldVoiceNote: true`: on `/company/field`, record a voice note using the harness's canned
  transcription, confirm it appears on the job with the right author, add a photo, and clock in and out.
- Open the QR `/field` link and record a note under a typed name.
- Evaluation guard: send an email to an address that is not on the allowlist for `e2e-roofpros`. It must be skipped in the
  captured outbox (`_e2eOutbox`), while the owner's address still receives it.
- For each office type that can complete it: one call to request to job to quote to deposit to report to invoice journey.
  Use the existing call-to-cash steps instead of writing new API paths.

## 4. Production smoke (later, only after the owner approves - not built now)

- A separate workspace `smoke-luxor` in production. Mark it `purpose: test`. It is never a real client.
- Accounts on owner-controlled addresses only.
- The email allowlist guard is on. No phone line. No texting.
- Read-only page checks per role, plus one safe write cycle inside that workspace only.
- The run never reads or writes a client's workspace. It is not part of `npm run e2e:test`.

## 5. When to run what

Tiers follow AGENTS.md "Definition of done" item 2. Do not repeat a suite that is already green on the same commit.

- Worker, per change: `npx tsc --noEmit`, eslint on changed files, the related vitest files (for this work:
  `src/app/company/__tests__/role-expectations.test.ts`), and the one browser spec for the screen that changed.
- After this K5 work lands: `npx playwright test e2e/role-matrix.spec.ts` once, then the new `e2e/role-journeys.spec.ts` when
  Codex writes it.
- Integrator, once per merge batch: full `npx vitest run` and `npx next build`. Add `npm run e2e:call` when the batch touches
  calls, booking, pipeline, jobs or documents.
- Before a push: full `npm run e2e:test` on the final tree, or the changed-screen specs plus `e2e:call` when the owner says to
  skip the long gates. Say so in the handoff.
