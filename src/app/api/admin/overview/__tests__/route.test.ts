import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
const getUsers = vi.fn();
let authAvailable = true;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => db,
  getAdminAuth: () => (authAvailable ? { getUsers: (...a: unknown[]) => getUsers(...a) } : null),
}));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: async () => ({ user: { uid: "sa", email: "sa@luxor.test" } }) }));
// The month's calls/meter are read by the shared helper (its own query uses .select(), which the fake lacks).
const readUsage = vi.fn();
vi.mock("@/lib/usage/businessMonthUsage", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/businessMonthUsage")>()),
  readBusinessMonthUsage: (...a: unknown[]) => readUsage(...a),
}));
import { GET } from "../route";

const get = () => GET(new NextRequest("http://localhost/api/admin/overview"));
const usage = (cost: number) => ({ usage: { calls: 3, callsCapped: false, phoneMinutes: 9, voiceNotes: 2, voiceNoteMinutes: 1, typedNotes: 1 }, cost: { phone: cost, ai: 0, total: cost } });

beforeEach(() => {
  db = makeFakeDb();
  authAvailable = true;
  readUsage.mockReset().mockImplementation(async (_db: unknown, id: string) => usage(id === "apex" ? 40 : 5));
  getUsers.mockReset().mockImplementation(async (ids: Array<{ uid: string }>) => ({
    users: ids.map(({ uid }) => ({ uid, metadata: { lastSignInTime: uid === "u1" ? new Date().toUTCString() : null } })),
  }));
  db.__seed("businesses", "apex", {
    businessName: "Apex Roofing", industry: "roofing", accountPurpose: "client", voiceProvider: "elevenlabs",
    elevenlabs: { agentId: "agent_1" }, billing: { planName: "Suite", monthlyAmount: 2000 }, createdAt: Date.now() - 90 * 86_400_000,
  });
  db.__seed("businesses", "demo-roofing", { businessName: "Demo", accountPurpose: "client" });
  db.__seed("businesses", "gone", { businessName: "Gone", accountPurpose: "archived" });
  db.__seed("businessUsers", "u1", { businessId: "apex", role: "owner" });
  db.__seed("businessUsers", "u2", { businessId: "apex", role: "staff" });
  db.__seed("businessUsers", "sa", { businessId: "apex", role: "superadmin" });
  db.__seed("luxorInvoices", "LX-1", { businessId: "apex", clientName: "Apex Roofing", total: 2000, status: "sent", dueDate: "2020-01-01", createdAt: 1 });
});

describe("GET /api/admin/overview", () => {
  it("combines plan price, team, sign-ins, usage and invoices; Luxor's account and archived clients are left out", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body.signInsKnown).toBe(true);
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0]).toMatchObject({ businessId: "apex", monthlyAmount: 2000, users: 2, activeUsers: 1, cost: 40, margin: 1960, billing: { kind: "overdue", invoiceId: "LX-1" } });
    expect(body.metrics).toMatchObject({ monthlyRevenue: 2000, unpaid: 2000, overdueCount: 1, demoCost: 5 });
    expect(body.attention[0]).toMatchObject({ tone: "urgent", href: "/admin/invoices?invoice=LX-1" });
    // No usage reads for an archived account; never the superadmin's own uid in the sign-in lookup.
    expect(readUsage.mock.calls.map((c) => c[1]).sort()).toEqual(["apex", "demo-roofing"]);
    expect(getUsers.mock.calls.flatMap((c) => c[0]).map((x: { uid: string }) => x.uid).sort()).toEqual(["u1", "u2"]);
  });

  it("still loads when sign-in times can't be read, and says so", async () => {
    authAvailable = false;
    const body = await (await get()).json();
    expect(body.signInsKnown).toBe(false);
    expect(body.clients[0].lastSignInAt).toBeNull();
    expect(body.attention.some((a: { text: string }) => a.text.includes("signed in"))).toBe(false);
  });
});
