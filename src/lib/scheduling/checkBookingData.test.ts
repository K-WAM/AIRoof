import { describe, expect, it } from "vitest";
import {
  formatLocalTime,
  formatScheduleRow,
  sortScheduleRows,
  timestampMillis,
} from "../../../scripts/check-booking-data-helpers.mjs";

describe("check-booking-data formatting", () => {
  it("normalizes Firestore-like timestamps without exposing their internals", () => {
    expect(timestampMillis({ toMillis: () => 1_700_000_000_000 })).toBe(1_700_000_000_000);
    expect(timestampMillis("not a timestamp")).toBeNull();
  });

  it("formats schedule rows in the business timezone", () => {
    const startTime = Date.parse("2026-09-28T12:00:00.000Z");
    expect(formatLocalTime(startTime, "America/New_York")).toContain("8:00 AM");
    expect(formatScheduleRow({ kind: "appointment", id: "appt-1", startTime, status: "requested", source: "call" }, "America/New_York"))
      .toContain("appointment appt-1 | Mon, Sep 28, 8:00 AM EDT | status=requested | source=call");
  });

  it("sorts all diagnostic rows chronologically", () => {
    const rows = sortScheduleRows([
      { kind: "job", id: "later", startTime: 20 },
      { kind: "lock", id: "first", startTime: 10 },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["first", "later"]);
  });
});
