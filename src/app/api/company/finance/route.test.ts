import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
const m = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner" }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => m.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyOwnBusinessRole: async () => m.role === "owner" ? { user: { businessId: "a", role: "owner" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }, verifyAuthAndRole: async () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }) }));
import { GET } from "./route";
const req = (query = "") => new NextRequest(`http://localhost/api/company/finance${query}`);
beforeEach(() => { m.db = makeFakeDb(); m.role = "owner"; });
describe("finance gate", () => {
  it("denies non-owners and businesses without the showcase", async () => { m.role = "staff"; expect((await GET(req())).status).toBe(403); m.role = "owner"; m.db!.__seed("businesses", "a", {}); expect((await GET(req())).status).toBe(404); });
  it("rejects invalid filters", async () => { expect((await GET(req("?from=bad"))).status).toBe(400); });
  it("returns private cached data to the owner", async () => { m.db!.__seed("businesses", "a", { showcase: { finances: true } }); const res = await GET(req()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("private"); });
});
