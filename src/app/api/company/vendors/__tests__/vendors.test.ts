import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
type Gate = { user: { uid: string; role?: string; superadmin: boolean } } | { error: Response };
let gate: (roles: string[]) => Gate = () => ({ user: { uid: "o", role: "owner", superadmin: false } });
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async (_req: unknown, _biz: string, roles: string[]) => gate(roles),
}));
import { GET, POST } from "../route";
import { PATCH } from "../[vendorId]/route";

const url = "http://localhost/api/company/vendors";
const json = (method: string, body: unknown) => new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const asRole = (role: string) => (roles: string[]): Gate =>
  roles.includes(role) ? { user: { uid: "u", role, superadmin: false } } : { error: new Response(null, { status: 403 }) };
const ctx = (vendorId: string) => ({ params: Promise.resolve({ vendorId }) });

beforeEach(() => {
  db = makeFakeDb();
  gate = asRole("owner");
  db.__seed("businesses/biz/vendors", "v1", { vendorId: "v1", name: "GAF", type: "Manufacturer", city: "Parsippany", state: "NJ", phone: "+19735551212", notes: "n", active: true, provenance: { origin: "client", source: "jobba:vendors.csv", addedAt: 1 }, createdAt: 1, updatedAt: 1 });
  db.__seed("businesses/biz/vendors", "v2", { vendorId: "v2", name: "Atlas", active: true, provenance: { origin: "luxor-sample", source: "x", addedAt: 1 }, createdAt: 2, updatedAt: 2 });
  db.__seed("businesses/biz/vendors", "v3", { vendorId: "v3", name: "Abc old", active: false, provenance: { origin: "client", source: "x", addedAt: 1 }, createdAt: 3, updatedAt: 3 });
});

describe("GET /api/company/vendors", () => {
  it("lists active first then by name, for owner, staff and view-only", async () => {
    for (const role of ["owner", "staff", "viewer"]) {
      gate = asRole(role);
      const res = await GET(new NextRequest(`${url}?businessId=biz`));
      expect(res.headers.get("cache-control")).toContain("private");
      const { vendors } = await res.json();
      expect(vendors.map((v: { name: string }) => v.name)).toEqual(["Atlas", "GAF", "Abc old"]);
    }
  });

  it("refuses a crew login, needs a businessId", async () => {
    gate = asRole("crew");
    expect((await GET(new NextRequest(`${url}?businessId=biz`))).status).toBe(403);
    expect((await GET(new NextRequest(url))).status).toBe(400);
  });
});

describe("POST /api/company/vendors", () => {
  it("creates a vendor as client data with a normalized phone and state", async () => {
    const res = await POST(json("POST", { businessId: "biz", name: " Owens Corning ", type: "Manufacturer", phone: "(800) 438-7465", state: "oh", city: "Toledo" }));
    expect(res.status).toBe(201);
    const { vendor } = await res.json();
    expect(vendor).toMatchObject({ name: "Owens Corning", phone: "+18004387465", state: "OH", city: "Toledo", active: true, provenance: { origin: "client", source: "app:library" } });
    expect(db.__peek("businesses/biz/vendors", vendor.vendorId)).toBeTruthy();
  });

  it("keeps a phone that does not parse as typed", async () => {
    const { vendor } = await (await POST(json("POST", { businessId: "biz", name: "X", phone: "ext 5" }))).json();
    expect(vendor.phone).toBe("ext 5");
  });

  it("owner and staff write, view-only does not, View-as does not", async () => {
    expect((await POST(json("POST", { businessId: "biz", name: "S" }))).status).toBe(201);
    gate = asRole("staff");
    expect((await POST(json("POST", { businessId: "biz", name: "T" }))).status).toBe(201);
    gate = asRole("viewer");
    expect((await POST(json("POST", { businessId: "biz", name: "U" }))).status).toBe(403);
    gate = () => ({ error: new Response(null, { status: 403 }) });
    expect((await POST(json("POST", { businessId: "biz", name: "V" }))).status).toBe(403);
    expect((await PATCH(json("PATCH", { businessId: "biz", notes: "x" }), ctx("v1"))).status).toBe(403);
    expect(db.__list("businesses/biz/vendors")).toHaveLength(5);
    expect(db.__peek("businesses/biz/vendors", "v1")?.notes).toBe("n");
  });

  it("enforces the caps and shapes", async () => {
    const bad = [
      { name: "" }, { name: "x".repeat(121) }, { name: "A", type: "x".repeat(61) }, { name: "A", address: "x".repeat(201) },
      { name: "A", notes: "x".repeat(1001) }, { name: "A", state: "Florida" }, { name: "A", email: "nope" }, { name: "A", city: 5 },
    ];
    for (const body of bad) expect((await POST(json("POST", { businessId: "biz", ...body }))).status).toBe(400);
    expect((await POST(json("POST", { name: "A" }))).status).toBe(400);
  });
});

describe("PATCH /api/company/vendors/[vendorId]", () => {
  it("edits, clears with empty text, never touches provenance, and 'delete' is active false", async () => {
    const res = await PATCH(json("PATCH", { businessId: "biz", notes: "", contactName: "Pat", provenance: { origin: "client" }, vendorId: "evil" }), ctx("v2"));
    expect(res.status).toBe(200);
    expect(db.__peek("businesses/biz/vendors", "v2")).toMatchObject({ contactName: "Pat", provenance: { origin: "luxor-sample" }, vendorId: "v2" });
    await PATCH(json("PATCH", { businessId: "biz", notes: "" }), ctx("v1"));
    expect(db.__peek("businesses/biz/vendors", "v1")?.notes).toBeUndefined();
    await PATCH(json("PATCH", { businessId: "biz", active: false }), ctx("v1"));
    expect(db.__peek("businesses/biz/vendors", "v1")?.active).toBe(false);
  });

  it("404s a missing vendor, 400s nothing-to-update and a blank name, staff may edit, viewer may not", async () => {
    expect((await PATCH(json("PATCH", { businessId: "biz", notes: "x" }), ctx("nope"))).status).toBe(404);
    expect((await PATCH(json("PATCH", { businessId: "biz" }), ctx("v1"))).status).toBe(400);
    expect((await PATCH(json("PATCH", { businessId: "biz", name: " " }), ctx("v1"))).status).toBe(400);
    gate = asRole("staff");
    expect((await PATCH(json("PATCH", { businessId: "biz", notes: "ok" }), ctx("v1"))).status).toBe(200);
    gate = asRole("viewer");
    expect((await PATCH(json("PATCH", { businessId: "biz", notes: "no" }), ctx("v1"))).status).toBe(403);
  });
});
