import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ grantJob: "J-1000" as string | null, businessId: "biz" }));
vi.mock("@/lib/auth/verifyRole", () => ({
  // Mirrors the real verifyFieldAccess contract: a field grant is pinned to one business and one job (from the URL path).
  verifyFieldAccess: async (request: NextRequest, businessId: string) => {
    if (businessId !== mocks.businessId) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    const jobInPath = request.nextUrl.pathname.split("/")[3];
    if (mocks.grantJob && jobInPath !== mocks.grantJob) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    if (!request.headers.get("x-test-auth")) return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
    return { user: { uid: "field", role: "viewer" } };
  },
}));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { GET, POST } from "@/app/api/jobs/[jobId]/findings/route";

const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
const get = (jobId: string) => new NextRequest(`http://localhost/api/jobs/${jobId}/findings?businessId=biz`, { headers: { "x-test-auth": "1" } });
const post = (jobId: string, body: unknown, auth = true) => new NextRequest(`http://localhost/api/jobs/${jobId}/findings`, {
  method: "POST", headers: { "content-type": "application/json", ...(auth ? { "x-test-auth": "1" } : {}) }, body: JSON.stringify(body),
});

beforeEach(() => {
  db = makeFakeDb();
  mocks.grantJob = "J-1000";
  mocks.businessId = "biz";
  db.__seed("businesses", "biz", { industry: "roofing" });
  db.__seed("businesses/biz/jobs", "J-1000", { jobId: "J-1000", status: "open" });
  db.__seed("businesses/biz/jobs", "J-2000", { jobId: "J-2000", status: "open" });
  db.__seed("businesses/biz/library", "workCatalog", { items: [
    { itemId: "tile", category: "Tile", problem: "Cracked tile", solution: "Replace it.", severity: "medium", createdAt: 1,
      lines: [{ description: "Roof tile", quantity: 6, unit: "each", unitPrice: 9, kind: "material" }] },
  ] });
});

describe("/api/jobs/[jobId]/findings (field-safe)", () => {
  it("GET lists catalog names WITHOUT prices or lines", async () => {
    const body = await (await GET(get("J-1000"), ctx("J-1000"))).json();
    expect(body.items).toEqual([{ itemId: "tile", category: "Tile", problem: "Cracked tile", solution: "Replace it.", severity: "medium" }]);
    expect(JSON.stringify(body)).not.toContain("unitPrice");
  });

  it("POST adds a server-side snapshot of the catalog item (with its lines) to the job", async () => {
    const res = await POST(post("J-1000", { businessId: "biz", itemId: "tile" }), ctx("J-1000"));
    expect(res.status).toBe(201);
    const job = db.__peek("businesses/biz/jobs", "J-1000") as { findings: Array<{ itemId: string; lines: Array<{ unitPrice: number }>; includeInQuote: boolean; includeInReport: boolean }> };
    expect(job.findings).toHaveLength(1);
    expect(job.findings[0]).toMatchObject({ itemId: "tile", includeInQuote: true, includeInReport: true });
    expect(job.findings[0].lines[0].unitPrice).toBe(9);
  });

  it("is idempotent: adding the same item twice (or concurrently) leaves one finding", async () => {
    const [a, b] = await Promise.all([
      POST(post("J-1000", { businessId: "biz", itemId: "tile" }), ctx("J-1000")),
      POST(post("J-1000", { businessId: "biz", itemId: "tile" }), ctx("J-1000")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((db.__peek("businesses/biz/jobs", "J-1000") as { findings: unknown[] }).findings).toHaveLength(1);
  });

  it("404s an unknown catalog item and an unknown job", async () => {
    expect((await POST(post("J-1000", { businessId: "biz", itemId: "nope" }), ctx("J-1000"))).status).toBe(404);
    mocks.grantJob = null;
    expect((await POST(post("J-9999", { businessId: "biz", itemId: "tile" }), ctx("J-9999"))).status).toBe(404);
  });

  it("rejects a grant for a different job or business, and unauthenticated calls", async () => {
    expect((await POST(post("J-2000", { businessId: "biz", itemId: "tile" }), ctx("J-2000"))).status).toBe(403);
    expect((await GET(get("J-2000"), ctx("J-2000"))).status).toBe(403);
    expect((await POST(post("J-1000", { businessId: "other", itemId: "tile" }), ctx("J-1000"))).status).toBe(403);
    expect((await POST(post("J-1000", { businessId: "biz", itemId: "tile" }, false), ctx("J-1000"))).status).toBe(401);
    expect((db.__peek("businesses/biz/jobs", "J-2000") as { findings?: unknown[] }).findings).toBeUndefined();
  });

  it("stops at 60 findings with 409 and validates the body", async () => {
    const findings = Array.from({ length: 60 }, (_, i) => ({ findingId: `f${i}`, itemId: `i${i}`, category: "c", problem: "p", solution: "s", includeInReport: true, includeInQuote: true, addedAt: 1 }));
    db.__seed("businesses/biz/jobs", "J-1000", { jobId: "J-1000", findings });
    expect((await POST(post("J-1000", { businessId: "biz", itemId: "tile" }), ctx("J-1000"))).status).toBe(409);
    expect((await POST(post("J-1000", { businessId: "biz" }), ctx("J-1000"))).status).toBe(400);
  });

  it("is unavailable for a business without the Jobs module", async () => {
    db.__seed("businesses", "biz", { industry: "dental" });
    expect((await POST(post("J-1000", { businessId: "biz", itemId: "tile" }), ctx("J-1000"))).status).toBe(403);
  });
});
