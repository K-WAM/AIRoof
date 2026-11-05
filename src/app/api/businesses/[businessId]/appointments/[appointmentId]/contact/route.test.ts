import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ db: null as FakeDb | null, role: "owner", businessId: "tenant-a" }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => mocks.role === "crew" ? { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } : { user: { uid: "editor", role: mocks.role, businessId: mocks.businessId } } }));
import { PATCH } from "./route";
const path = "businesses/tenant-a/appointments";
const params = Promise.resolve({ businessId: "tenant-a", appointmentId: "item" });
const values = { name: "Correct Name", phone: "5551234567", email: "fixed@example.test", address: "1 Main St", accessNotes: "Gate" };
function req(body: unknown) { return new NextRequest("http://localhost/contact", { method: "PATCH", body: JSON.stringify(body) }); }
beforeEach(() => { mocks.role = "owner"; mocks.businessId = "tenant-a"; mocks.db = makeFakeDb(); mocks.db.__seed(path, "item", { callerName: "Original", callerPhone: "5551112222", callerEmail: "old@example.test", address: "Old St", status: "requested", startTime: 123 }); });
describe("contact correction", () => {
  it("denies another tenant and crew", async () => {
    mocks.businessId = "tenant-b"; expect((await PATCH(req(values), { params })).status).toBe(403);
    mocks.businessId = "tenant-a"; mocks.role = "crew"; expect((await PATCH(req(values), { params })).status).toBe(403);
  });
  it("rejects a bad email", async () => { expect((await PATCH(req({ ...values, email: "bad" }), { params })).status).toBe(400); });
  it("keeps original values on the second edit and does not change scheduling", async () => {
    expect((await PATCH(req(values), { params })).status).toBe(200);
    expect((await PATCH(req({ ...values, name: "Again" }), { params })).status).toBe(200);
    expect(mocks.db!.__peek(path, "item")).toMatchObject({ callerName: "Again", status: "requested", startTime: 123, asHeard: { name: "Original", phone: "5551112222", email: "old@example.test", address: "Old St" } });
  });
});
