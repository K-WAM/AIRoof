import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyFieldAccess: async () => ({ user: { uid: "field:grant-1", role: "viewer" } }),
}));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { POST } from "./route";

const punch = (type: string, jobId?: string) =>
  POST(new NextRequest("http://localhost/api/timeclock/punch", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessId: "biz", type, jobId, workerName: "Kevin" }),
  }));
const labor = () => (db.__peek("businesses/biz/jobs", "J-1016") as { parsed?: { labor: Array<{ description: string; hours?: number }> } }).parsed?.labor ?? [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T13:00:00Z"));
  db = makeFakeDb();
  db.__seed("businesses", "biz", { timezone: "America/New_York", industry: "roofing" });
  db.__seed("businesses/biz/jobs", "J-1016", { jobId: "J-1016", status: "open" });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/timeclock/punch — labor reaches the job at once", () => {
  it("re-projects the job so punched hours show on the Labor tab without waiting for a field update", async () => {
    expect((await punch("site_in", "J-1016")).status).toBe(200);
    vi.setSystemTime(new Date("2026-09-25T15:30:00Z"));
    expect((await punch("site_out", "J-1016")).status).toBe(200);
    expect(labor()).toEqual([expect.objectContaining({ description: "Kevin", hours: 2.5 })]);
    // Arriving on site is the first sign of work, so a fresh job moves to Working.
    expect((db.__peek("businesses/biz/jobs", "J-1016") as { status: string }).status).toBe("in_progress");
  });
});
