import { describe, expect, it } from "vitest";
import { isNewRequest, missingRequestInformation } from "@/lib/pipeline/requestReview";

describe("missingRequestInformation", () => {
  it("reports every decision-critical field absent from a request", () => {
    expect(missingRequestInformation({})).toEqual(["phone", "address", "service"]);
  });
  it("uses the appointment service field and ignores present values", () => {
    expect(missingRequestInformation({ callerPhone: "555", address: "1 Main", serviceType: "Tour" })).toEqual([]);
  });
  it("identifies the request queue statuses", () => {
    expect(isNewRequest("new")).toBe(true);
    expect(isNewRequest("requested")).toBe(true);
    expect(isNewRequest("booked")).toBe(false);
  });
});
