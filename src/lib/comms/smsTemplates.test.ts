import { describe, expect, it } from "vitest";
import { SMS_MAX_LENGTH, bookingConfirmed, bookingReceived, inspectorAssigned } from "./smsTemplates";

describe("smsTemplates", () => {
  it("builds the booking-received body", () => {
    expect(bookingReceived({
      firstName: "Carla", businessName: "Apex Roofing", when: "Monday at 8 AM", street: "12 Palm Ave",
    })).toBe("Hi Carla, Apex Roofing here. You're down for Monday at 8 AM at 12 Palm Ave. We'll text to confirm. Reply STOP to opt out.");
  });

  it("builds the booking-confirmed body", () => {
    expect(bookingConfirmed({
      service: "Roof inspection", when: "Monday at 8 AM", street: "12 Palm Ave",
      businessName: "Apex Roofing", businessPhone: "(305) 555-0111",
    })).toBe("Confirmed: Roof inspection Monday at 8 AM at 12 Palm Ave. Questions? Call (305) 555-0111. \u2013 Apex Roofing");
  });

  it("builds the inspector-assigned body", () => {
    expect(inspectorAssigned({ when: "Monday at 8 AM", street: "12 Palm Ave", customerName: "Carla" }))
      .toBe("New inspection: Monday at 8 AM, 12 Palm Ave (Carla). Details in your email.");
  });

  it("keeps every body within one SMS segment", () => {
    const bodies = [
      bookingReceived({ firstName: "x".repeat(60), businessName: "y".repeat(60), when: "z".repeat(60), street: "w".repeat(60) }),
      bookingConfirmed({ service: "x".repeat(60), when: "y".repeat(60), street: "z".repeat(60), businessName: "w".repeat(60), businessPhone: "p".repeat(60) }),
      inspectorAssigned({ when: "x".repeat(60), street: "y".repeat(60), customerName: "z".repeat(60) }),
    ];
    for (const body of bodies) expect(body.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
  });
});
