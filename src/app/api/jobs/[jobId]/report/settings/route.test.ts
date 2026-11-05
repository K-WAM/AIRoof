import { NextRequest, NextResponse } from "next/server";
import { it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.db }));
import { PUT } from "./route";
const ctx = { params: Promise.resolve({ jobId: "j" }) };
const req = (body: unknown) => new NextRequest("http://localhost/api/jobs/j/report/settings", { method: "PUT", body: JSON.stringify(body) });
beforeEach(() => { const db = makeFakeDb(); db.__seed("businesses/b/jobs", "j", {}); mocks.db.mockReturnValue(db); mocks.guard.mockResolvedValue({ user: { businessId: "b", uid: "u" } }); });
it("returns authorization and validation failures", async () => {
  mocks.guard.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
  expect((await PUT(req({ layout: "repair_completion" }), ctx)).status).toBe(403);
  expect((await PUT(req({ layout: "bad" }), ctx)).status).toBe(400);
  expect((await PUT(req({ noCharge: "yes" }), ctx)).status).toBe(400);
  expect((await PUT(req({ locations: "x".repeat(4001) }), ctx)).status).toBe(400);
  expect((await PUT(req({ renewalMonth: "x".repeat(41) }), ctx)).status).toBe(400);
  expect((await PUT(req({ renewalMonth: 2026 }), ctx)).status).toBe(400);
  expect((await PUT(req({ showFindingSections: "yes" }), ctx)).status).toBe(400);
});
it("stores a bounded renewal month", async () => {
  expect((await PUT(req({ renewalMonth: "September 2026" }), ctx)).status).toBe(200);
  expect(mocks.db().__peek("businesses/b/jobs", "j").reportDocument.renewalMonth).toBe("September 2026");
});
it("saves only report fields under the session tenant", async () => {
  expect((await PUT(req({ businessId: "foreign", layout: "repair_completion", locations: "North entry", noCharge: true }), ctx)).status).toBe(200);
  expect(mocks.db().__peek("businesses/b/jobs", "j")).toMatchObject({ reportDocument: { layout: "repair_completion", locations: "North entry", noCharge: true } });
});
