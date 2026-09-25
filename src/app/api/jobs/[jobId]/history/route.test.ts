import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => (mocks.allowed ? { user: { uid: "staff", role: "staff" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }),
}));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { GET } from "@/app/api/jobs/[jobId]/history/route";

const call = (jobId = "J-1", q = "businessId=biz") => GET(new NextRequest(`http://localhost/api/jobs/${jobId}/history?${q}`), { params: Promise.resolve({ jobId }) });

beforeEach(() => {
  db = makeFakeDb();
  mocks.allowed = true;
  db.__seed("businesses/biz/calls", "c1", { startedAt: 1000, callerName: "Maria", summary: "Cracked tiles." });
  db.__seed("businesses/biz/appointments", "a1", { createdAt: 2000, callerName: "Maria", serviceType: "Roof inspection" });
  db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", status: "in_progress", createdAt: 3000, updatedAt: 9000, sourceCallId: "c1", appointmentId: "a1", quoteId: "Q-1" });
  db.__seed("businesses/biz/jobs/J-1/updates", "u1", { updateId: "u1", rawText: "used 12 bundles", submittedBy: "Marco", createdAt: 5000 });
  db.__seed("businesses/biz/jobs/J-1/photos", "p1", { label: "South slope", uploadedBy: "Marco", createdAt: 6000, thumbB64: "AAAA".repeat(1000) });
  db.__seed("businesses/biz/punches", "pn1", { type: "site_in", workerName: "Marco", at: 4000, jobId: "J-1" });
  db.__seed("businesses/biz/punches", "pn2", { type: "site_in", workerName: "Ana", at: 4100, jobId: "J-OTHER" });
  db.__seed("businesses/biz/quotes", "Q-1", { quoteId: "Q-1", createdAt: 7000, sentAt: 8000, sentTo: "m@example.com", status: "sent", updatedAt: 8000 });
});

describe("GET /api/jobs/[jobId]/history", () => {
  it("assembles the trail from the job's own records, in order", async () => {
    const { events } = await (await call()).json();
    expect(events.map((e: { title: string }) => e.title)).toEqual([
      "Call received", "Appointment requested", "Job created", "Arrived at the job", "Field update", "Photo added", "Quote Q-1 drafted", "Quote sent",
    ]);
  });

  it("never leaks image data or another job's punches", async () => {
    const body = JSON.stringify(await (await call()).json());
    expect(body).not.toContain("AAAAAAAA");
    expect(body).not.toContain("Ana");
  });

  it("404s an unknown job, 400s a missing businessId, and refuses an unauthorised caller", async () => {
    expect((await call("J-9")).status).toBe(404);
    expect((await call("J-1", "")).status).toBe(400);
    mocks.allowed = false;
    expect((await call()).status).toBe(403);
  });
});
