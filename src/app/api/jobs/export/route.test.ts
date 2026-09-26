import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.gate }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
import { GET } from "./route";

beforeEach(() => {
  db = makeFakeDb();
  mocks.gate.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  db.__seed("businesses/biz/jobs", "J-1", { createdAt: 1000, title: '=HYPERLINK("bad")', clientName: "A, B", status: "invoiced", invoiceId: "INV-1" });
  db.__seed("businesses/biz/invoices", "INV-1", { status: "sent", total: 125.5 });
});

describe("GET /api/jobs/export", () => {
  it("exports all columns and escapes spreadsheet formulas", async () => {
    const res = await GET(new NextRequest("http://localhost/api/jobs/export?businessId=biz"));
    const csv = await res.text();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(csv).toContain('"invoice status","total"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('"sent","125.5"');
  });

  it("refuses a viewer", async () => {
    mocks.gate.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await GET(new NextRequest("http://localhost/api/jobs/export?businessId=biz"));
    expect(res.status).toBe(403);
  });
});
