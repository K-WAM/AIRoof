import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
let user: { uid: string; role: string; crewId?: string } = { uid: "owner-1", role: "owner" };
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => (allowed ? { user } : { error: new Response(null, { status: 403 }) }),
}));
vi.mock("@/lib/auth/memberCache", () => ({ invalidateCachedMember: () => {} }));
import { DELETE, GET, PATCH, POST } from "../route";

const url = "http://localhost/api/company/crews";
const patch = (body: unknown) => new NextRequest(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (body: unknown) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  db = makeFakeDb();
  allowed = true;
  user = { uid: "owner-1", role: "owner" };
  db.__seed("businesses/biz/crews", "c1", { crewId: "c1", name: "Tyler Crew", email: "tyler@crew.test", color: "#16a34a", active: true, createdAt: 1 });
  db.__seed("businesses/biz/crews", "c2", { crewId: "c2", name: "Repair Crew", color: "#db2777", active: true, createdAt: 2 });
  db.__seed("businessUsers", "u1", { businessId: "biz", email: "carlos@biz.test", displayName: "Carlos", role: "crew", trade: "installer", crewId: "c1", active: true });
  db.__seed("businessUsers", "u2", { businessId: "biz", email: "sam@biz.test", role: "staff", active: true });
  db.__seed("businessUsers", "u3", { businessId: "biz", email: "vera@biz.test", role: "viewer", active: true });
  db.__seed("businessUsers", "u4", { businessId: "other", email: "x@other.test", role: "staff", crewId: "c1", active: true });
});

describe("GET /api/company/crews?people=1", () => {
  it("lists who can be on a crew — never viewers, other businesses or emails", async () => {
    const data = await (await GET(new NextRequest(`${url}?businessId=biz&people=1`))).json();
    expect(data.crews.map((crew: { crewId: string }) => crew.crewId)).toEqual(["c1", "c2"]);
    expect(data.people).toEqual([
      { uid: "u1", name: "Carlos", role: "crew", trade: "installer", crewId: "c1" },
      { uid: "u2", name: "sam", role: "staff" },
    ]);
    expect(JSON.stringify(data.people)).not.toContain("@");
  });

  it("skips the people read unless asked", async () => {
    const data = await (await GET(new NextRequest(`${url}?businessId=biz`))).json();
    expect(data.people).toBeUndefined();
  });
});

describe("PATCH /api/company/crews", () => {
  it("edits name, contact and Active, and can clear an email", async () => {
    const response = await PATCH(patch({ businessId: "biz", crewId: "c1", name: "  Tyler's Crew ", email: "", phone: "+1 305 555 0100", active: false }));
    expect(response.status).toBe(200);
    const stored = db.__peek("businesses/biz/crews", "c1");
    expect(stored).toMatchObject({ name: "Tyler's Crew", phone: "+1 305 555 0100", active: false });
    expect(stored?.email).toBeUndefined();
  });

  it("only writes the editable fields (the body used to be written verbatim)", async () => {
    const response = await PATCH(patch({ businessId: "biz", crewId: "c1", color: "#2563eb", createdAt: 0, businessId2: "x", crewIdInjected: "y" }));
    expect(response.status).toBe(200);
    const stored = db.__peek("businesses/biz/crews", "c1");
    expect(stored).toMatchObject({ color: "#2563eb", createdAt: 1 });
    expect(stored).not.toHaveProperty("businessId2");
    expect(stored).not.toHaveProperty("crewIdInjected");
  });

  it("creates an inspector row and lets the office change its type", async () => {
    const created = await POST(post({ businessId: "biz", name: "Dominic", kind: "inspector" }));
    expect(created.status).toBe(201);
    const { crew } = await created.json();
    expect(crew).toMatchObject({ name: "Dominic", kind: "inspector", active: true });

    const changed = await PATCH(patch({ businessId: "biz", crewId: crew.crewId, kind: "crew" }));
    expect(changed.status).toBe(200);
    expect(db.__peek("businesses/biz/crews", crew.crewId)).toMatchObject({ kind: "crew" });
    expect((await PATCH(patch({ businessId: "biz", crewId: crew.crewId, kind: "vendor" }))).status).toBe(400);
  });

  it("rejects bad values and unknown crews", async () => {
    expect((await PATCH(patch({ businessId: "biz", crewId: "c1", name: "  " }))).status).toBe(400);
    expect((await PATCH(patch({ businessId: "biz", crewId: "c1", color: "red" }))).status).toBe(400);
    expect((await PATCH(patch({ businessId: "biz", crewId: "c1", active: "no" }))).status).toBe(400);
    expect((await PATCH(patch({ businessId: "biz", crewId: "c1" }))).status).toBe(400);
    expect((await PATCH(patch({ businessId: "biz", crewId: "missing", name: "X" }))).status).toBe(404);
    allowed = false;
    expect((await PATCH(patch({ businessId: "biz", crewId: "c1", name: "X" }))).status).toBe(403);
  });
});

describe("DELETE /api/company/crews", () => {
  it("sends unfinished jobs back to Unscheduled, frees bookings and members, keeps finished history", async () => {
    db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", status: "open", assignedCrewId: "c1", scheduledStart: 100, scheduledEnd: 200, crewConfirmed: true });
    db.__seed("businesses/biz/jobs", "J-2", { jobId: "J-2", status: "complete", assignedCrewId: "c1", scheduledStart: 50, scheduledEnd: 60 });
    db.__seed("businesses/biz/jobs", "J-3", { jobId: "J-3", status: "open", assignedCrewId: "c2", scheduledStart: 100, scheduledEnd: 200 });
    db.__seed("businesses/biz/appointments", "a1", { status: "requested", assignedCrewId: "c1", startTime: 1, endTime: 2 });

    const response = await DELETE(new NextRequest(`${url}?businessId=biz&crewId=c1`, { method: "DELETE" }));
    expect(await response.json()).toEqual({ ok: true, unscheduledJobs: 1, unassignedBookings: 1, membersCleared: 1 });

    expect(db.__peek("businesses/biz/crews", "c1")).toBeUndefined();
    expect(db.__peek("businesses/biz/jobs", "J-1")).toMatchObject({ assignedCrewId: null, scheduledStart: null, scheduledEnd: null, crewConfirmed: false });
    expect(db.__peek("businesses/biz/jobs", "J-2")).toMatchObject({ assignedCrewId: "c1" });
    expect(db.__peek("businesses/biz/jobs", "J-3")).toMatchObject({ assignedCrewId: "c2", scheduledStart: 100 });
    expect(db.__peek("businesses/biz/appointments", "a1")?.assignedCrewId).toBeUndefined();
    expect(db.__peek("businessUsers", "u1")?.crewId).toBeUndefined();
    expect(db.__peek("businessUsers", "u4")?.crewId).toBe("c1"); // another business's member is untouched
  });

  it("404s for an unknown crew and respects the role gate", async () => {
    expect((await DELETE(new NextRequest(`${url}?businessId=biz&crewId=missing`, { method: "DELETE" }))).status).toBe(404);
    allowed = false;
    expect((await DELETE(new NextRequest(`${url}?businessId=biz&crewId=c1`, { method: "DELETE" }))).status).toBe(403);
    expect(db.__peek("businesses/biz/crews", "c1")).toBeDefined();
  });
});

describe("GET /api/company/crews as a field-only login (T-155)", () => {
  it("returns only its own row — never the roster or the people list", async () => {
    user = { uid: "u1", role: "crew", crewId: "c1" };
    const data = await (await GET(new NextRequest(`${url}?businessId=biz&people=1`))).json();
    expect(data.crews.map((crew: { crewId: string }) => crew.crewId)).toEqual(["c1"]);
    expect(data.people).toBeUndefined();
    user = { uid: "u9", role: "crew" };
    expect((await (await GET(new NextRequest(`${url}?businessId=biz`))).json()).crews).toEqual([]);
  });
});
