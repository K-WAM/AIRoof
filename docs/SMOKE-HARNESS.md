# SMOKE-HARNESS.md — a local copy of the whole product that agents can click through

Built 2026-09-26. **Use this instead of "I could not check it in a browser."** It needs **no real keys, no login on anyone's
part, and it cannot reach any live service.** It is the same Next.js app running against the Firebase **Auth + Firestore
emulators**, with a seeded world, real login, real webhooks, captured email, and Playwright on top.

## What you get

| Piece | What it is |
|---|---|
| **A running app** | `next dev` on `http://localhost:<port>` (port is per-checkout, printed by `e2e:up`) talking to local emulators |
| **Real login** | 8 seeded accounts (password `E2e-Passw0rd!`), signed in through the real login form |
| **4 tenants** | `e2e-roofing` (jobs mode), `e2e-dental` (appointments mode, no Jobs tab), `demo-roofing` (what Demo Studio expects), `e2e-empty` ("Fresh Roofing Co": phone line only, nothing else — for first-run/empty states) |
| **Phone calls** | `simulateCall()` drives the REAL ElevenLabs webhooks (initiation → tools → signed post-call) — no phone, no ElevenLabs |
| **Email** | Captured to the `_e2eOutbox` collection instead of Resend; read with `outbox()` — exactly what a customer would get |
| **AI field notes** | A deterministic parser stands in for OpenAI (understands "Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.") |
| **Browser tests** | Playwright, desktop 1280 px + phone 375 px, screenshots you can open and look at |

## Accounts

All use password **`E2e-Passw0rd!`**. In specs: `as("owner")`. In scripts: `api("owner")`.

| Key | Email | Tenant | Role |
|---|---|---|---|
| `owner` | owner@roofing.e2e.test | e2e-roofing | owner |
| `staff` | staff@roofing.e2e.test | e2e-roofing | staff |
| `crew` | crew@roofing.e2e.test | e2e-roofing | staff, trade "technician" |
| `viewer` | viewer@roofing.e2e.test | e2e-roofing | viewer (read-only) |
| `fieldCrew` | fieldcrew@roofing.e2e.test | e2e-roofing | crew (field-only role, T-150), trade "installer" — lands on /company/field, no office screens |
| `dentalOwner` | owner@dental.e2e.test | e2e-dental | owner |
| `emptyOwner` | owner@empty.e2e.test | e2e-empty | owner (the only member — keep it that way, the Team empty state and checklist depend on it) |
| `superadmin` | superadmin@e2e.test | (platform) | superadmin — Hub/Admin, `?preview=<tenant>` |

The AI phone lines: roofing `+15550100`, dental `+15550200`, demo `+15550300`, empty `+15550400`.

## Start / stop (do this once per session)

```powershell
npm run e2e:up:bg      # starts emulators + app in the background, returns when ready (first time ~3 min while pages compile)
npm run e2e:test       # every browser spec, desktop + phone
npm run e2e:call       # the whole customer story over the API, no browser (~15 s)
npm run e2e:booking    # the S1–S8 booking scenarios over the real webhooks (~20 s)
npm run e2e:down       # stop everything
npm run e2e:seed       # wipe the emulators and re-seed (accounts + tenants only) — was pointing at a missing seed.mjs until 2026-09-28
```

`e2e:up` (foreground) works too; Ctrl+C stops it. If it says "already running," it is. Logs: `.e2e/app.log`, `.e2e/emulators.log`.
Needs Java (Temurin 21 is installed) and the global `firebase` CLI — both already on this machine.
Playwright's Chromium: `npx playwright install chromium` if a browser is ever missing.

**Worktrees:** the ports are derived from the checkout's path, so the main repo and every worktree get their own app and
emulator ports and can run at the same time. If two ever collide set `E2E_PORT_OFFSET=10` (any multiple of 10). Each worktree has
its own `.e2e/` and `.next/`. A worktree only needs its `node_modules` junction — nothing else (no `.env`). Run
`npm run e2e:up:bg` **from inside your worktree** so you test YOUR code.

## Writing a browser test

```ts
// e2e/my-feature.spec.ts
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { simulateCall, api, must, outbox } from "../scripts/e2e/lib.cjs";

test("owner can do the thing", async ({ as }) => {
  const page = await as("owner");                 // already signed in
  await page.goto("/company/jobs");
  await settle(page);                             // waits for the page to go quiet
  await page.getByRole("button", { name: "New Job" }).click();
  await shot(page, "new-job-form");               // -> test-results/screens/<desktop|phone>/new-job-form.png
  await expectHealthy(page);                      // fails on JS errors, 5xx/404 API calls, crash overlays, sideways scroll
});
```

- **Look at the screenshots** (open the PNGs) when checking spacing. `expectHealthy` catches errors and horizontal overflow, not "looks off."
- Make data through the real API rather than clicking every form: `const owner = await api("owner"); must(await owner.post("/api/jobs", {...}))`.
- Simulate a call: `await simulateCall({ tools: [["bookAppointment", {...}]], transcript: [["user", "..."]] })`.
- Read what the app emailed: `await outbox({ to: "customer@x.test" })` → `{ subject, html, text }`.
- Read/verify stored data: `readDoc("businesses/e2e-roofing/jobs/J-1000")`, `readCollection(...)`.
- Run one file/project: `npx playwright test e2e/photos.spec.ts --project=phone`. Debug: `--headed`, or open `playwright-report/`.
- The suite shares one database and does not clean up; give your data unique names (a timestamp tag) and never assume an empty table.

## What is already covered

| Spec | Proves |
|---|---|
| `e2e/smoke.spec.ts` | 31 page loads (right role, right tenant) load with no errors and no sideways scroll; industry gating (dental has no Jobs); a client owner cannot open Admin; Feedback hidden for superadmin |
| `e2e/call-to-cash.spec.ts` | call → Calls page with transcript → Pipeline request → Review card → Confirm (email captured) → Create Job (remembers the call) → field note → photos → finding → quote → report (no prices) → invoice → paid, in the UI on desktop and phone |
| `e2e/photos.spec.ts` | Photos tab drag-and-drop by mouse and keyboard persists across a reload; Before/After pairs render |
| `e2e/empty-states.spec.ts` | (T-144) as the empty owner: every screen's empty state + its one primary button, each button lands in the right place, all 8 job tabs, the setup checklist counts up after "Load example prices"; roofing viewer never offered a write action (and every page actually loads); dental reads "provider". Wipes `e2e-empty`'s subcollections in `beforeAll` so reruns stay honest |
| `e2e/bilingual-crew-day.spec.ts` | (2026-10-08) an English + a Spanish call through the ElevenLabs webhooks — the Spanish one is marked "Spoke Spanish"/"Spanish" on Calls and Pipeline; a Spanish field note is detected with no setting; crew assignment emails the crew + members; a fill-in worker from outside the crew runs office → site → lunch → back → note → site out → office out; a Project-price quote and its invoice email show one price and never the lines; the findings picker fits a phone |
| `scripts/e2e/scenarios/call-to-cash.cjs` | the same story with no browser, step by step pass/fail |

**Known phone-overflow bugs:** `KNOWN_PHONE_OVERFLOW` in `e2e/smoke.spec.ts` has been **empty since T-129 (2026-09-27)** — every page fits a
375 px phone. Keep it empty: a new overflow is a bug to fix, not a line to add. (If one must be tracked temporarily, add it there; the test fails
once a listed page stops overflowing, so the list stays honest.)

**Blind spots that bit us (T-144, 2026-09-27):** `toBeVisible()` passes for something off-screen in a sideways-scrolling container and for text
the same color as its background; a "no X on this page" check passes on an error page. Read the phone screenshots, and see AGENTS.md
"Browser and end-to-end testing" for the rules that came out of it.

## What it cannot check (say so in your report, do not claim it)

- Real phone audio, ElevenLabs/Twilio behaviour, voice quality, latency on a real call.
- Real email inbox placement / DKIM / spam (email is captured, not sent). Recordings (no ElevenLabs key locally → `/api/calls/*/audio` answers 503; the tests ignore exactly that).
- Whisper voice transcription (field-audio route) — typed field notes use the deterministic parser. Real OpenAI parsing quality.
- Production-only behaviour: Vercel limits (4.5 MB request body), `next build` output, real Firebase quotas/indexes (the emulator does not enforce composite indexes).
- Google sign-in.

## How it stays safe (do not weaken this)

- `src/lib/e2e/harness.ts` `isE2EHarness()` is true only when `E2E_HARNESS=1` **and** `FIRESTORE_EMULATOR_HOST` is a loopback address **and** not on Vercel **and** `NODE_ENV !== "production"`. Unit-tested (`harness.test.ts`). It gates: Admin SDK without a service account, email capture, the deterministic AI parser.
- `scripts/e2e/config.cjs` `appEnv()` **blanks** every provider key (OpenAI, DeepSeek, Resend, Vapi, ElevenLabs, Stripe, Firebase service account) for the app process, even if `.env.local` has them. Do not remove the blanking.
- Everything else (client Auth emulator hook, CSP allowance) is inert unless `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` is set, which only `e2e:up` does.
- No secrets in this folder: the secrets in `config.cjs` are throwaway values for the emulator only.

## Files

`scripts/e2e/` — `config.cjs` (ports, accounts, tenants, env) · `seed.cjs` · `lib.cjs` (api/simulateCall/outbox helpers) · `up.mjs` / `down.mjs` · `scenarios/call-to-cash.cjs`
`e2e/` — `fixtures.ts` · `global-setup.ts` (logs in every account once, saves `.auth/`) · specs · `playwright.config.ts` at the repo root.
App hooks: `src/lib/e2e/{harness,fixtureAi}.ts`, `src/lib/firebase/{admin,client}.ts`, `src/lib/comms/send.ts`, `src/lib/ai/deepseekClient.ts`, `next.config.ts` (CSP).

## Troubleshooting

- *"The smoke harness is not running"* → `npm run e2e:up:bg`.
- *Login failed in global-setup* → `npm run e2e:seed`, then re-run. Or the app is still compiling; the first run is slow.
- *Port in use* → `npm run e2e:down`, or set `E2E_PORT_OFFSET`.
- *Emulator won't start* → `.e2e/emulators.log`; needs Java on PATH.
- *A page 404s on `/api/company/bootstrap` for superadmin* → the tenant in `?preview=` does not exist; use `e2e-roofing`, `e2e-dental` or `demo-roofing`.
- The Next dev "N" badge in screenshots is Next's own dev indicator, not the app.
