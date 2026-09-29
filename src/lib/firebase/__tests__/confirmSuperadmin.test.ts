import { beforeEach, describe, expect, it, vi } from "vitest";

// T-170: a superadmin custom claim counts only while the live Auth record still holds it.
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("firebase-admin", () => ({
  apps: [],
  app: vi.fn(),
  initializeApp: vi.fn(() => ({})),
  credential: { cert: vi.fn(() => ({})) },
  firestore: Object.assign(vi.fn(() => ({ settings: vi.fn() })), {}),
  auth: vi.fn(() => ({ getUser: mocks.getUser })),
}));

vi.mock("@/lib/e2e/harness", () => ({ isE2EHarness: () => false }));
// The global test setup stubs this module; this file tests the real one.
vi.unmock("@/lib/firebase/admin");

function token(overrides: Record<string, unknown> = {}) {
  return { uid: "root", auth_time: 2_000_000, superadmin: true, ...overrides } as never;
}

describe("confirmSuperadminClaim", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getUser.mockReset();
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "p" }));
  });

  it("refuses a token without the claim, without a lookup", async () => {
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token({ superadmin: undefined }))).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("refuses when the claim was removed from the account", async () => {
    mocks.getUser.mockResolvedValue({ customClaims: {}, disabled: false });
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token())).toBe(false);
  });

  it("refuses a disabled account", async () => {
    mocks.getUser.mockResolvedValue({ customClaims: { superadmin: true }, disabled: true });
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token())).toBe(false);
  });

  it("refuses a session signed in before its tokens were revoked", async () => {
    mocks.getUser.mockResolvedValue({
      customClaims: { superadmin: true },
      disabled: false,
      tokensValidAfterTime: new Date(3_000_000 * 1000).toUTCString(),
    });
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token())).toBe(false);
  });

  it("refuses when the lookup fails (fail closed)", async () => {
    mocks.getUser.mockRejectedValue(new Error("network"));
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token())).toBe(false);
  });

  it("accepts a live claim and memoizes it for the same sign-in", async () => {
    mocks.getUser.mockResolvedValue({
      customClaims: { superadmin: true },
      disabled: false,
      tokensValidAfterTime: new Date(1_000_000 * 1000).toUTCString(),
    });
    const { confirmSuperadminClaim } = await import("@/lib/firebase/admin");
    expect(await confirmSuperadminClaim(token())).toBe(true);
    expect(await confirmSuperadminClaim(token())).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});
