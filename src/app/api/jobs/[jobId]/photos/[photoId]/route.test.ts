import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ businessId: "biz", allowedJob: "J-1000" as string | null }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyFieldAccess: async (request: NextRequest, businessId: string) => {
    const jobId = request.nextUrl.pathname.split("/")[3];
    if (businessId !== mocks.businessId || (mocks.allowedJob && jobId !== mocks.allowedJob)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user: { uid: "field", role: "viewer" } };
  },
  verifyAuthAndRole: async () => ({ user: { uid: "staff", role: "staff" } }),
}));

let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { PATCH } from "@/app/api/jobs/[jobId]/photos/[photoId]/route";

const ctx = (jobId: string, photoId: string) => ({ params: Promise.resolve({ jobId, photoId }) });
const patch = (jobId: string, photoId: string, body: unknown) => new NextRequest(
  `http://localhost/api/jobs/${jobId}/photos/${photoId}`,
  { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
);

beforeEach(() => {
  db = makeFakeDb();
  mocks.businessId = "biz";
  mocks.allowedJob = "J-1000";
  db.__seed("businesses/biz/jobs/J-1000/photos", "before-1", { label: "Damage", phase: "before", createdAt: 1 });
  db.__seed("businesses/biz/jobs/J-1000/photos", "after-1", { label: "Repair", phase: "after", createdAt: 2 });
  db.__seed("businesses/biz/jobs/J-2000/photos", "before-other-job", { label: "Other damage", phase: "before", createdAt: 3 });
});

describe("PATCH /api/jobs/[jobId]/photos/[photoId] pair validation", () => {
  // Negative cases first: a pair can only reference a Before photo in this exact job.
  it("rejects a photo id from another job", async () => {
    const res = await PATCH(patch("J-1000", "after-1", { businessId: "biz", pairId: "before-other-job" }), ctx("J-1000", "after-1"));
    expect(res.status).toBe(400);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "after-1") as { pairId?: string }).pairId).toBeUndefined();
  });

  it("rejects pairing an After photo to another After", async () => {
    db.__seed("businesses/biz/jobs/J-1000/photos", "after-2", { label: "Another repair", phase: "after", createdAt: 4 });
    const res = await PATCH(patch("J-1000", "after-1", { businessId: "biz", pairId: "after-2" }), ctx("J-1000", "after-1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-finite sort value", async () => {
    const res = await PATCH(patch("J-1000", "after-1", { businessId: "biz", sort: "1" }), ctx("J-1000", "after-1"));
    expect(res.status).toBe(400);
  });

  it("persists an After-to-Before pair and permits clearing it", async () => {
    expect((await PATCH(patch("J-1000", "after-1", { businessId: "biz", pairId: "before-1" }), ctx("J-1000", "after-1"))).status).toBe(200);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "after-1") as { pairId?: string }).pairId).toBe("before-1");
    expect((await PATCH(patch("J-1000", "after-1", { businessId: "biz", pairId: null }), ctx("J-1000", "after-1"))).status).toBe(200);
    expect((db.__peek("businesses/biz/jobs/J-1000/photos", "after-1") as { pairId?: string | null }).pairId).toBeNull();
  });
});
