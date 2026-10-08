// Local smoke-test harness switch (scripts/e2e/*, docs/SMOKE-HARNESS.md).
//
// True ONLY when every one of these holds, so it can never turn on in production:
//   - E2E_HARNESS=1 (set by scripts/e2e/up.mjs, nowhere else)
//   - the Firestore emulator host is a loopback address (a real project never sets FIRESTORE_EMULATOR_HOST)
//   - not running on Vercel, and NODE_ENV is not "production" — unless E2E_HARNESS_PROD=1 is ALSO set, which only the
//     harness's `--prod` mode does (a local `next start` against the emulators, to measure real load times)
//
// What it unlocks (all local-only): Admin SDK without a service account, emails captured to the
// `_e2eOutbox` collection instead of Resend, deterministic AI parsing for field notes.
export function isE2EHarness(): boolean {
  if (process.env.E2E_HARNESS !== "1") return false;
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === "production" && process.env.E2E_HARNESS_PROD !== "1") return false;
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
}

export const E2E_OUTBOX_COLLECTION = "_e2eOutbox";
