import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ gate: vi.fn(), auth: vi.fn(), db: vi.fn(), getUserByEmail: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), createUser: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: m.gate }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: m.auth, getAdminFirestore: m.db }));
import { POST } from "./route";
const params = { params: Promise.resolve({ businessId: "biz" }) };
let member: Record<string, unknown> | undefined;
let businessExists: boolean;
function request(body: unknown = { ownerEmail: "client@example.test" }) {
  return new NextRequest("http://localhost/api/admin/businesses/biz/provision-login", { method: "POST", body: JSON.stringify(body) });
}
const unchanged = () => { expect(m.updateUser).not.toHaveBeenCalled(); expect(m.createUser).not.toHaveBeenCalled(); expect(m.set).not.toHaveBeenCalled(); };

describe("provision login never takes over an account", () => {
  beforeEach(() => {
    vi.resetAllMocks(); member = { businessId: "biz", role: "staff", active: false, createdAt: 123 }; businessExists = true;
    m.gate.mockResolvedValue({ user: { uid: "admin" } });
    m.getUserByEmail.mockResolvedValue({ uid: "existing", customClaims: {} });
    m.getUser.mockResolvedValue({ uid: "existing", customClaims: {} });
    m.createUser.mockResolvedValue({ uid: "new" });
    m.auth.mockReturnValue({ getUserByEmail: m.getUserByEmail, getUser: m.getUser, updateUser: m.updateUser, createUser: m.createUser });
    m.db.mockReturnValue({ collection: (collection: string) => ({ doc: () => ({ get: async () => ({ exists: collection === "businesses" ? businessExists : !!member, data: () => member }), set: m.set }) }) });
  });
  it("requires the central superadmin guard before reading Auth or Firestore", async () => {
    m.gate.mockResolvedValue({ error: new Response("Forbidden", { status: 403 }) });
    expect((await POST(request(), params)).status).toBe(403); expect(m.auth).not.toHaveBeenCalled(); expect(m.db).not.toHaveBeenCalled(); unchanged();
  });
  it.each([{ role: "superadmin", businessId: "biz" }, { superadmin: true, businessId: "biz" }, { role: "owner", businessId: "other" }, undefined])("refuses protected, other-tenant and unlinked memberships: %j", async value => {
    member = value;
    expect((await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params)).status).toBe(409); unchanged();
  });
  it("refuses a superadmin claim even with an ordinary membership", async () => {
    m.getUserByEmail.mockResolvedValue({ uid: "existing", customClaims: { superadmin: true } });
    expect((await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params)).status).toBe(409); unchanged();
  });
  it("also checks the platform-account helper's live Auth record", async () => {
    m.getUser.mockResolvedValue({ uid: "existing", customClaims: { superadmin: true } });
    expect((await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params)).status).toBe(409); unchanged();
  });
  it.each([undefined, false])("requires explicit reset for an existing same-tenant member (%s)", async resetPassword => {
    const res = await POST(request({ ownerEmail: "client@example.test", resetPassword }), params);
    expect(res.status).toBe(409); expect(await res.json()).toEqual(expect.objectContaining({ error: expect.stringContaining("Reset password") })); unchanged();
  });
  it("resets only the password, preserving membership, role, active flag and creation date", async () => {
    const res = await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params);
    expect(res.status).toBe(200); expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json(); expect(Object.keys(body)).toEqual(["tempPassword"]); expect(body.tempPassword).toHaveLength(12);
    expect(m.updateUser).toHaveBeenCalledWith("existing", { password: body.tempPassword }); expect(m.set).not.toHaveBeenCalled(); expect(m.createUser).not.toHaveBeenCalled();
  });
  it("does not create an account from the reset action", async () => {
    m.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params)).status).toBe(409); unchanged();
  });
  it("creates a new owner only when Auth explicitly says user-not-found", async () => {
    m.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    const res = await POST(request({ ownerEmail: "  CLIENT@example.test  " }), params); expect(res.status).toBe(200);
    const body = await res.json(); expect(m.createUser).toHaveBeenCalledWith({ email: "client@example.test", password: body.tempPassword, emailVerified: false });
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ uid: "new", businessId: "biz", role: "owner", email: "client@example.test" })); expect(m.updateUser).not.toHaveBeenCalled();
  });
  it.each(["auth/internal-error", "auth/too-many-requests"]) ("fails closed on lookup error %s", async code => {
    m.getUserByEmail.mockRejectedValue({ code, message: "private-provider-detail" });
    const res = await POST(request(), params); expect(res.status).toBe(503); expect(JSON.stringify(await res.json())).not.toContain("private-provider-detail"); unchanged();
  });
  it("does not fall back to creating a user when a password update fails", async () => {
    m.updateUser.mockRejectedValue(new Error("private-password-error"));
    const res = await POST(request({ ownerEmail: "client@example.test", resetPassword: true }), params); expect(res.status).toBe(503); expect(m.createUser).not.toHaveBeenCalled(); expect(m.set).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ownerEmail: "bad" }, { ownerEmail: 1 }, { ownerEmail: "a@example.test", resetPassword: "true" }])("rejects invalid input %j", async body => { expect((await POST(request(body), params)).status).toBe(400); unchanged(); });
  it("rejects malformed JSON", async () => { expect((await POST(new NextRequest("http://localhost", { method: "POST", body: "{" }), params)).status).toBe(400); unchanged(); });
  it("refuses a missing business", async () => { businessExists = false; expect((await POST(request(), params)).status).toBe(404); unchanged(); });
  it("refuses unavailable Admin SDK", async () => { m.auth.mockReturnValue(null); expect((await POST(request(), params)).status).toBe(503); unchanged(); });
});
