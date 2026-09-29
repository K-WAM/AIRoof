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
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", extraPhoneNumbers: "+16045550123" } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", extraPhoneNumbers: ["604-555-0123"] } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", extraPhoneNumbers: Array.from({ length: 6 }, (_, index) => `+1604555012${index}`) } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", extraPhoneNumbers: ["+16045550123", "+16045550123"] } },
    { voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "pn_1", phoneNumber: "+15551234567", extraPhoneNumbers: ["+15551234567"] } },
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
      where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
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
    const elevenlabs = { agentId: "agent_11", phoneNumberId: "phone_11", phoneNumber: "+15551234567", extraPhoneNumbers: ["+16045550123"] };
    expect((await PUT(providerRequest({ voiceProvider: "elevenlabs", elevenlabs }), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")).toMatchObject({ voiceProvider: "elevenlabs", elevenlabs, vapiAssistantId: "vapi-agent", vapiPhoneNumberId: "vapi-phone" });
    expect((await PUT(providerRequest({ voiceProvider: "vapi" }), params)).status).toBe(200);
    expect(documents.get("businesses/biz-1")).toMatchObject({ voiceProvider: "vapi", elevenlabs, vapiAssistantId: "vapi-agent", vapiPhoneNumberId: "vapi-phone" });
  });

  // T-171: the conflict check is findLineConflicts (primary, extra, registry, demo reservation) — exercised here against
  // the shared in-memory Firestore fake instead of a hand-sequenced query mock.
  it.each(["primary", "extra"] as const)("rejects a phone number used by another business as its %s number", async (field) => {
    const { makeFakeDb } = await import("@/test-utils/fakeFirestore");
    const db = makeFakeDb();
    db.__seed("businesses", "biz-1", { businessName: "Example", industry: "roofing" });
    db.__seed("businesses", "other-business", { elevenlabs: field === "primary" ? { agentId: "a", phoneNumber: "+15551234567" } : { agentId: "a", phoneNumber: "+15559999999", extraPhoneNumbers: ["+16045550123"] } });
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const response = await PUT(providerRequest({
      voiceProvider: "elevenlabs",
      elevenlabs: { agentId: "agent_11", phoneNumberId: "phone_11", phoneNumber: "+15551234567", extraPhoneNumbers: ["+16045550123"] },
    }), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already answers calls for another business/);
  });

  it("rejects the shared demo line on a client, and a client's line on the demo tenant", async () => {
    const { makeFakeDb } = await import("@/test-utils/fakeFirestore");
    const db = makeFakeDb();
    db.__seed("businesses", "biz-1", { businessName: "Example", industry: "roofing" });
    db.__seed("businesses", "demo-roofing", { isDemo: true, elevenlabs: { agentId: "d", phoneNumber: "+16892042643", extraPhoneNumbers: ["+17789079769"] } });
    db.__seed("businessPhoneNumbers", "biz-1-main", { businessId: "biz-1", normalizedPhoneNumber: "+15551234567", purpose: "client", status: "draft" });
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const demoOnClient = await PUT(providerRequest({ voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_11", phoneNumberId: "phone_11", phoneNumber: "+17789079769" } }), params);
    expect(demoOnClient.status).toBe(409);
    expect((await demoOnClient.json()).error).toMatch(/shared demo line/);
    const clientOnDemo = await PUT(
      providerRequest({ voiceProvider: "elevenlabs", elevenlabs: { agentId: "d", phoneNumberId: "p", phoneNumber: "+16892042643", extraPhoneNumbers: ["+17789079769", "+15551234567"] } }),
      { params: Promise.resolve({ businessId: "demo-roofing" }) },
    );
    expect(clientOnDemo.status).toBe(409);
    expect(db.__peek("businesses", "demo-roofing")?.elevenlabs).toEqual({ agentId: "d", phoneNumber: "+16892042643", extraPhoneNumbers: ["+17789079769"] });
  });

  it("lets a business keep saving its own numbers", async () => {
    const { makeFakeDb } = await import("@/test-utils/fakeFirestore");
    const db = makeFakeDb();
    db.__seed("businesses", "biz-1", { businessName: "Example", industry: "roofing", planTier: "standard", elevenlabs: { agentId: "agent_11", phoneNumber: "+15551234567" } });
    mocks.getAdminFirestore.mockReturnValue(db);
    const { PUT } = await import("../route");
    const response = await PUT(providerRequest({ voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_11", phoneNumberId: "phone_11", phoneNumber: "+15551234567" } }), params);
    expect(response.status).toBe(200);
  });

  it("accepts client/test/archived as the account purpose and refuses setting demo", async () => {
    const { PUT } = await import("../route");
    const refused = await PUT(providerRequest({ accountPurpose: "demo" }), params);
    expect(refused.status).toBe(400);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });
});
