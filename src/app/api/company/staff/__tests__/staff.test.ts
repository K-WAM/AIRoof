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
import { PATCH } from "../[staffId]/route";

const url = "http://localhost/api/company/staff";
const json = (method: string, body: unknown) => new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const asRole = (role: string, superadmin = false) => (roles: string[]): Gate =>
  superadmin || roles.includes(role) ? { user: { uid: "u", role, superadmin } } : { error: new Response(null, { status: 403 }) };
const ctx = (staffId: string) => ({ params: Promise.resolve({ staffId }) });

beforeEach(() => {
  db = makeFakeDb();
  gate = asRole("owner");
  db.__seed("businesses/biz/crews", "c1", { crewId: "c1", name: "Tyler Crew", active: true, color: "#111111", createdAt: 1 });
  db.__seed("businesses/biz/staff", "s1", {
    staffId: "s1", name: "Zed", position: "Estimator", email: "zed@biz.test", mobile: "+19545550101", active: true, crewId: "c1",
    crewProvenance: { origin: "luxor-sample", source: "luxor:demo-fill", addedAt: 1 }, crewLead: true,
    provenance: { origin: "client", source: "jobba:Company contacts.csv", addedAt: 1 }, createdAt: 1, updatedAt: 1,
  });
  db.__seed("businesses/biz/staff", "s2", {
    staffId: "s2", name: "Amy", active: true, provenance: { origin: "client", source: "x", addedAt: 1 }, createdAt: 2, updatedAt: 2,
  });
  db.__seed("businesses/biz/staff", "s3", {
    staffId: "s3", name: "Abe", active: false, provenance: { origin: "client", source: "x", addedAt: 1 }, createdAt: 3, updatedAt: 3,
  });
});

describe("GET /api/company/staff", () => {
  it("lists active first, then by name, with everything for an owner", async () => {
    const res = await GET(new NextRequest(`${url}?businessId=biz`));
    expect(res.headers.get("cache-control")).toContain("private");
    const { staff } = await res.json();
    expect(staff.map((s: { name: string }) => s.name)).toEqual(["Amy", "Zed", "Abe"]);
    expect(staff[1]).toMatchObject({ email: "zed@biz.test", mobile: "+19545550101" });
  });

  it("hides email, mobile and provenance detail from staff and view-only roles", async () => {
    for (const role of ["staff", "viewer"]) {
      gate = asRole(role);
      const { staff } = await (await GET(new NextRequest(`${url}?businessId=biz`))).json();
      const zed = staff.find((s: { name: string }) => s.name === "Zed");
      expect(zed).toMatchObject({ name: "Zed", position: "Estimator", crewId: "c1", crewLead: true, provenance: { origin: "client" }, crewProvenance: { origin: "luxor-sample" } });
      expect(JSON.stringify(staff)).not.toContain("@");
      expect(JSON.stringify(staff)).not.toContain("+1954");
      expect(JSON.stringify(staff)).not.toContain("jobba");
    }
  });

  it("refuses a crew login and needs a businessId", async () => {
    gate = asRole("crew");
    expect((await GET(new NextRequest(`${url}?businessId=biz`))).status).toBe(403);
    expect((await GET(new NextRequest(url))).status).toBe(400);
  });

  it("gives the platform admin every field", async () => {
    gate = asRole("superadmin", true);
    const { staff } = await (await GET(new NextRequest(`${url}?businessId=biz`))).json();
    expect(staff[1].email).toBe("zed@biz.test");
  });
});

describe("POST /api/company/staff", () => {
  it("creates a person marked as client data, with the mobile in E.164", async () => {
    const res = await POST(json("POST", { businessId: "biz", name: " Dana ", position: "Foreman", mobile: "(954) 555-0142", crewId: "c1", userType: "foreman", language: "es" }));
    expect(res.status).toBe(201);
    const { staff } = await res.json();
    expect(staff).toMatchObject({ name: "Dana", mobile: "+19545550142", crewId: "c1", active: true, provenance: { origin: "client", source: "app:team" }, crewProvenance: { origin: "client" } });
    expect(db.__peek("businesses/biz/staff", staff.staffId)).toBeTruthy();
  });

  it("only an owner writes", async () => {
    for (const role of ["staff", "viewer"]) {
      gate = asRole(role);
      expect((await POST(json("POST", { businessId: "biz", name: "X" }))).status).toBe(403);
    }
    expect(db.__list("businesses/biz/staff")).toHaveLength(3);
  });

  it("refuses a View-as (read-only) session without writing", async () => {
    gate = () => ({ error: new Response(JSON.stringify({ error: "read-only" }), { status: 403 }) });
    expect((await POST(json("POST", { businessId: "biz", name: "X" }))).status).toBe(403);
    expect((await PATCH(json("PATCH", { businessId: "biz", position: "X" }), ctx("s1"))).status).toBe(403);
    expect(db.__list("businesses/biz/staff")).toHaveLength(3);
    expect(db.__peek("businesses/biz/staff", "s1")?.position).toBe("Estimator");
  });

  it("validates input", async () => {
    const bad = [
      { name: "" }, { name: "x".repeat(121) }, { name: "A", email: "nope" }, { name: "A", language: "fr" },
      { name: "A", userType: "god" }, { name: "A", crewId: "missing" }, { name: "A", mobile: "abc" },
    ];
    for (const body of bad) expect((await POST(json("POST", { businessId: "biz", ...body }))).status).toBe(400);
    expect((await POST(json("POST", { name: "A" }))).status).toBe(400);
  });
});

describe("PATCH /api/company/staff/[staffId]", () => {
  it("edits fields, clears with empty text, and never touches provenance or linkedUid", async () => {
    db.__seed("businesses/biz/staff", "s4", {
      staffId: "s4", name: "Linked", active: true, linkedUid: "uid-9", email: "l@biz.test",
      provenance: { origin: "luxor-sample", source: "luxor:demo-fill", addedAt: 5 }, createdAt: 4, updatedAt: 4,
    });
    const res = await PATCH(json("PATCH", { businessId: "biz", position: "Lead", email: "", mobile: "305 555 0100", provenance: { origin: "client" }, linkedUid: "evil", name: "Hacked" }), ctx("s4"));
    expect(res.status).toBe(200);
    const stored = db.__peek("businesses/biz/staff", "s4");
    expect(stored).toMatchObject({ position: "Lead", mobile: "+13055550100", linkedUid: "uid-9", name: "Linked", provenance: { origin: "luxor-sample" } });
    expect(stored?.email).toBeUndefined();
  });

  it("an owner's crew choice turns a guess into client data and drops the lead flag", async () => {
    await PATCH(json("PATCH", { businessId: "biz", crewId: "c1" }), ctx("s1"));
    const stored = db.__peek("businesses/biz/staff", "s1");
    expect(stored?.crewProvenance).toMatchObject({ origin: "client", source: "app:team" });
    expect(stored?.crewLead).toBeUndefined();
  });

  it("clears the crew with an empty id and refuses a crew that does not exist", async () => {
    expect((await PATCH(json("PATCH", { businessId: "biz", crewId: "nope" }), ctx("s1"))).status).toBe(400);
    expect(db.__peek("businesses/biz/staff", "s1")?.crewId).toBe("c1");
    await PATCH(json("PATCH", { businessId: "biz", crewId: "" }), ctx("s1"));
    const stored = db.__peek("businesses/biz/staff", "s1");
    expect(stored?.crewId).toBeUndefined();
    expect(stored?.crewProvenance).toBeUndefined();
  });

  it("deactivates, 404s on a missing person, and only an owner writes", async () => {
    await PATCH(json("PATCH", { businessId: "biz", active: false }), ctx("s2"));
    expect(db.__peek("businesses/biz/staff", "s2")?.active).toBe(false);
    expect((await PATCH(json("PATCH", { businessId: "biz", active: false }), ctx("nobody"))).status).toBe(404);
    expect((await PATCH(json("PATCH", { businessId: "biz" }), ctx("s2"))).status).toBe(400);
    gate = asRole("staff");
    expect((await PATCH(json("PATCH", { businessId: "biz", position: "x" }), ctx("s2"))).status).toBe(403);
  });
});
