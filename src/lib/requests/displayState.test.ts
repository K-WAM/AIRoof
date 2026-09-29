import { describe, expect, it } from "vitest";
import { displayRequestState } from "./displayState";

const now = 1_000_000;
describe("displayRequestState", () => {
  it.each([
    [{ status: "new" }, "Request", "Review request"],
    [{ outcome: "lead_captured" }, "Request", "Review request"],
    [{ outcome: "escalated" }, "Request", "Review request"],
    [{ status: "requested", startTime: now + 1000 }, "Booking", "Confirm booking"],
    [{ status: "booked", pendingConfirmation: true }, "Booking", "Confirm booking"],
    [{ status: "confirmed", startTime: now + 1000 }, "Confirmed", "Assign or create job"],
    [{ status: "declined" }, "Declined", "Review details"],
    [{ status: "cancelled" }, "Declined", "Review details"],
    [{ status: "lost" }, "Declined", "Review details"],
    [{ status: "requested", confirmationFailed: true }, "Confirmation failed", "Retry confirmation"],
    [{ status: "requested", startTime: now - 1000 }, "Past booking", "Call back to agree a new time"],
    [{ status: "confirmed", jobId: "J-1" }, "Job created", "Open job"],
    [{ status: "contacted" }, "Callback", "Review request"],
    [{}, "Callback", "Call back"],
  ] as const)("maps %j to %s", (input, label, nextAction) => {
    expect(displayRequestState(input, now)).toMatchObject({ label, nextAction });
  });
  it("explains an after-hours booking without calling it confirmed", () => {
    expect(displayRequestState({ status: "requested", bookedAfterHours: true }, now).whatHappened).toContain("outside business hours");
  });
});
