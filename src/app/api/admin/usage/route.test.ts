import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const m = vi.hoisted(() => ({ db: null as FakeDb | null, usage: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => m.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: async () => ({ user: { uid: "sa" } }) }));
vi.mock("@/lib/usage/businessMonthUsage", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/businessMonthUsage")>()),
  readBusinessMonthUsage: (...args: unknown[]) => m.usage(...args),
  readBusinessCompanyActivity: async () => ({ jobs: [], invoices: [] }),
}));
import { GET } from "./route";

const rdsf = { id: "rdsf", name: "Roof Pros South", shortName: "RDSF", isDefault: true };
const rcu = { id: "rcu", name: "Concepts Unlimited", shortName: "RCU" };

beforeEach(() => {
  m.db = makeFakeDb();
  m.usage.mockReset().mockResolvedValue({
    usage: {
      calls: 2, callsCapped: false, phoneMinutes: 3, voiceNotes: 1, voiceNoteMinutes: 1, typedNotes: 0,
      byCompany: { rcu: { calls: 2, phoneMinutes: 3, vapiMinutes: 0, voiceNotes: 1, voiceNoteMinutes: 1, typedNotes: 0, notesRead: 0 } },
    },
    cost: { phone: 0, ai: 0, total: 0 },
    costBasis: { calls: 2, phoneMinutes: 3, vapiMinutes: 0, voiceNoteMinutes: 1, notesRead: 0 },
  });
  m.db!.__seed("businesses", "single", { businessName: "Single Co" });
  m.db!.__seed("businesses", "multi", { businessName: "Multi Co", billingCompanies: [rdsf, rcu] });
  m.db!.__seed("businessUsers", "u1", { businessId: "single" });
  m.db!.__seed("businessUsers", "u2", { businessId: "multi" });
});

describe("GET /api/admin/usage byCompany (T-317 fix)", () => {
  it("returns byCompany only for a multi-company client", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/usage?month=2026-11"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const single = body.businesses.find((b: { businessId: string }) => b.businessId === "single");
    const multi = body.businesses.find((b: { businessId: string }) => b.businessId === "multi");
    expect(single.usage.byCompany).toBeUndefined();
    expect(multi.usage.byCompany).toEqual(expect.objectContaining({ rcu: expect.anything() }));
  });
});
