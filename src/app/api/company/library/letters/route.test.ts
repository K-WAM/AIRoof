import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { DEFAULT_LETTERS } from "@/lib/documents/letters";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: mocks.guard }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.db }));
import { GET, PUT } from "./route";
const req = (body?: unknown) => new NextRequest("http://localhost/api/company/library/letters?businessId=foreign", body ? { method: "PUT", body: JSON.stringify(body) } : undefined);
beforeEach(() => { mocks.guard.mockReset().mockResolvedValue({ user: { uid: "u", businessId: "mine" } }); mocks.db.mockReturnValue(makeFakeDb()); });
it("returns guard failures without accessing templates", async () => {
  mocks.guard.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
  expect((await GET(req())).status).toBe(403);
  expect((await PUT(req(DEFAULT_LETTERS.proposal))).status).toBe(403);
});
it("reads defaults and writes only the session tenant, with private cache policies", async () => {
  const read = await GET(req());
  expect(read.headers.get("cache-control")).toContain("private");
  expect((await read.json()).templates).toHaveLength(6);
  const write = await PUT(req({ ...DEFAULT_LETTERS.proposal, businessId: "foreign" }));
  expect(write.status).toBe(200);
  expect(write.headers.get("cache-control")).toBe("no-store");
  const db = mocks.db();
  expect(db.__peek("businesses/mine/documentTemplates", "proposal")).toMatchObject({ updatedBy: "u" });
  expect(db.__peek("businesses/foreign/documentTemplates", "proposal")).toBeUndefined();
});
it("rejects oversized and unknown templates", async () => {
  expect((await PUT(req({ ...DEFAULT_LETTERS.proposal, title: "x".repeat(121) }))).status).toBe(400);
  expect((await GET(new NextRequest("http://localhost/api/company/library/letters?kind=unknown"))).status).toBe(400);
});
