import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseAppointmentRecord,
  parseCallOutcomeOutput,
  parseFaqSuggestionsOutput,
  parseFieldUpdateRecord,
  parseFieldUpdateOutput,
  parseLeadRecord,
  parseScopeClassification,
  parseSummaryOutput,
  parseTranscript,
  parseVapiToolInput,
  type SchemaParseResult,
  type VapiToolName,
} from "@/lib/schemas";
import {
  adversarialFixtures,
  type AdversarialFixture,
} from "@/lib/schemas/__tests__/fixtures/adversarial";

afterEach(() => {
  vi.restoreAllMocks();
});

function parseAdversarialFixture(fixture: AdversarialFixture): SchemaParseResult<unknown> {
  switch (fixture.parser) {
    case "appointment":
      return parseAppointmentRecord(fixture.input);
    case "callOutcome":
      return parseCallOutcomeOutput(fixture.input);
    case "faq":
      return parseFaqSuggestionsOutput(fixture.input);
    case "fieldUpdate":
      return parseFieldUpdateOutput(fixture.input);
    case "lead":
      return parseLeadRecord(fixture.input);
    case "scope":
      return parseScopeClassification(fixture.input);
    case "summary":
      return parseSummaryOutput(fixture.input);
    case "transcript":
      return parseTranscript(fixture.input);
    default: {
      const toolName = fixture.parser.replace("vapi.", "") as VapiToolName;
      return parseVapiToolInput(toolName, fixture.input);
    }
  }
}

describe("Vapi tool input schemas", () => {
  it("accepts all seven existing tool contracts, coerces numbers, and strips extras", () => {
    const cases: Array<[VapiToolName, unknown]> = [
      [
        "checkAvailability",
        {
          businessId: "biz-1",
          preferredDate: "tomorrow",
          durationMinutes: "60",
          injectedExtra: "strip me",
        },
      ],
      [
        "bookAppointment",
        {
          businessId: "biz-1",
          callerName: "Alex",
          callerPhone: "+15551234567",
          startTime: "1760000000000",
          endTime: "1760003600000",
          injectedExtra: "strip me",
        },
      ],
      ["createLead", { businessId: "biz-1", urgency: "normal", callerName: "Alex" }],
      ["escalateCall", { businessId: "biz-1", callId: "call-1", reason: "Active leak" }],
      ["lookupAppointment", { businessId: "biz-1", callId: "call-1" }],
      [
        "cancelAppointment",
        {
          businessId: "biz-1",
          callId: "call-1",
          confirmCancellation: true,
          appointmentNumber: "2",
        },
      ],
      ["getCurrentDate", { businessId: "biz-1" }],
    ];

    for (const [toolName, input] of cases) {
      const result = parseVapiToolInput(toolName, input);
      expect(result.ok, toolName).toBe(true);
      if (result.ok) expect(result.data).not.toHaveProperty("injectedExtra");
    }

    const booking = parseVapiToolInput("bookAppointment", cases[1][1]);
    expect(booking).toMatchObject({
      ok: true,
      data: { startTime: 1_760_000_000_000, endTime: 1_760_003_600_000 },
    });
    const cancellation = parseVapiToolInput("cancelAppointment", cases[5][1]);
    expect(cancellation).toMatchObject({ ok: true, data: { appointmentNumber: 2 } });
  });
});

describe("AI structured output schemas", () => {
  it("unwraps nested JSON, coerces finite numeric strings, and strips extra keys", () => {
    const payload = JSON.stringify(
      JSON.stringify({
        timeline: [{ time: "08:00", description: "Arrived", extra: "strip" }],
        materials: [{ item: "Shingles", quantity: "12", unit: "squares", cost: "900" }],
        labor: [{ description: "Alex", hours: "7.5", rate: "30" }],
        issues: [{ description: "Minor flashing damage", severity: "low" }],
        invoiceSuggestions: [
          { description: "Repair", quantity: "1", unitPrice: "250", total: "250" },
        ],
        correction: null,
        injectedExtra: "strip",
      })
    );

    const result = parseFieldUpdateOutput(payload);

    expect(result).toMatchObject({
      ok: true,
      data: {
        materials: [{ cost: 900 }],
        labor: [{ hours: 7.5, rate: 30 }],
        invoiceSuggestions: [{ quantity: 1, unitPrice: 250, total: 250 }],
      },
    });
    if (result.ok) {
      expect(result.data).not.toHaveProperty("injectedExtra");
      expect(result.data.timeline[0]).not.toHaveProperty("extra");
      expect(result.data).not.toHaveProperty("correction");
    }
  });

  it("parses summaries, call outcomes, scope classifications, FAQs, and transcripts", () => {
    expect(
      parseSummaryOutput(
        JSON.stringify(JSON.stringify({ summary: "Inspection booked.", actionItems: ["Confirm crew"] }))
      )
    ).toMatchObject({ ok: true, data: { summary: "Inspection booked." } });
    expect(
      parseCallOutcomeOutput({ outcome: "scheduled", reason: "Appointment created" })
    ).toMatchObject({ ok: true, data: { outcome: "scheduled" } });
    expect(
      parseScopeClassification({
        category: "scheduling",
        confidence: "0.85",
        reason: "Appointment request",
        allowedToAnswer: true,
        extra: "strip",
      })
    ).toMatchObject({ ok: true, data: { confidence: 0.85 } });
    expect(
      parseFaqSuggestionsOutput({
        suggestions: [{ question: "Do you inspect?", answer: "Yes." }],
      })
    ).toMatchObject({ ok: true });
    expect(parseTranscript([{ role: "user", text: "I need an inspection" }])).toMatchObject({
      ok: true,
    });
  });
});

describe("persistence-bound schemas", () => {
  it("accepts records that mirror the existing Appointment and Lead types", () => {
    expect(
      parseAppointmentRecord({
        appointmentId: "apt-1",
        businessId: "biz-1",
        callerName: "Alex",
        startTime: "1760000000000",
        endTime: "1760003600000",
        calendarProvider: "mock",
        status: "requested",
        createdAt: "1760000000000",
        updatedAt: "1760000000000",
      })
    ).toMatchObject({ ok: true, data: { startTime: 1_760_000_000_000 } });
    expect(
      parseLeadRecord({
        leadId: "lead-1",
        businessId: "biz-1",
        callerEmail: "alex@example.com",
        urgency: "normal",
        status: "new",
        createdAt: "1760000000000",
        updatedAt: "1760000000000",
      })
    ).toMatchObject({ ok: true });
    expect(
      parseFieldUpdateRecord({
        updateId: "update-1",
        rawText: "Installed twelve squares of shingles",
        createdAt: "1760000000000",
        parsed: {
          timeline: [],
          materials: [{ item: "Shingles", quantity: "12", cost: "900" }],
          labor: [],
          issues: [],
          invoiceSuggestions: [],
        },
        injectedExtra: "strip",
      })
    ).toMatchObject({
      ok: true,
      data: { createdAt: 1_760_000_000_000, parsed: { materials: [{ cost: 900 }] } },
    });
  });
});

describe("adversarial fixtures", () => {
  it.each(adversarialFixtures)("rejects $name", (fixture) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = parseAdversarialFixture(fixture);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it("logs only redacted, truncated input metadata", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const secret = "customer.private@example.com";
    const result = parseSummaryOutput({ summary: "", actionItems: [secret] });

    expect(result.ok).toBe(false);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("customer");
    expect(logged.length).toBeLessThan(2_000);
  });
});
