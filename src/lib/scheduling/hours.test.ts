import { describe, expect, it } from "vitest";
import {
  canonicalizeBusinessHours,
  dayWindow,
  isOpenAt,
  nextOpeningLabel,
  parseBusinessHours,
  parseDayHours,
  validateBusinessHours,
  zonedDateTimeToUtc,
} from "./hours";

const canonical = {
  Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00",
  Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed",
};

describe("business hours", () => {
  it.each([
    ["08:00 - 17:00", { open: 480, close: 1020 }],
    ["8:00-17:00", { open: 480, close: 1020 }],
    ["8am-5pm", { open: 480, close: 1020 }],
    ["8:00 AM - 5:00 PM", { open: 480, close: 1020 }],
    ["Closed", null],
    [{ open: "8am", close: "5pm" }, { open: 480, close: 1020 }],
    [{ closed: true }, null],
  ])("parses %j", (input, expected) => expect(parseDayHours(input)).toEqual(expected));

  it.each(["", "8", "25:00 - 26:00", "11-2", "17:00 - 08:00", { open: "8am" }])("rejects ambiguous or invalid day value %j", (input) => {
    expect(parseDayHours(input)).toBeUndefined();
  });

  it("parses and canonicalizes object and whole-week forms", () => {
    expect(canonicalizeBusinessHours(canonical)).toEqual(canonical);
    expect(canonicalizeBusinessHours("Mon-Fri 8-5")).toEqual(canonical);
    expect(parseBusinessHours("Friday-Monday 8-5")).toBeNull();
  });

  it("treats a weekday that isn't stored as Closed (the old parser's rule), so open-days-only tenants keep booking", () => {
    const weekdaysOnly = { Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00", Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00" };
    expect(canonicalizeBusinessHours(weekdaysOnly)).toEqual(canonical);
    expect(canonicalizeBusinessHours({ ...weekdaysOnly, Saturday: "" })).toEqual(canonical);
  });

  it("calls hours with no open day, or one unreadable day, not set up", () => {
    expect(parseBusinessHours({})).toBeNull();
    expect(parseBusinessHours({ Monday: "Closed", Sunday: "Closed" })).toBeNull();
    expect(parseBusinessHours({ ...canonical, Saturday: "by appointment" })).toBeNull();
  });

  it("returns field-level validation errors", () => {
    const result = validateBusinessHours({ ...canonical, Tuesday: "noonish", Sunday: undefined });
    expect(result).toEqual({ valid: false, errors: {
      Tuesday: "Enter a valid opening and closing time.",
      Sunday: "Choose hours or mark this day Closed.",
    } });
  });

  it("computes DST-correct day windows and open state", () => {
    const date = Date.parse("2026-11-03T17:00:00.000Z");
    expect(dayWindow(date, "America/New_York", canonical)).toEqual({
      startTime: Date.parse("2026-11-03T13:00:00.000Z"),
      endTime: Date.parse("2026-11-03T22:00:00.000Z"),
    });
    expect(isOpenAt(date, "America/New_York", canonical)).toBe(true);
    expect(isOpenAt(Date.parse("2026-11-03T23:00:00.000Z"), "America/New_York", canonical)).toBe(false);
    expect(zonedDateTimeToUtc({ year: 2026, month: 11, day: 3, hour: 9, minute: 0 }, "America/New_York"))
      .toBe(Date.parse("2026-11-03T14:00:00.000Z"));
  });
});

describe("nextOpeningLabel", () => {
  const at = (iso: string) => Date.parse(iso);

  it("says today when an opening is still ahead", () => {
    // Fri Oct 2 2026, 7 AM ET — today opens at 8 AM.
    expect(nextOpeningLabel(at("2026-10-02T11:00:00Z"), "America/New_York", canonical)).toBe("today at 8 AM");
  });

  it("skips a closed weekend and names the weekday", () => {
    // Fri 3 PM ET — today's 8 AM has passed; Saturday and Sunday are closed.
    expect(nextOpeningLabel(at("2026-10-02T19:00:00Z"), "America/New_York", canonical)).toBe("Monday at 8 AM");
    // Saturday itself → still Monday.
    expect(nextOpeningLabel(at("2026-10-03T14:00:00Z"), "America/New_York", canonical)).toBe("Monday at 8 AM");
  });

  it("includes minutes when the opening is not on the hour", () => {
    const hours = { Monday: "1:30 PM - 5:00 PM" };
    expect(nextOpeningLabel(at("2026-10-05T15:00:00Z"), "America/New_York", hours)).toBe("today at 1:30 PM");
  });

  it("returns null when nothing opens within 14 days", () => {
    expect(nextOpeningLabel(at("2026-10-05T15:00:00Z"), "America/New_York", { Monday: "Closed" })).toBeNull();
    expect(nextOpeningLabel(at("2026-10-05T15:00:00Z"), "America/New_York", null)).toBeNull();
  });

  it("walks local calendar days across the daylight-saving change (fall back)", () => {
    const sunday = { Sunday: "1:00 PM - 3:00 PM" };
    // Sat Oct 31 2026, 8 PM ET (EDT) → Sunday opens at 1 PM, which is EST after the 2 AM change.
    expect(nextOpeningLabel(at("2026-10-31T20:00:00Z"), "America/New_York", sunday)).toBe("tomorrow at 1 PM");
    // 11:30 PM Saturday local (already Sunday in UTC) must still resolve "tomorrow" as the local Sunday.
    expect(nextOpeningLabel(at("2026-11-01T03:30:00Z"), "America/New_York", sunday)).toBe("tomorrow at 1 PM");
  });
});
