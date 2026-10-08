import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.send }));
import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/company/upgrade-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "b", { businessName: "Roof Co", products: { calls: false, field: true, billing: true } });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "u", email: "owner@roof.co", superadmin: false } });
  mocks.firestore.mockReset().mockReturnValue(db);
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("Ask Luxor to add it", () => {
  it("records the ask on the client and emails Luxor once a day", async () => {
    expect(await (await POST(request({ businessId: "b", product: "calls" }))).json()).toMatchObject({ ok: true, notified: true });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "connect@luxordev.com", subject: expect.stringContaining("Roof Co wants AI calls & booking") }));
    expect(db.__peek("businesses", "b")).toMatchObject({ upgradeRequests: { calls: { by: "owner@roof.co" } } });
    expect(await (await POST(request({ businessId: "b", product: "calls" }))).json()).toMatchObject({ notified: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("ignores products already included, unknown products and superadmin previews", async () => {
    expect(await (await POST(request({ businessId: "b", product: "field" }))).json()).toMatchObject({ alreadyIncluded: true });
    expect((await POST(request({ businessId: "b", product: "payroll" }))).status).toBe(400);
    mocks.verify.mockResolvedValueOnce({ user: { uid: "a", superadmin: true } });
    expect(await (await POST(request({ businessId: "b", product: "calls" }))).json()).toMatchObject({ preview: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
