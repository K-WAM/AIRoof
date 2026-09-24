import { describe, expect, it } from "vitest";
import {
  composeGreetingWithDisclosure,
  DEFAULT_RECORDING_DISCLOSURE_EN,
  DEFAULT_RECORDING_DISCLOSURE_ES,
  RECORDING_DISCLOSURE_MAX_LENGTH,
  resolveRecordingDisclosure,
  validateRecordingDisclosureText,
} from "./recordingDisclosure";
import type { BusinessConfig } from "@/types";

function config(overrides: Partial<BusinessConfig> = {}): BusinessConfig {
  return {
    businessId: "biz1",
    businessName: "Apex Roofing",
    industry: "roofing",
    serviceArea: "Miami",
    businessHours: "Mon-Fri 8-5",
    emergencyRules: [],
    bookingRules: [],
    approvedServices: [],
    approvedFaqs: [],
    disallowedTopics: [],
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("resolveRecordingDisclosure", () => {
  it("defaults ON with the English draft when the field is missing (existing tenants, no migration)", () => {
    const resolved = resolveRecordingDisclosure(config());
    expect(resolved.enabled).toBe(true);
    expect(resolved.text).toBe(DEFAULT_RECORDING_DISCLOSURE_EN);
  });

  it("uses the Spanish draft when agentLanguage is es", () => {
    const resolved = resolveRecordingDisclosure(config({ agentLanguage: "es" }));
    expect(resolved.enabled).toBe(true);
    expect(resolved.text).toBe(DEFAULT_RECORDING_DISCLOSURE_ES);
  });

  it("honors an explicit toggle off", () => {
    const resolved = resolveRecordingDisclosure(
      config({ recordingDisclosure: { enabled: false } })
    );
    expect(resolved.enabled).toBe(false);
  });

  it("uses owner custom text, trimmed", () => {
    const resolved = resolveRecordingDisclosure(
      config({ recordingDisclosure: { enabled: true, text: "  This call is recorded.  " } })
    );
    expect(resolved.text).toBe("This call is recorded.");
  });

  it("falls back to the drafted default when custom text is empty or whitespace", () => {
    expect(resolveRecordingDisclosure(config({ recordingDisclosure: { enabled: true, text: "" } })).text)
      .toBe(DEFAULT_RECORDING_DISCLOSURE_EN);
    expect(resolveRecordingDisclosure(config({ recordingDisclosure: { enabled: true, text: "   " } })).text)
      .toBe(DEFAULT_RECORDING_DISCLOSURE_EN);
  });

  it("fails open — malformed stored values never throw and stay default-on", () => {
    // @ts-expect-error — deliberately malformed stored doc
    expect(resolveRecordingDisclosure(config({ recordingDisclosure: { enabled: "yes" } })).enabled).toBe(true);
    // @ts-expect-error — deliberately malformed stored doc
    expect(resolveRecordingDisclosure(config({ recordingDisclosure: "on" })).enabled).toBe(true);
  });
});

describe("composeGreetingWithDisclosure", () => {
  const enabled = { enabled: true, text: "This call may be recorded and transcribed." };

  it("speaks the notice first in a normal greeting", () => {
    const composed = composeGreetingWithDisclosure(
      "Thanks for calling Apex Roofing, this is Roofus. How can I help?",
      enabled
    );
    expect(composed).toBe(
      "This call may be recorded and transcribed. Thanks for calling Apex Roofing, this is Roofus. How can I help?"
    );
  });

  it("composes the same way into an after-hours greeting", () => {
    const composed = composeGreetingWithDisclosure(
      "Thanks for calling Apex Roofing. The office is closed, but I can take your details.",
      enabled
    );
    expect(composed.startsWith("This call may be recorded and transcribed.")).toBe(true);
    expect(composed).toContain("The office is closed");
  });

  it("returns the base greeting untouched when disabled", () => {
    const base = "Thanks for calling Apex Roofing, this is Roofus.";
    expect(composeGreetingWithDisclosure(base, { enabled: false, text: "ignored" })).toBe(base);
  });

  it("returns just the notice when there is no base greeting", () => {
    expect(composeGreetingWithDisclosure("", enabled)).toBe("This call may be recorded and transcribed.");
    expect(composeGreetingWithDisclosure(undefined, enabled)).toBe("This call may be recorded and transcribed.");
    expect(composeGreetingWithDisclosure("", { enabled: false, text: "x" })).toBe("");
  });

  it("composes the Spanish default sentence", () => {
    const es = resolveRecordingDisclosure(config({ agentLanguage: "es" }));
    const composed = composeGreetingWithDisclosure("Gracias por llamar.", es);
    expect(composed).toBe(`${DEFAULT_RECORDING_DISCLOSURE_ES} Gracias por llamar.`);
  });
});

describe("validateRecordingDisclosureText", () => {
  it("accepts plain text up to the cap", () => {
    expect(validateRecordingDisclosureText("Calls are recorded.").ok).toBe(true);
    expect(validateRecordingDisclosureText("a".repeat(RECORDING_DISCLOSURE_MAX_LENGTH)).ok).toBe(true);
    expect(validateRecordingDisclosureText("").ok).toBe(true);
    expect(validateRecordingDisclosureText("   ").ok).toBe(true);
  });

  it("rejects text longer than the cap", () => {
    const check = validateRecordingDisclosureText("a".repeat(RECORDING_DISCLOSURE_MAX_LENGTH + 1));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain(String(RECORDING_DISCLOSURE_MAX_LENGTH));
  });

  it("rejects HTML and markup", () => {
    expect(validateRecordingDisclosureText("Call <b>me</b> back").ok).toBe(false);
    expect(validateRecordingDisclosureText("<script>alert(1)</script>").ok).toBe(false);
    expect(validateRecordingDisclosureText("Calls <img src=x onerror=alert(1)> recorded").ok).toBe(false);
  });

  it("allows plain punctuation and comparison symbols that are not tags", () => {
    expect(validateRecordingDisclosureText("Recorded & transcribed — ok.").ok).toBe(true);
    expect(validateRecordingDisclosureText("Longer than 2 < 3 minutes").ok).toBe(true);
  });
});
