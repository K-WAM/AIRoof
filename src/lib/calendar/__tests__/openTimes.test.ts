import { describe, expect, it } from "vitest";
import { openStartTimes } from "../openTimes";

const HOUR = 60 * 60 * 1000;
const open = 8 * HOUR;
const close = 17 * HOUR;
const window = { startTime: open, endTime: close };

describe("openStartTimes", () => {
  it("offers every half hour a job still fits before closing", () => {
    const starts = openStartTimes({ window, busy: [], durationMs: HOUR });
    expect(starts[0]).toBe(open);
    expect(starts.at(-1)).toBe(16 * HOUR); // 4:00–5:00 is the last hour that fits
    expect(starts).toHaveLength(17);
  });

  it("skips every start that would overlap a job already on the crew", () => {
    const starts = openStartTimes({ window, busy: [{ start: 9 * HOUR, end: 10 * HOUR }], durationMs: HOUR });
    expect(starts).toContain(8 * HOUR);
    expect(starts).not.toContain(8.5 * HOUR); // 8:30–9:30 overlaps 9–10
    expect(starts).not.toContain(9 * HOUR);
    expect(starts).not.toContain(9.5 * HOUR);
    expect(starts).toContain(10 * HOUR); // back-to-back is fine
  });

  it("lets a second job share the day when times differ (the owner's 2026-09-28 report)", () => {
    const starts = openStartTimes({ window, busy: [{ start: open, end: open + HOUR }], durationMs: HOUR });
    expect(starts[0]).toBe(9 * HOUR);
  });

  it("never offers a time that has already passed", () => {
    const starts = openStartTimes({ window, busy: [], durationMs: HOUR, notBefore: 12 * HOUR + 1 });
    expect(starts[0]).toBe(12.5 * HOUR);
  });

  it("returns nothing when the job is longer than the day or the input is bad", () => {
    expect(openStartTimes({ window, busy: [], durationMs: 10 * HOUR })).toEqual([]);
    expect(openStartTimes({ window, busy: [], durationMs: 0 })).toEqual([]);
    expect(openStartTimes({ window: { startTime: close, endTime: open }, busy: [], durationMs: HOUR })).toEqual([]);
  });
});
