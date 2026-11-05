import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
const m = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner" }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => m.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: async () => m.role === "owner" ? { user: { businessId: "a", role: "owner" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }, verifyAuthAndRole: async () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }) }));
import { GET } from "./route";
const req = (query = "?periodStart=2026-11-01&periodEnd=2026-11-07") => new NextRequest(`http://localhost/api/company/payroll${query}`);
beforeEach(() => { m.db = makeFakeDb(); m.role = "owner"; });
describe("payroll gate", () => {
  it("denies staff and businesses without showcase", async () => { m.role = "staff"; expect((await GET(req())).status).toBe(403); m.role = "owner"; m.db!.__seed("businesses", "a", {}); expect((await GET(req())).status).toBe(404); });
  it("rejects periods longer than 31 days or invalid dates", async () => { expect((await GET(req("?periodStart=2026-11-01&periodEnd=2026-12-02"))).status).toBe(400); expect((await GET(req("?periodStart=2026-02-30&periodEnd=2026-03-01"))).status).toBe(400); });
  it("returns private data for the owner", async () => { m.db!.__seed("businesses", "a", { showcase: { payroll: true } }); const res = await GET(req()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("private"); });
});
