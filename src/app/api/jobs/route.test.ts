import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ field: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyFieldAccess: mocks.field }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
import { GET } from "./route";

beforeEach(() => {
  db = makeFakeDb();
  mocks.field.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  for (let i = 1; i <= 205; i++) {
    db.__seed("businesses/biz/jobs", `J-${i}`, { createdAt: i, status: i % 2 ? "complete" : "quoted", title: `Job ${i}` });
  }
});

async function list(query = "") {
  const res = await GET(new NextRequest(`http://localhost/api/jobs?businessId=biz${query}`));
  return { status: res.status, body: await res.json() as { jobs: Array<{ jobId: string; createdAt: number }>; hasMore: boolean; nextBefore: number | null } };
}

describe("GET /api/jobs paging", () => {
  for (const role of ["crew", "owner", "staff", "viewer", "superadmin", "grant"] as const) {
    it(`redacts both full and delta lists only for ${role === "grant" || role === "crew" ? "field" : "office"} reader ${role}`, async () => {
      db.__seed("businesses/biz/jobs", "priced", { createdAt: 500, updatedAt: 500, parsed: { labor: [{ hours: 3, rate: 65 }] } });
      mocks.field.mockResolvedValue({ user: { uid: role === "grant" ? "field:biz:session" : "login", role: role === "grant" ? "viewer" : role } });
      for (const suffix of ["", "&updatedSince=500"]) {
        const data = await (await GET(new NextRequest(`http://localhost/api/jobs?businessId=biz${suffix}`))).json();
        const priced = data.jobs.find((job: { jobId: string }) => job.jobId === "priced");
        expect(priced.parsed.labor[0]).toEqual(role === "grant" || role === "crew" ? { hours: 3 } : { hours: 3, rate: 65 });
      }
    });
  }
  it("refuses delta reads when the existing field guard denies access", async () => {
    mocks.field.mockResolvedValue({ error: Response.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await list("&updatedSince=1")).status).toBe(403);
  });

  it("rejects malformed delta cursors", async () => {
    for (const cursor of ["", "-1", "NaN", "Infinity"]) expect((await list(`&updatedSince=${cursor}`)).status).toBe(400);
  });

  it("returns only changed jobs, including completed jobs for removal from the board", async () => {
    db.__seed("businesses/biz/jobs", "old", { updatedAt: 99 });
    db.__seed("businesses/biz/jobs", "changed", { updatedAt: 100, status: "complete" });
    const res = await GET(new NextRequest("http://localhost/api/jobs?businessId=biz&updatedSince=100"));
    const data = await res.json();
    expect(data.jobs).toEqual([{ jobId: "changed", updatedAt: 100, status: "complete" }]);
    expect(data.polledAt).toBeGreaterThanOrEqual(100);
  });
  it("pages newest first through all jobs", async () => {
    const first = await list();
    expect(first.body.jobs).toHaveLength(100);
    expect(first.body.jobs[0].jobId).toBe("J-205");
    expect(first.body.hasMore).toBe(true);
    const second = await list(`&before=${first.body.nextBefore}`);
    const third = await list(`&before=${second.body.nextBefore}`);
    expect([...first.body.jobs, ...second.body.jobs, ...third.body.jobs]).toHaveLength(205);
    expect(third.body.hasMore).toBe(false);
  });

  it("applies status on the server before paging", async () => {
    const first = await list("&status=complete");
    expect(first.body.jobs).toHaveLength(100);
    expect(first.body.hasMore).toBe(true);
    const second = await list(`&status=complete&before=${first.body.nextBefore}`);
    expect(second.body.jobs).toHaveLength(3);
  });

  it("reads exactly the job ids a caller asks for (Pipeline company badges)", async () => {
    db.__seed("businesses/biz/jobs", "J-1", { createdAt: 1, status: "quoted", title: "Job 1", companyId: "rcu" });
    const res = await GET(new NextRequest("http://localhost/api/jobs?businessId=biz&ids=J-1,missing,J-205"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jobs.map((job: { jobId: string }) => job.jobId).sort()).toEqual(["J-1", "J-205"]);
    expect(body.jobs.find((job: { jobId: string }) => job.jobId === "J-1").companyId).toBe("rcu");
  });

  it("rejects an empty or oversized ids list", async () => {
    expect((await list("&ids=")).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, i) => `J-${i + 1}`).join(",");
    expect((await list(`&ids=${tooMany}`)).status).toBe(400);
  });
});
