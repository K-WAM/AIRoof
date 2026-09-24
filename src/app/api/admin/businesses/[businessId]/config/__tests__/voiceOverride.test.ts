import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifySuperadmin: vi.fn(), getAdminFirestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));

const params = { params: Promise.resolve({ businessId: "biz-1" }) };
function request(voice: unknown) {
  return new NextRequest("http://localhost/api/admin/businesses/biz-1/config", {
    method: "PUT",
    body: JSON.stringify({ voice }),
  });
}
function providerRequest(value: unknown) {
  return new NextRequest("http://localhost/api/admin/businesses/biz-1/config", { method: "PUT", body: JSON.stringify(value) });
}

describe("admin voice config route", () => {
  beforeEach(() => {
    mocks.verifySuperadmin.mockReset();
    mocks.getAdminFirestore.mockReset();
    mocks.verifySuperadmin.mockResolvedValue({ user: { uid: "superadmin" } });
  });

  it("rejects a caller without superadmin access before reading the payload or database", async () => {
    mocks.verifySuperadmin.mockResolvedValue({ error: new Response("Forbidden", { status: 403 }) });
    const { PUT } = await import("../route");
    const response = await PUT(request({ en: { provider: "11labs", voiceId: "abc" } }), params);
    expect(response.status).toBe(403);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it.each([
    { voiceProvider: "unknown" },
    { voiceProvider: "elevenlabs" },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "bad/id", phoneNumberId: "pn_1", phoneNumber: "+15551234567" } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "555-123-4567" } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", secret: "extra" } },
  ])("rejects invalid provider config before database access", async (body) => {
    const { PUT } = await import("../route");
    const response = await PUT(providerRequest(body), params);
    expect(response.status).toBe(400);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it.each([
    { en: { provider: "unknown", voiceId: "abc" } },
    { en: { provider: "11labs", voiceId: "" } },
    { en: { provider: "11labs", voiceId: "bad/id" } },
    { es: { provider: "cartesia", voiceId: "a".repeat(101) } },
    { es: { provider: "cartesia", voiceId: "valid", model: "m".repeat(61) } },
    { en: { provider: "11labs", voiceId: "valid", secret: "should-not-echo" } },
  ])("rejects malformed voice override without touching storage", async (voice) => {
    const { PUT } = await import("../route");
    const response = await PUT(request(voice), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid voice override" });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it("stores a validated override and clears it with an empty voice map", async () => {
    const documents = new Map<string, Record<string, unknown>>([
      ["businesses/biz-1", { businessId: "biz-1", businessName: "Example", industry: "roofing", planTier: "standard", vapiAssistantId: "vapi-agent", vapiPhoneNumberId: "vapi-phone" }],
    ]);
    const collection = (name: string) => ({
      doc: (id: string) => ({
        id,
        path: `${name}/${id}`,
        get: async () => ({ exists: documents.has(`${name}/${id}`), data: () => documents.get(`${name}/${id}`) }),
      }),
    });
    const db = {
      collection,
      runTransaction: async (fn: (tx: {
        get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        update: (ref: { path: string }, value: Record<string, unknown>) => void;
        set: (ref: { path: string }, value: Record<string, unknown>) => void;
      }) => Promise<unknown>) => fn({
        get: async (ref) => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
        update: (ref, value) => documents.set(ref.path, { ...documents.get(ref.path), ...value }),
        set: (ref, value) => documents.set(ref.path, value),
      }),
    };
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const voice = { en: { provider: "11labs", voiceId: "warm_voice", model: "eleven_turbo_v2" } };
    expect((await PUT(request(voice), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")?.voice).toEqual(voice);
    expect((await PUT(request({}), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")?.voice).toEqual({});
    const elevenlabs = { agentId: "agent_11", phoneNumberId: "phone_11", phoneNumber: "+15551234567" };
    expect((await PUT(providerRequest({ voiceProvider: "elevenlabs", elevenlabs }), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")).toMatchObject({ voiceProvider: "elevenlabs", elevenlabs, vapiAssistantId: "vapi-agent", vapiPhoneNumberId: "vapi-phone" });
    expect((await PUT(providerRequest({ voiceProvider: "vapi" }), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")).toMatchObject({ voiceProvider: "vapi", elevenlabs, vapiAssistantId: "vapi-agent", vapiPhoneNumberId: "vapi-phone" });
  });
});
