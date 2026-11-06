import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { POST } from "./route";

const context = { params: Promise.resolve({ businessId: "b" }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/businesses/b/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let db: ReturnType<typeof makeFakeDb>;

const original = {
  businessName: "Fake Co",
  industry: "roofing",
  active: true,
  phoneNumber: "+15551234567",
  businessHours: { monday: "9-5" },
  billing: { monthlyAmount: 299 },
  accountPurpose: "client",
  createdAt: 1,
  updatedAt: 2,
};

/** Everything the archive route is allowed to touch, removed so the rest can be compared byte-for-byte. */
function withoutArchiveFields(doc: Record<string, unknown>) {
  const copy = { ...doc };
  delete copy.accountPurpose;
  delete copy.previousAccountPurpose;
  delete copy.updatedAt;
  return copy;
}

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "b", { ...original });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "admin", email: "a@x.co" } });
  mocks.firestore.mockReset().mockReturnValue(db);
});

describe("superadmin archive client", () => {
  it("is superadmin only and never reads or writes the business", async () => {
    mocks.verify.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) });
    const res = await POST(request({ archived: true }), context);
    expect(res.status).toBe(401);
    expect(mocks.firestore).not.toHaveBeenCalled();
    expect(db.__peek("businesses", "b")).toEqual(original);
  });

  it("archives by changing only accountPurpose, previousAccountPurpose and updatedAt", async () => {
    const res = await POST(request({ archived: true }), context);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ success: true, accountPurpose: "archived", previousAccountPurpose: "client" });

    const after = db.__peek("businesses", "b")!;
    expect(after.accountPurpose).toBe("archived");
    expect(after.previousAccountPurpose).toBe("client");
    expect(after.updatedAt).not.toBe(original.updatedAt);
    expect(withoutArchiveFields(after)).toEqual(withoutArchiveFields(original as Record<string, unknown>));

    expect(db.__list("adminAuditEvents")).toHaveLength(1);
    expect(db.__list("adminAuditEvents")[0].data).toMatchObject({ action: "business.archived", actorUid: "admin" });
  });

  it("restores the purpose it had before and clears previousAccountPurpose", async () => {
    db.__seed("businesses", "b", { ...original, accountPurpose: "archived", previousAccountPurpose: "test" });
    const res = await POST(request({ archived: false }), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, accountPurpose: "test", previousAccountPurpose: null });

    const after = db.__peek("businesses", "b")!;
    expect(after.accountPurpose).toBe("test");
    expect(after).not.toHaveProperty("previousAccountPurpose");
    expect(withoutArchiveFields(after)).toEqual(withoutArchiveFields(original as Record<string, unknown>));
    expect(db.__list("adminAuditEvents")[0].data).toMatchObject({ action: "business.restored" });
  });

  it("restores to unclassified when the client had no purpose before archiving", async () => {
    db.__seed("businesses", "b", { ...original, accountPurpose: "archived" });
    const res = await POST(request({ archived: false }), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, accountPurpose: null });
    expect(db.__peek("businesses", "b")).not.toHaveProperty("accountPurpose");
  });

  it("refuses demo tenants", async () => {
    db.__seed("businesses", "b", { ...original, isDemo: true });
    const res = await POST(request({ archived: true }), context);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Demo accounts can't be archived." });
    expect(db.__peek("businesses", "b")).toMatchObject({ ...original, isDemo: true });
    expect(db.__peek("businesses", "b")).not.toHaveProperty("previousAccountPurpose");
  });

  it("refuses malformed bodies and restoring a client that is not archived", async () => {
    expect((await POST(request({}), context)).status).toBe(400);
    expect((await POST(request({ archived: "yes" }), context)).status).toBe(400);
    expect((await POST(request({ archived: false }), context)).status).toBe(400);
    expect(db.__peek("businesses", "b")).toEqual(original);
  });
});
