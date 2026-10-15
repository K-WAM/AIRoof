import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), customToken: vi.fn(), phone: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: () => ({ createCustomToken: mocks.customToken }), getAdminFirestore: () => null }));
vi.mock("@/lib/auth/rateLimit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/demo/roofingTrial", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/demo/roofingTrial")>(), readTrial: mocks.read, createTrial: mocks.create,
}));
vi.mock("@/lib/demo/phoneTrial", () => ({ issuePhoneCode: mocks.phone }));
import { POST } from "./route";

const existing = { uid: "old-demo", name: "Original Caller", companyName: "Original Roofing", email: "original@example.test", businessId: "old-business", expiresAt: Date.now() + 60000, calls: 0, notes: 0 };
const details = { name: existing.name, companyName: existing.companyName, email: existing.email };
function request(body: unknown, origin = "https://example.test") {
  return new NextRequest("https://example.test/api/demo/roofing-trial", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.read.mockResolvedValue(existing); mocks.customToken.mockResolvedValue("unit-custom-signin");
  mocks.create.mockResolvedValue({ trial: { ...existing, ...details, uid: "new-demo", businessId: "new-business" }, cookie: "new-private-session" });
});

describe("resumed private demo identity", () => {
  it("rejects cross-origin requests and invalid input before creating a replacement", async () => {
    expect((await POST(request({ action: "create", ...details }, "https://evil.test"))).status).toBe(403);
    expect((await POST(request({ action: "create", ...details, companyName: "Bad\nName" }))).status).toBe(400);
    expect((await POST(request({ action: "create", ...details, businessId: "other-tenant" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reuses an identical setup retry without spending another session budget", async () => {
    const response = await POST(request({ action: "create", ...details }));
    expect((await response.json())).toMatchObject({ companyName: "Original Roofing", email: existing.email, businessId: existing.businessId });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([
    { companyName: "New Roofing" }, { name: "New Caller" }, { email: "new@example.test" }, { email: "" },
  ])("creates an isolated, budgeted session when setup details change: %j", async (change) => {
    const input = { ...details, ...change }, normalized = { ...input, email: input.email || null };
    mocks.create.mockResolvedValue({ trial: { ...existing, ...normalized, uid: "new-demo", businessId: "new-business" }, cookie: "new-private-session" });
    const response = await POST(request({ action: "create", ...input }));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.any(NextRequest), normalized);
    expect(await response.json()).toMatchObject({ ...normalized, businessId: "new-business" });
    expect(response.headers.get("Set-Cookie")).toContain("luxor_roofing_demo=new-private-session");
  });
  it("does not bypass creation budgets when changing an active demo", async () => {
    mocks.create.mockResolvedValue(null);
    const response = await POST(request({ action: "create", ...details, companyName: "New Roofing" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
  it("requires the private session and rejects model-selected identity for phone codes", async () => {
    mocks.read.mockResolvedValue(null);
    expect((await POST(request({ action: "phone" }))).status).toBe(401);
    mocks.read.mockResolvedValue(existing);
    expect((await POST(request({ action: "phone", businessId: "demo-roofing" }))).status).toBe(400);
    expect(mocks.phone).not.toHaveBeenCalled();
  });
  it("issues codes only for its stored session and never caches the credential", async () => {
    mocks.phone.mockResolvedValue({ code: "01234567", expiresAt: existing.expiresAt });
    const response = await POST(request({ action: "phone" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "01234567", expiresAt: existing.expiresAt });
    expect(mocks.phone).toHaveBeenCalledWith(existing);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    mocks.phone.mockResolvedValue({ error: "Phone limit reached" });
    expect((await POST(request({ action: "phone" }))).status).toBe(429);
  });});
