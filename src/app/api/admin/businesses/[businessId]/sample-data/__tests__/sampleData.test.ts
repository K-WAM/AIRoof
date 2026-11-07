import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifySuperadmin: async () => (allowed ? { user: { uid: "root", email: "connect@luxordev.com", superadmin: true } } : { error: new Response(null, { status: 403 }) }),
}));
import { DELETE, GET } from "../route";

const base = "http://localhost/api/admin/businesses/biz/sample-data";
const ctx = { params: Promise.resolve({ businessId: "biz" }) };
const del = (query = "") => DELETE(new NextRequest(`${base}${query}`, { method: "DELETE" }), ctx);
const prov = (origin: string) => ({ origin, source: "t", addedAt: 1 });

beforeEach(() => {
  db = makeFakeDb();
  allowed = true;
  db.__seed("businesses", "biz", { businessName: "Roof Doctors" });
  db.__seed("businesses/biz/staff", "s-client", { name: "Real", active: true, provenance: prov("client"), crewId: "c1", crewProvenance: prov("luxor-sample") });
  db.__seed("businesses/biz/staff", "s-sample", { name: "Fake", active: true, provenance: prov("luxor-sample"), crewId: "c1", crewProvenance: prov("luxor-sample") });
  db.__seed("businesses/biz/staff", "s-confirmed", { name: "Kept", active: true, provenance: prov("client"), crewId: "c1", crewProvenance: prov("client") });
  db.__seed("businesses/biz/vendors", "v1", { name: "GAF", active: true, provenance: prov("client") });
  db.__seed("businesses/biz/vendors", "v2", { name: "Fake Vendor", active: true, provenance: prov("luxor-sample") });
  db.__seed("businesses/biz/vendors", "v3", { name: "Old row", active: true });
  db.__seed("businesses/biz/jobs", "j-sample", { title: "Demo job", provenance: prov("luxor-sample") });
  db.__seed("businesses/biz/jobs/j-sample/updates", "u1", { text: "x" });
  db.__seed("businesses/biz/jobs", "j-client", { title: "Real job", provenance: prov("client") });
  db.__seed("businesses/biz/customers", "cu1", { name: "Real customer" });
});

describe("GET sample-data", () => {
  it("counts client, sample and not-marked per collection", async () => {
    const data = await (await GET(new NextRequest(base), ctx)).json();
    const row = (name: string) => data.rows.find((r: { collection: string }) => r.collection === name);
    expect(row("staff")).toMatchObject({ client: 2, sample: 1, unmarked: 0 });
    expect(row("vendors")).toMatchObject({ client: 1, sample: 1, unmarked: 1 });
    expect(row("jobs")).toMatchObject({ client: 1, sample: 1, unmarked: 0 });
    expect(row("customers")).toMatchObject({ client: 0, sample: 0, unmarked: 1 });
    expect(data.staffCrewSamples).toBe(2);
  });

  it("is superadmin only and 404s an unknown business", async () => {
    allowed = false;
    expect((await GET(new NextRequest(base), ctx)).status).toBe(403);
    allowed = true;
    expect((await GET(new NextRequest(base), { params: Promise.resolve({ businessId: "nope" }) })).status).toBe(404);
  });
});

describe("DELETE sample-data", () => {
  it("is superadmin only", async () => {
    allowed = false;
    expect((await del("?apply=1&confirm=biz")).status).toBe(403);
    expect(db.__list("businesses/biz/vendors")).toHaveLength(3);
  });

  it("dry run lists what would go and writes nothing", async () => {
    const data = await (await del()).json();
    expect(data.dryRun).toBe(true);
    const plan = (name: string) => data.plan.collections.find((c: { collection: string }) => c.collection === name);
    expect(plan("vendors").ids).toEqual(["v2"]);
    expect(plan("jobs").ids).toEqual(["j-sample"]);
    expect(plan("staff").ids).toEqual(["s-sample"]);
    expect(data.plan.staffCrewClears.ids).toEqual(["s-client"]);
    expect(db.__list("businesses/biz/vendors")).toHaveLength(3);
    expect(db.__list("businesses/biz/jobs")).toHaveLength(2);
    expect(db.__list("adminAuditEvents")).toHaveLength(0);
    // apply=1 without the matching confirm is still not an apply
    expect((await del("?apply=1")).status).toBe(400);
    expect((await del("?apply=1&confirm=other")).status).toBe(400);
    expect(db.__list("businesses/biz/vendors")).toHaveLength(3);
  });

  it("apply removes only luxor-sample records, clears guessed crews, and writes one audit row", async () => {
    const data = await (await del("?apply=1&confirm=biz")).json();
    expect(data).toMatchObject({ dryRun: false, removed: { staff: 1, vendors: 1, jobs: 1 }, staffCrewCleared: 1 });
    expect(db.__list("businesses/biz/vendors").map((v) => v.id).sort()).toEqual(["v1", "v3"]);
    expect(db.__list("businesses/biz/jobs").map((j) => j.id)).toEqual(["j-client"]);
    expect(db.__list("businesses/biz/jobs/j-sample/updates")).toHaveLength(0);
    expect(db.__list("businesses/biz/customers")).toHaveLength(1);
    expect(db.__peek("businesses/biz/staff", "s-sample")).toBeUndefined();
    const real = db.__peek("businesses/biz/staff", "s-client");
    expect(real).toMatchObject({ name: "Real", provenance: { origin: "client" } });
    expect(real?.crewId).toBeUndefined();
    expect(real?.crewProvenance).toBeUndefined();
    expect(db.__peek("businesses/biz/staff", "s-confirmed")).toMatchObject({ crewId: "c1", crewProvenance: { origin: "client" } });
    const audit = db.__list("adminAuditEvents");
    expect(audit).toHaveLength(1);
    expect(audit[0].data).toMatchObject({ action: "sample_data.removed", businessId: "biz", actorUid: "root" });
  });

  it("a second apply finds nothing left to remove", async () => {
    await del("?apply=1&confirm=biz");
    const again = await (await del("?apply=1&confirm=biz")).json();
    expect(again).toMatchObject({ removed: {}, staffCrewCleared: 0 });
  });
});
