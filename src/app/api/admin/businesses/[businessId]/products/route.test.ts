import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/products/productCache", () => ({ invalidateProducts: mocks.invalidate }));
import { POST } from "./route";

const context = { params: Promise.resolve({ businessId: "b" }) };
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/businesses/b/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "b", { businessName: "Roof Co" });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "admin", email: "a@x.co" } });
  mocks.firestore.mockReset().mockReturnValue(db);
  mocks.invalidate.mockReset();
});

describe("superadmin products", () => {
  it("turns AI calls off, stores all three explicitly, audits it and clears the cache", async () => {
    const res = await POST(request({ products: { calls: false } }), context);
    expect(res.status).toBe(200);
    expect(db.__peek("businesses", "b")).toMatchObject({ products: { calls: false, field: true, billing: true } });
    expect(mocks.invalidate).toHaveBeenCalledWith("b");
  });
  it("refuses Billing without Jobs, unknown products and non-booleans", async () => {
    expect((await POST(request({ products: { field: false, billing: true } }), context)).status).toBe(400);
    expect((await POST(request({ products: { payroll: true } }), context)).status).toBe(400);
    expect((await POST(request({ products: { calls: "no" } }), context)).status).toBe(400);
    expect((await POST(request({}), context)).status).toBe(400);
  });
  it("is superadmin only", async () => {
    mocks.verify.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) });
    expect((await POST(request({ products: { calls: false } }), context)).status).toBe(401);
    expect(db.__peek("businesses", "b")).not.toHaveProperty("products");
  });
});
