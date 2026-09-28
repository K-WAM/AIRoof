import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessConfig } from "@/types";

const mocks = vi.hoisted(() => ({ startOutboundCall: vi.fn(), persist: vi.fn() }));
vi.mock("../client", () => ({ elevenLabsVoiceProvider: { startOutboundCall: mocks.startOutboundCall } }));
vi.mock("../conversationRecords", () => ({ persistElevenLabsConversation: mocks.persist }));
import { placeElevenLabsOutboundCall } from "../outbound";

const config = {
  businessId: "demo-roofing", businessName: "Roofdoctor South Florida", industry: "roofing", agentName: "Alice",
  serviceArea: "Miami", timezone: "America/New_York",
  businessHours: { Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00", Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed" },
  greeting: "Thanks for calling Roofdoctor South Florida, this is Alice.",
  emergencyRules: [], bookingRules: [], approvedServices: [], approvedFaqs: [], disallowedTopics: [],
  voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent_1", phoneNumberId: "phone_1" },
} as unknown as BusinessConfig;

describe("placeElevenLabsOutboundCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startOutboundCall.mockResolvedValue({ callId: "conv_out_1" });
    mocks.persist.mockResolvedValue("conv_out_1");
  });

  it("sends the tenant's own prompt, greeting and date variables, not just a greeting", async () => {
    await placeElevenLabsOutboundCall({ businessId: "demo-roofing", config, targetPhone: "+18254887791", now: new Date("2026-09-28T13:00:00Z") });
    const input = mocks.startOutboundCall.mock.calls[0][0];
    expect(input.systemPrompt).toContain("Roofdoctor South Florida");
    expect(input.firstMessage).toContain("Thanks for calling Roofdoctor South Florida");
    expect(input.variables).toEqual(expect.objectContaining({ currentDate: "Monday, September 28, 2026", callerPhone: "+18254887791" }));
    expect(input.language).toBe("en");
  });

  it("appends the purpose section and uses the purpose opener", async () => {
    await placeElevenLabsOutboundCall({
      businessId: "demo-roofing", config, targetPhone: "+18254887791",
      firstMessage: "Hi Kareem, calling to confirm.", promptSection: "## This call: YOU are calling the customer",
    });
    const input = mocks.startOutboundCall.mock.calls[0][0];
    expect(input.firstMessage).toBe("Hi Kareem, calling to confirm.");
    expect(input.systemPrompt).toMatch(/Roofdoctor South Florida[\s\S]*\n\n## This call: YOU are calling the customer$/);
  });

  it("records the conversation so the booking tools and post-call webhook find the business", async () => {
    await placeElevenLabsOutboundCall({ businessId: "demo-roofing", config, targetPhone: "+18254887791" });
    expect(mocks.persist).toHaveBeenCalledWith({
      businessId: "demo-roofing", callerPhone: "+18254887791", agentId: "agent_1", conversationId: "conv_out_1",
    });
  });

  it("still returns the call when the record cannot be written", async () => {
    mocks.persist.mockRejectedValue(new Error("firestore down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(placeElevenLabsOutboundCall({ businessId: "demo-roofing", config, targetPhone: "+18254887791" })).resolves.toEqual({ callId: "conv_out_1" });
    spy.mockRestore();
  });
});
