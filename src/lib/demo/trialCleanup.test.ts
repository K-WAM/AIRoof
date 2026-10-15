import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ db: null as unknown, removeTree: vi.fn(), deleteUser: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db, getAdminAuth: () => ({ deleteUser: mocks.deleteUser }) }));
import { GET } from "@/app/api/cron/demo-trials/route";
describe("bounded private-demo cleanup", () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "unit-demo-cleanup-secret");
    db = makeFakeDb(); mocks.db = { ...db, recursiveDelete: mocks.removeTree };
    mocks.removeTree.mockReset().mockResolvedValue(undefined); mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = (secret = "unit-demo-cleanup-secret") => new NextRequest("https://example.test/api/cron/demo-trials", { headers: { authorization: `Bearer ${secret}` } });
  it("refuses missing/wrong cron authorization without deleting anything", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.removeTree).not.toHaveBeenCalled(); expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("skips foreign tenants, forged user IDs and roots without both demo markers", async () => {
    for (const [index, overrides] of [
      { businessId: "real-client" }, { uid: "real-owner" }, { marker: false },
    ].entries()) {
      const id = String(index + 1).repeat(32), businessId = `demo-trial-roofing-${id}`, uid = `demo-trial-${id}`;
      db.__seed("demoTrials", id, { expiresAt: 0, businessId, uid, ...overrides });
      db.__seed("businesses", businessId, { isDemo: true, isDemoTrial: overrides.marker !== false, demoTrialExpiresAt: 0 });
      db.__seed("businessUsers", uid, { businessId });
    }
    expect((await GET(request())).status).toBe(200);
    expect(mocks.removeTree).not.toHaveBeenCalled(); expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("deletes only a matched expired private demo and its exact ephemeral identity", async () => {
    const id = "d".repeat(32), businessId = `demo-trial-roofing-${id}`, uid = `demo-trial-${id}`;
    db.__seed("demoTrials", id, { expiresAt: 0, businessId, uid });
    db.__seed("businesses", businessId, { isDemo: true, isDemoTrial: true, demoTrialExpiresAt: 0 });
    db.__seed("businessUsers", uid, { businessId });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ removed: 1 });
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(uid);
    expect(mocks.removeTree).toHaveBeenCalledOnce();
    expect(mocks.removeTree.mock.calls[0][0].path).toBe(`businesses/${businessId}`);
    expect(db.__peek("businessUsers", uid)).toBeUndefined();
    expect(db.__peek("demoTrials", id)).toBeUndefined();
  });
});
