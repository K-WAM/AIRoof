import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import type { BusinessConfig } from "@/types";
import { DEFAULT_RECORDING_DISCLOSURE_EN } from "@/lib/recordingDisclosure";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  findBusinessByElevenLabsAgentId: vi.fn(),
  findBusinessByElevenLabsPhoneNumber: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/vapi/businessLookup", () => ({
  findBusinessByElevenLabsAgentId: mocks.findBusinessByElevenLabsAgentId,
  findBusinessByElevenLabsPhoneNumber: mocks.findBusinessByElevenLabsPhoneNumber,
}));

import { POST } from "@/app/api/webhooks/elevenlabs/initiation/route";

function requestFor(body: Record<string, unknown>, secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/elevenlabs/initiation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-luxor-tool-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const INITIATION_BODY = {
  caller_id: "+1 (305) 555-0100",
  called_number: "+17542837658",
  agent_id: "agent_1",
  call_sid: "CA123",
  conversation_id: "conv_1",
};

function businessConfig(overrides: Partial<BusinessConfig> = {}): BusinessConfig {
  return {
    businessId: "biz_1",
    businessName: "Apex Roofing",
    industry: "roofing",
    serviceArea: "Miami",
    businessHours: {
      Monday: "08:00 - 17:00",
      Tuesday: "08:00 - 17:00",
      Wednesday: "08:00 - 17:00",
      Thursday: "08:00 - 17:00",
      Friday: "08:00 - 17:00",
      Saturday: "Closed",
      Sunday: "Closed",
    },
    emergencyRules: [],
    bookingRules: [],
    approvedServices: ["Roof repair"],
    approvedFaqs: [],
    disallowedTopics: [],
    active: true,
    greeting: "Thanks for calling Apex Roofing.",
    timezone: "America/New_York",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("POST /api/webhooks/elevenlabs/initiation", () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "expected-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db = makeFakeDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue(null);
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue(null);
    _resetRateLimitState();
  });

  it.each([
    ["missing secret", undefined],
    ["wrong secret", "wrong-secret"],
  ])("returns 401 with no detail and no side effects for %s", async (_case, secret) => {
    const response = await POST(requestFor(INITIATION_BODY, secret));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.findBusinessByElevenLabsAgentId).not.toHaveBeenCalled();
    expect(mocks.findBusinessByElevenLabsPhoneNumber).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/webhooks/elevenlabs/initiation", {
      method: "POST",
      headers: { "content-type": "application/json", "x-luxor-tool-secret": "expected-secret" },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns a safe generic response for an unknown tenant and persists nothing", async () => {
    const response = await POST(requestFor(INITIATION_BODY, "expected-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.type).toBe("conversation_initiation_client_data");
    expect(body.conversation_config_override).toEqual({});
    expect(body.dynamic_variables).toEqual({});
    // No tenant info leaks and no conversation record is persisted.
    expect(JSON.stringify(body)).not.toContain("biz_");
    expect(db.__peek("elevenlabsConversations", "conv_1")).toBeUndefined();
  });

  it("resolves the tenant by called number and returns the per-call overrides", async () => {
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue("biz_1");
    db.__seed("businesses", "biz_1", { ...businessConfig() });

    const response = await POST(requestFor(INITIATION_BODY, "expected-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.type).toBe("conversation_initiation_client_data");
    expect(body.conversation_config_override.agent.prompt.prompt).toContain("Apex Roofing");
    expect(body.conversation_config_override.agent.first_message.startsWith(
      DEFAULT_RECORDING_DISCLOSURE_EN
    )).toBe(true);
    expect(body.conversation_config_override.agent.first_message).toContain(
      "Thanks for calling Apex Roofing."
    );
    expect(body.conversation_config_override.agent.language).toBe("en");
    expect(body.dynamic_variables.callerPhone).toBe("+1 (305) 555-0100");
  });

  it("uses the agent id when the called number is absent", async () => {
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue(null);
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue("biz_2");
    db.__seed("businesses", "biz_2", { ...businessConfig({ businessId: "biz_2" }) });

    const response = await POST(requestFor({ ...INITIATION_BODY, called_number: undefined }, "expected-secret"));
    expect(response.status).toBe(200);
    expect(mocks.findBusinessByElevenLabsAgentId).toHaveBeenCalledWith("agent_1");
  });

  it("does not route an unknown called number through a shared agent id", async () => {
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue("biz_2");
    const response = await POST(requestFor(INITIATION_BODY, "expected-secret"));
    expect(await response.json()).toEqual({
      type: "conversation_initiation_client_data",
      conversation_config_override: {}, dynamic_variables: {},
    });
    expect(mocks.findBusinessByElevenLabsAgentId).not.toHaveBeenCalled();
  });

  it("persists the conversation record keyed by conversation_id for the tools", async () => {
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue("biz_1");
    db.__seed("businesses", "biz_1", { ...businessConfig() });

    await POST(requestFor(INITIATION_BODY, "expected-secret"));

    const record = db.__peek("elevenlabsConversations", "conv_1");
    expect(record).toBeDefined();
    expect(record?.businessId).toBe("biz_1");
    expect(record?.callerPhone).toBe("+1 (305) 555-0100");
    expect(record?.calledNumber).toBe("+17542837658");
    expect((record?.expiresAt as { toMillis: () => number }).toMillis()).toBeGreaterThan(Date.now());
    expect(db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_1")).toMatchObject({
      businessId: "biz_1",
      callerPhone: "+1 (305) 555-0100",
      status: "in_progress",
      provider: "elevenlabs",
      providerIds: { elevenLabsConversationId: "conv_1" },
    });
  });

  it("still returns the call response when the live-row write fails", async () => {
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue("biz_1");
    db.__seed("businesses", "biz_1", { ...businessConfig() });
    const originalCollection = db.collection;
    let callWrite = false;
    db.collection = ((name: string) => {
      const collection = originalCollection(name);
      if (name !== "businesses") return collection;
      const originalDoc = collection.doc.bind(collection);
      collection.doc = ((id?: string) => {
        const doc = originalDoc(id);
        if (id !== "biz_1") return doc;
        const originalSubcollection = doc.collection.bind(doc);
        doc.collection = ((sub: string) => {
          const nested = originalSubcollection(sub);
          if (sub !== "calls") return nested;
          const originalCallDoc = nested.doc.bind(nested);
          nested.doc = ((callId?: string) => {
            const callDoc = originalCallDoc(callId);
            callDoc.set = async () => { callWrite = true; throw new Error("write failed"); };
            return callDoc;
          }) as typeof nested.doc;
          return nested;
        }) as typeof doc.collection;
        return doc;
      }) as typeof collection.doc;
      return collection;
    }) as typeof db.collection;

    const response = await POST(requestFor(INITIATION_BODY, "expected-secret"));
    expect(response.status).toBe(200);
    expect(callWrite).toBe(true);
  });

  it("returns the generic response when the business doc is missing", async () => {
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue("biz_gone");
    // No business doc seeded.
    const response = await POST(requestFor(INITIATION_BODY, "expected-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversation_config_override).toEqual({});
  });
});
