import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: "", verify: vi.fn(), confirm: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.token }) }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/lib/firebase/admin", () => ({ verifyIdToken: mocks.verify, confirmSuperadminClaim: mocks.confirm }));
import { requireSuperadminPage } from "../requireSuperadminPage";

describe("privileged page gate", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.token = ""; });
  it("redirects missing sessions before token verification", async () => {
    await expect(requireSuperadminPage("/admin")).rejects.toThrow("/login?next=%2Fadmin");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("redirects invalid or expired sessions to login", async () => {
    mocks.token = "expired"; mocks.verify.mockResolvedValue(null);
    await expect(requireSuperadminPage("/hub")).rejects.toThrow("/login?next=%2Fhub");
  });
  it("rejects a stale profile role or revoked live claim", async () => {
    mocks.token = "member"; mocks.verify.mockResolvedValue({ uid: "u", role: "superadmin" });
    mocks.confirm.mockResolvedValue(false);
    await expect(requireSuperadminPage("/admin")).rejects.toThrow("/company/dashboard");
  });
  it("allows only a confirmed live claim", async () => {
    mocks.token = "admin"; mocks.verify.mockResolvedValue({ uid: "u", superadmin: true });
    mocks.confirm.mockResolvedValue(true);
    await expect(requireSuperadminPage("/hub")).resolves.toBeUndefined();
  });
});
