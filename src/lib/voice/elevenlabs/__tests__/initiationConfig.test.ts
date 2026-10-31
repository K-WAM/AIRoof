import { describe, expect, it } from "vitest";
import type { BusinessConfig } from "@/types";
import { DEFAULT_RECORDING_DISCLOSURE_EN } from "@/lib/recordingDisclosure";
import {
  buildInitiationResponse,
  genericInitiationResponse,
  isAfterHoursNow,
} from "@/lib/voice/elevenlabs/initiationConfig";

function config(overrides: Partial<BusinessConfig> = {}): BusinessConfig {
  return {
    businessId: "biz1",
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
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

// Wednesday 2026-09-30 14:00 UTC = 10:00 in America/New_York (EDT, UTC-4).
const WEDNESDAY_10AM_ET = new Date("2026-09-30T14:00:00.000Z");
// Wednesday 2026-09-30 23:00 UTC = 19:00 ET — after the 17:00 close.
const WEDNESDAY_7PM_ET = new Date("2026-09-30T23:00:00.000Z");

describe("isAfterHoursNow", () => {
  it("is false during open hours", () => {
    expect(isAfterHoursNow(config().businessHours, "America/New_York", WEDNESDAY_10AM_ET)).toBe(false);
  });

  it("is true after close", () => {
    expect(isAfterHoursNow(config().businessHours, "America/New_York", WEDNESDAY_7PM_ET)).toBe(true);
  });

  it("is true on a closed day", () => {
    const saturday = new Date("2026-10-03T15:00:00.000Z"); // Saturday
    expect(isAfterHoursNow(config().businessHours, "America/New_York", saturday)).toBe(true);
  });

  it("is true when the day has no hours entry", () => {
    expect(
      isAfterHoursNow({ Monday: "08:00 - 17:00" }, "America/New_York", WEDNESDAY_10AM_ET)
    ).toBe(true);
  });

  it("treats a non-object businessHours as after hours (Vapi parity)", () => {
    expect(isAfterHoursNow("By appointment", "America/New_York", WEDNESDAY_10AM_ET)).toBe(true);
  });
});

describe("buildInitiationResponse", () => {
  it("returns the documented response shape with the tenant's prompt and greeting", () => {
    const response = buildInitiationResponse(config(), "+1 (305) 555-0100", WEDNESDAY_10AM_ET);

    expect(response.type).toBe("conversation_initiation_client_data");
    expect(response.conversation_config_override.agent?.prompt?.prompt).toContain("Apex Roofing");
    expect(response.conversation_config_override.agent?.language).toBe("en");
    expect(response.dynamic_variables.currentDate).toBeTruthy();
    expect(response.dynamic_variables.currentTime).toBeTruthy();
    expect(response.dynamic_variables.currentTimezone).toBe("America/New_York");
    expect(response.dynamic_variables.callerPhone).toBe("+1 (305) 555-0100");
  });

  it("greets, gives the recording notice and the Spanish line, then ends on the question (caller's cue to talk)", () => {
    const response = buildInitiationResponse(config(), undefined, WEDNESDAY_10AM_ET);
    expect(response.conversation_config_override.agent?.first_message).toBe(
      `Thanks for calling Apex Roofing. ${DEFAULT_RECORDING_DISCLOSURE_EN} También hablamos español. How can I help you today?`
    );
  });

  it("keeps the tenant's own closing question last", () => {
    const response = buildInitiationResponse(
      config({ greeting: "Thanks for calling Apex Roofing, this is Alice. How can I help?" }),
      undefined,
      WEDNESDAY_10AM_ET
    );
    expect(response.conversation_config_override.agent?.first_message).toBe(
      `Thanks for calling Apex Roofing, this is Alice. ${DEFAULT_RECORDING_DISCLOSURE_EN} También hablamos español. How can I help?`
    );
  });

  it("after hours: the short normal greeting (no after-hours speech), after-hours context in the prompt", () => {
    const response = buildInitiationResponse(
      config({ afterHoursGreeting: "You've reached Apex after hours. We'll confirm first thing." }),
      undefined,
      WEDNESDAY_7PM_ET
    );
    const first = response.conversation_config_override.agent?.first_message ?? "";
    expect(first).toContain("Thanks for calling Apex Roofing.");
    expect(first).not.toContain("after hours");
    expect(first).toMatch(/\?$/);
    expect(response.dynamic_variables.afterHoursContext).toContain("after business hours");
    expect(response.conversation_config_override.agent?.prompt?.prompt).toContain("after business hours");
  });

  it("falls back to the after-hours greeting only when there is no normal greeting", () => {
    const response = buildInitiationResponse(
      config({ greeting: "", afterHoursGreeting: "You've reached Apex." }),
      undefined,
      WEDNESDAY_7PM_ET
    );
    expect(response.conversation_config_override.agent?.first_message).toContain("You've reached Apex.");
  });

  it("every call starts in English with one Spanish line, whatever language was stored before", () => {
    const response = buildInitiationResponse(config({ agentLanguage: "es" }), undefined, WEDNESDAY_10AM_ET);
    expect(response.conversation_config_override.agent?.language).toBe("en");
    expect(response.conversation_config_override.agent?.first_message?.match(/También hablamos español\./g)).toHaveLength(1);
    expect(response.conversation_config_override.agent?.prompt?.prompt).toContain("English and Spanish, always");
  });

  it("leaves the notice out when the disclosure is disabled", () => {
    const response = buildInitiationResponse(
      config({ recordingDisclosure: { enabled: false, text: "" } }),
      undefined,
      WEDNESDAY_10AM_ET
    );
    expect(response.conversation_config_override.agent?.first_message).toBe(
      "Thanks for calling Apex Roofing. También hablamos español. How can I help you today?"
    );
  });

  it("applies the T-103 voice override only for a configured 11labs voice", () => {
    const with11labs = buildInitiationResponse(
      config({ voice: { en: { provider: "11labs", voiceId: "voice_abc" } } }),
      undefined,
      WEDNESDAY_10AM_ET
    );
    expect(with11labs.conversation_config_override.tts).toEqual({ voice_id: "voice_abc" });

    const withVapiVoice = buildInitiationResponse(
      config({ voice: { en: { provider: "vapi", voiceId: "vapi-id" } } }),
      undefined,
      WEDNESDAY_10AM_ET
    );
    expect(withVapiVoice.conversation_config_override.tts).toBeUndefined();

    const withNone = buildInitiationResponse(config(), undefined, WEDNESDAY_10AM_ET);
    expect(withNone.conversation_config_override.tts).toBeUndefined();
  });

  it("omits empty prompt/greeting overrides instead of blanking the agent (config failure safety)", () => {
    const response = buildInitiationResponse(
      config({ greeting: "", approvedServices: [] }),
      undefined,
      WEDNESDAY_10AM_ET
    );
    // Prompt is built from config regardless of greeting; greeting itself is empty -> omitted.
    expect(response.conversation_config_override.agent?.first_message).toBeUndefined();
    expect(response.conversation_config_override.agent?.prompt?.prompt).toBeTruthy();
  });
});

describe("genericInitiationResponse (unknown tenant fail-safe)", () => {
  it("returns empty overrides and variables — nothing tenant-specific", () => {
    const response = genericInitiationResponse();
    expect(response.type).toBe("conversation_initiation_client_data");
    expect(response.conversation_config_override).toEqual({});
    expect(response.dynamic_variables).toEqual({ businessName: "the office", agentName: "the virtual assistant" });
  });
});
