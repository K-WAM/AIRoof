import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: PUT /api/admin/businesses/[businessId]/config wrote the business document and THEN read the
// onboarding / integration docs inside the same transaction. Firestore forbids reads after writes, so every
// real save failed with a 500 ("Firestore transactions require all reads to be executed before all writes").
// The old mocks accepted any order, so no test caught it. This fake transaction enforces the real rule.

const mocks = vi.hoisted(() => ({ verifySuperadmin: vi.fn(), getAdminFirestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));

type Ref = { path: string; id: string };

function makeDb(existing: Record<string, Record<string, unknown>>) {
  const writes: Array<{ op: string; path: string; data: unknown }> = [];
  const ref = (collection: string, id: string): Ref => ({ path: `${collection}/${id}`, id });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      let wrote = false;
      const tx = {
        async get(r: Ref) {
          if (wrote) throw new Error("Firestore transactions require all reads to be executed before all writes.");
          const data = existing[r.path];
          return { exists: data !== undefined, data: () => data };
        },
        update(r: Ref, data: unknown) { wrote = true; writes.push({ op: "update", path: r.path, data }); },
        set(r: Ref, data: unknown) { wrote = true; writes.push({ op: "set", path: r.path, data }); },
      };
      return fn(tx);
    },
  };
  return { db, writes };
}

const params = { params: Promise.resolve({ businessId: "biz-1" }) };
function put(body: unknown) {
  return new NextRequest("http://localhost/api/admin/businesses/biz-1/config", { method: "PUT", body: JSON.stringify(body) });
}
const business = { businessId: "biz-1", businessName: "Test Roofing", industry: "roofing", planTier: "standard", emergencyRules: ["x"], approvedFaqs: [] };

describe("admin business config save — Firestore transaction ordering", () => {
  beforeEach(() => {
    mocks.verifySuperadmin.mockReset().mockResolvedValue({ user: { uid: "superadmin" } });
    mocks.getAdminFirestore.mockReset();
  });

  it("saves an ElevenLabs provider config when the onboarding and integration docs do not exist yet", async () => {
    const { db, writes } = makeDb({ "businesses/biz-1": business });
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const res = await PUT(put({
      active: true,
      notificationEmail: "owner@example.com",
      voiceProvider: "elevenlabs",
      elevenlabs: { agentId: "agent_abc", phoneNumberId: "phnum_abc", phoneNumber: "+15615550100" },
    }), params);
    expect(res.status).toBe(200);
    const paths = writes.map((w) => `${w.op}:${w.path}`);
    expect(paths).toContain("update:businesses/biz-1");
    expect(paths).toContain("set:businessOnboarding/biz-1");
    expect(paths).toContain("set:businessIntegrationStatus/biz-1");
    const bizWrite = writes.find((w) => w.path === "businesses/biz-1")!.data as Record<string, unknown>;
    expect(bizWrite.voiceProvider).toBe("elevenlabs");
    expect(bizWrite.elevenlabs).toEqual({ agentId: "agent_abc", phoneNumberId: "phnum_abc", phoneNumber: "+15615550100" });
  });

  it("also saves when the onboarding and integration docs already exist (update path)", async () => {
    const { db, writes } = makeDb({
      "businesses/biz-1": business,
      "businessOnboarding/biz-1": { businessId: "biz-1" },
      "businessIntegrationStatus/biz-1": { businessId: "biz-1" },
    });
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const res = await PUT(put({ notificationEmail: "owner@example.com" }), params);
    expect(res.status).toBe(200);
    expect(writes.map((w) => `${w.op}:${w.path}`)).toEqual(expect.arrayContaining([
      "update:businesses/biz-1", "update:businessOnboarding/biz-1", "update:businessIntegrationStatus/biz-1",
    ]));
  });
});
