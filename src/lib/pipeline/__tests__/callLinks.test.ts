import { describe, it, expect } from "vitest";
import { findCallLinks } from "@/lib/pipeline/callLinks";

const leads = [
  { leadId: "lead-1", sourceCallId: "call-100" },
  { leadId: "lead-2", sourceCallId: "call-101" },
  { leadId: "lead-3" }, // legacy doc without a sourceCallId
];

const appointments = [
  { appointmentId: "appt-9", sourceCallId: "call-200" },
  { appointmentId: "appt-10", sourceCallId: "call-101" },
];

describe("findCallLinks", () => {
  it("matches a lead by sourceCallId", () => {
    expect(findCallLinks("call-100", leads, appointments)).toEqual({ leadId: "lead-1", appointmentId: undefined });
  });

  it("matches an appointment by sourceCallId", () => {
    expect(findCallLinks("call-200", leads, appointments)).toEqual({ leadId: undefined, appointmentId: "appt-9" });
  });

  it("matches both when the call produced a lead and an appointment", () => {
    expect(findCallLinks("call-101", leads, appointments)).toEqual({ leadId: "lead-2", appointmentId: "appt-10" });
  });

  it("returns neither for a call that produced nothing — callers render no link", () => {
    expect(findCallLinks("call-999", leads, appointments)).toEqual({ leadId: undefined, appointmentId: undefined });
  });

  it("never treats an undefined sourceCallId as a match", () => {
    expect(findCallLinks("undefined", leads, appointments)).toEqual({ leadId: undefined, appointmentId: undefined });
    expect(findCallLinks("", leads, appointments)).toEqual({ leadId: undefined, appointmentId: undefined });
  });
});
