// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { AuthProvider } from "../AuthContext";
import { offlineIdentity, setOfflineIdentity } from "@/lib/offline/identity";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  listener: null as ((user: User | null) => Promise<void>) | null,
  clear: vi.fn(async () => {}),
}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: async () => mocks.auth }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_auth: unknown, callback: typeof mocks.listener) => { mocks.listener = callback; return () => {}; } }));
vi.mock("@/lib/offline/readCache", () => ({ clearReadCache: mocks.clear }));
vi.mock("@/lib/auth/sessionFetch", () => ({ installSessionRetry: () => () => {}, safeExpiry: () => Date.now() + 3_600_000, writeSessionCookie: () => {} }));
vi.mock("@/lib/analytics/client", () => ({ setAnalyticsUser: () => {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.clear.mockClear(); mocks.listener = null; setOfflineIdentity(null); sessionStorage.clear(); });
const account = (uid: string) => ({ uid, email: `${uid}@test`, getIdTokenResult: async () => ({ token: uid, expirationTime: "later" }) }) as unknown as User;

describe("offline identity across sign-out", () => {
  it("clears the signed-out user's read cache through the common Firebase sign-out observer", async () => {
    mocks.auth.currentUser = account("a");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ profile: { businessId: "biz", role: "crew" } })));
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(mocks.listener).not.toBeNull());
    await act(async () => { await mocks.listener!(mocks.auth.currentUser); });
    expect(offlineIdentity()?.uid).toBe("a");
    mocks.auth.currentUser = null;
    await act(async () => { await mocks.listener!(null); });
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith("a");
    expect(offlineIdentity()).toBeNull();
  });
  it("cannot restore the old offline identity when its profile response finishes after sign-out", async () => {
    mocks.auth.currentUser = account("a");
    // Sign-out now also asks the server to clear the HttpOnly cookies, so the profile fetch is not the only
    // call: resolve that one by its own position instead of whichever call happened last.
    const resolvers: Array<(response: Response) => void> = [];
    const mockFetch = vi.fn(() => new Promise<Response>(done => { resolvers.push(done); }));
    vi.stubGlobal("fetch", mockFetch);
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(mocks.listener).not.toBeNull());
    const pending = mocks.listener!(mocks.auth.currentUser);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    mocks.auth.currentUser = null;
    await act(async () => {
      await mocks.listener!(null);
      resolvers[0](Response.json({ profile: { businessId: "biz", role: "crew" } }));
      await pending;
    });
    expect(offlineIdentity()).toBeNull();
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith("a");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]).toEqual(["/api/auth/session", { method: "DELETE", credentials: "same-origin", keepalive: true }]);
  });
});
