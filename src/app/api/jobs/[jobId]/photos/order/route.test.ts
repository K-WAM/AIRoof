import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ role: "staff" as "staff" | "viewer" | "qr" }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => {
    if (mocks.role !== "staff") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    return { user: { uid: "staff", role: "staff" } };
  },
}));

let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { PATCH } from "@/app/api/jobs/[jobId]/photos/order/route";

const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
const patch = (jobId: string, body: unknown) => new NextRequest(`http://localhost/api/jobs/${jobId}/photos/order`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  db = makeFakeDb();
  mocks.role = "staff";
  db.__seed("businesses/biz/jobs/J-1000/photos", "before-1", { label: "Before", phase: "before", createdAt: 1 });
  db.__seed("businesses/biz/jobs/J-1000/photos", "after-1", { label: "After", phase: "after", createdAt: 2 });
  db.__seed("businesses/biz/jobs/J-2000/photos", "other-job", { label: "Other", phase: "before", createdAt: 3 });
});

describe("PATCH /api/jobs/[jobId]/photos/order", () => {
  // Negative cases first: never permit cross-job IDs or a QR/viewer session to reorder photos.
  it("rejects another job's photo id", async () => {
    const res = await PATCH(patch("J-1000", { businessId: "biz", order: ["before-1", "other-job"] }), ctx("J-1000"));
    expect(res.status).toBe(400);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "before-1") as { sort?: number }).sort).toBeUndefined();
  });

  it("rejects duplicate ids and lists over 24 ids", async () => {
    expect((await PATCH(patch("J-1000", { businessId: "biz", order: ["before-1", "before-1"] }), ctx("J-1000"))).status).toBe(400);
    expect((await PATCH(patch("J-1000", { businessId: "biz", order: Array.from({ length: 25 }, (_, index) => `p-${index}`) }), ctx("J-1000"))).status).toBe(400);
  });

  it("rejects viewer and QR sessions", async () => {
    mocks.role = "viewer";
    expect((await PATCH(patch("J-1000", { businessId: "biz", order: ["before-1"] }), ctx("J-1000"))).status).toBe(403);
    mocks.role = "qr";
    expect((await PATCH(patch("J-1000", { businessId: "biz", order: ["before-1"] }), ctx("J-1000"))).status).toBe(403);
  });

  it("writes sparse sort values in the requested order", async () => {
    const res = await PATCH(patch("J-1000", { businessId: "biz", order: ["after-1", "before-1"] }), ctx("J-1000"));
    expect(res.status).toBe(200);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "after-1") as { sort: number }).sort).toBe(0);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "before-1") as { sort: number }).sort).toBe(1000);
  });
});
