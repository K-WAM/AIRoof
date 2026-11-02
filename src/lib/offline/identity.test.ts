import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fieldIdentity, setOfflineIdentity } from "./identity";

const auth = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: async () => auth }));
beforeEach(() => {
  setOfflineIdentity(null);
  vi.stubGlobal("window", { location: { pathname: "/field" }, dispatchEvent: vi.fn() });
  vi.stubGlobal("sessionStorage", { setItem: vi.fn(), removeItem: vi.fn(), getItem: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ offlineOwner: "field:grant", businessId: "biz" })));
});
afterEach(() => { vi.unstubAllGlobals(); });
it.each(["anonymous", "staff", "superadmin"])("uses the field session on /field with %s Firebase state", async (state) => {
  auth.currentUser = state === "anonymous" ? null : { uid: state };
  if (state === "superadmin") setOfflineIdentity({ uid: state, preview: true });
  expect(await fieldIdentity()).toEqual({ uid: "field:grant", businessId: "biz" });
});
it("retains the signed-in staff identity on /company/field", async () => {
  vi.stubGlobal("window", { location: { pathname: "/company/field" }, dispatchEvent: vi.fn() });
  auth.currentUser = { uid: "staff" };
  setOfflineIdentity({ uid: "staff", businessId: "biz" });
  expect(await fieldIdentity()).toEqual({ uid: "staff", businessId: "biz" });
});
