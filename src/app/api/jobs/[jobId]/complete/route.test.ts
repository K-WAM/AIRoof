import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ grantJob: "J-1000" as string | null }));
vi.mock("@/lib/auth/verifyRole", () => ({
  // Same contract as the real verifyFieldAccess: a field grant is pinned to one business and one job (URL path).
  verifyFieldAccess: async (request: NextRequest, businessId: string) => {
    if (businessId !== "biz") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    const jobInPath = request.nextUrl.pathname.split("/")[3];
    if (mocks.grantJob && jobInPath !== mocks.grantJob) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    if (!request.headers.get("x-test-auth")) return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
    return { user: { uid: "field-token", role: "viewer" } };
  },
}));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { POST } from "@/app/api/jobs/[jobId]/complete/route";

const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
const call = (jobId: string, body: unknown = { businessId: "biz" }, auth = true) =>
  POST(new NextRequest(`http://localhost/api/jobs/${jobId}/complete`, {
    method: "POST", headers: { "content-type": "application/json", ...(auth ? { "x-test-auth": "1" } : {}) }, body: JSON.stringify(body),
  }), ctx(jobId));
const job = (id: string) => db.__peek("businesses/biz/jobs", id)! as { status: string; completedAt?: number; statusHistory?: Array<{ status: string; by?: string }> };

beforeEach(() => {
  db = makeFakeDb();
  mocks.grantJob = "J-1000";
  db.__seed("businesses", "biz", { industry: "roofing" });
  db.__seed("businesses/biz/jobs", "J-1000", { jobId: "J-1000", status: "in_progress" });
  db.__seed("businesses/biz/jobs", "J-2000", { jobId: "J-2000", status: "in_progress" });
});

describe("POST /api/jobs/[jobId]/complete", () => {
  it("marks the job complete, stamps completedAt, and appends to the status history with the worker's name", async () => {
    const res = await call("J-1000", { businessId: "biz", completedBy: "Marco" });
    expect(await res.json()).toMatchObject({ ok: true, status: "complete", changed: true });
    expect(job("J-1000").status).toBe("complete");
    expect(job("J-1000").completedAt).toBeGreaterThan(0);
    expect(job("J-1000").statusHistory).toMatchObject([{ status: "complete", by: "Marco" }]);
  });

  it("is idempotent: a second tap (or two at once) records ONE completion", async () => {
    const [a, b] = await Promise.all([call("J-1000"), call("J-1000")]);
    const results = [await a.json(), await b.json()];
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(job("J-1000").statusHistory).toHaveLength(1);
    expect((await (await call("J-1000")).json()).changed).toBe(false);
  });

  it("never moves an invoiced job backwards", async () => {
    db.__seed("businesses/biz/jobs", "J-1000", { jobId: "J-1000", status: "invoiced" });
    expect(await (await call("J-1000")).json()).toMatchObject({ status: "invoiced", changed: false });
    expect(job("J-1000").status).toBe("invoiced");
  });

  it("a grant for one job cannot complete another; wrong business / no auth are refused", async () => {
    expect((await call("J-2000")).status).toBe(403);
    expect(job("J-2000").status).toBe("in_progress");
    expect((await call("J-1000", { businessId: "other" })).status).toBe(403);
    expect((await call("J-1000", { businessId: "biz" }, false)).status).toBe(401);
    expect(job("J-1000").status).toBe("in_progress");
  });

  it("404s an unknown job, 400s a missing businessId, refuses businesses without the Jobs module", async () => {
    mocks.grantJob = null;
    expect((await call("J-9999")).status).toBe(404);
    expect((await call("J-1000", {})).status).toBe(400);
    db.__seed("businesses", "biz", { industry: "dental" });
    expect((await call("J-1000")).status).toBe(403);
  });
});
