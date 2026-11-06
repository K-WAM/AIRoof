import { describe, expect, it } from "vitest";
import { bookingWorkState, itemLook, itemStateWords, jobWorkState, UNCONFIRMED_STYLE, WORK_STATE_STYLE } from "../itemState";

const TZ = "America/New_York";
// Tue Nov 10 2026, 9:00 AM Eastern (14:00 UTC)
const TUE_9AM = Date.UTC(2026, 10, 10, 14, 0);
const HOUR = 3_600_000, DAY = 24 * HOUR;

describe("jobWorkState", () => {
  it("is complete once the job is complete, invoiced or paid", () => {
    expect(jobWorkState({ status: "complete", scheduledStart: TUE_9AM }, TUE_9AM, TZ)).toBe("complete");
    expect(jobWorkState({ status: "invoiced", scheduledStart: TUE_9AM }, TUE_9AM - DAY, TZ)).toBe("complete");
  });

  it("is scheduled before the visit while nothing has happened", () => {
    expect(jobWorkState({ status: "quoted", scheduledStart: TUE_9AM }, TUE_9AM - DAY, TZ)).toBe("scheduled");
    expect(jobWorkState({ status: "inspection", scheduledStart: TUE_9AM }, TUE_9AM, TZ)).toBe("scheduled");
  });

  it("is in progress when field notes arrive on or after the visit's day, even while the job still says quoted", () => {
    expect(jobWorkState({ status: "quoted", scheduledStart: TUE_9AM, lastFieldUpdate: { at: TUE_9AM + 2 * HOUR } }, TUE_9AM + 3 * HOUR, TZ)).toBe("in_progress");
    // Early-morning note before the scheduled hour, same business day.
    expect(jobWorkState({ status: "quoted", scheduledStart: TUE_9AM, lastFieldUpdate: { at: TUE_9AM - 2 * HOUR } }, TUE_9AM, TZ)).toBe("in_progress");
  });

  it("ignores notes from before the visit's day (the inspection) when deciding the work has started", () => {
    expect(jobWorkState({ status: "quoted", scheduledStart: TUE_9AM, lastFieldUpdate: { at: TUE_9AM - 3 * DAY } }, TUE_9AM - DAY, TZ)).toBe("scheduled");
  });

  it("treats an in-progress job as scheduled until its visit day, then in progress", () => {
    const job = { status: "in_progress" as const, scheduledStart: TUE_9AM, lastFieldUpdate: { at: TUE_9AM - 5 * DAY } };
    expect(jobWorkState(job, TUE_9AM - DAY, TZ)).toBe("scheduled");
    expect(jobWorkState(job, TUE_9AM - HOUR, TZ)).toBe("in_progress");
    expect(jobWorkState(job, TUE_9AM + 2 * DAY, TZ)).toBe("in_progress");
  });

  it("uses the business's day, not UTC's", () => {
    // 11:30 PM Eastern on Monday is already Tuesday in UTC: still the day before the Tuesday visit.
    const mondayLate = Date.UTC(2026, 10, 10, 4, 30);
    expect(jobWorkState({ status: "quoted", scheduledStart: TUE_9AM, lastFieldUpdate: { at: mondayLate } }, TUE_9AM, TZ)).toBe("scheduled");
  });
});

describe("bookingWorkState", () => {
  const appt = { status: "confirmed" as const, startTime: TUE_9AM };

  it("is scheduled with no linked job or nothing recorded", () => {
    expect(bookingWorkState(appt, undefined, TUE_9AM + DAY, TZ)).toBe("scheduled");
    expect(bookingWorkState(appt, { status: "inspection" }, TUE_9AM + DAY, TZ)).toBe("scheduled");
  });

  it("is complete when marked completed or the job has moved on to a quote", () => {
    expect(bookingWorkState({ ...appt, status: "completed" }, undefined, TUE_9AM, TZ)).toBe("complete");
    expect(bookingWorkState(appt, { status: "quoted" }, TUE_9AM, TZ)).toBe("complete");
    expect(bookingWorkState(appt, { status: "invoiced" }, TUE_9AM, TZ)).toBe("complete");
  });

  it("is in progress while the inspector records on the day, complete from the next day", () => {
    const linked = { status: "in_progress" as const, findings: [{ addedAt: TUE_9AM + HOUR }] };
    expect(bookingWorkState(appt, linked, TUE_9AM + 2 * HOUR, TZ)).toBe("in_progress");
    expect(bookingWorkState(appt, linked, TUE_9AM + DAY, TZ)).toBe("complete");
  });

  it("ignores findings recorded before the booking's day", () => {
    expect(bookingWorkState(appt, { status: "inspection", findings: [{ addedAt: TUE_9AM - 2 * DAY }] }, TUE_9AM + HOUR, TZ)).toBe("scheduled");
  });
});

describe("itemLook / itemStateWords", () => {
  it("keeps the grey dashed card for unconfirmed work that has not started", () => {
    expect(itemLook("scheduled", false)).toEqual({ ...UNCONFIRMED_STYLE, dashed: true });
    expect(itemStateWords("scheduled", false)).toBe("Not confirmed");
  });

  it("colours confirmed work by state, and started work even when unconfirmed (dashed)", () => {
    expect(itemLook("scheduled", true)).toEqual({ ...WORK_STATE_STYLE.scheduled, dashed: false });
    expect(itemLook("in_progress", false)).toEqual({ ...WORK_STATE_STYLE.in_progress, dashed: true });
    expect(itemStateWords("in_progress", false)).toBe("In progress · not confirmed");
    expect(itemStateWords("complete", true)).toBe("Complete");
  });
});
