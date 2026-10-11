import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { GET, PUT } from "./route";

const put = (body: unknown) => new NextRequest("http://localhost/api/admin/billing-settings", { method: "PUT",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb();
  mocks.firestore.mockReturnValue(db);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "admin" } });
});

describe("billing settings (Zelle address form)", () => {
  it("refuses anyone but the superadmin before touching Firestore", async () => {
    mocks.verify.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await PUT(put({ zelleTo: "pay@luxordev.com" }))).status).toBe(403);
    expect(db.__peek("platform", "billing")).toBeUndefined();
  });
  it("saves a valid address, reads it back, and rejects junk", async () => {
    expect((await PUT(put({ zelleTo: " pay@luxordev.com " }))).status).toBe(200);
    expect(db.__peek("platform", "billing")).toMatchObject({ zelleTo: "pay@luxordev.com" });
    const got = await (await GET(new NextRequest("http://localhost/api/admin/billing-settings"))).json();
    expect(got).toEqual({ zelleTo: "pay@luxordev.com", fromEnv: false });
    expect((await PUT(put({ zelleTo: "<script>" }))).status).toBe(400);
  });
});
