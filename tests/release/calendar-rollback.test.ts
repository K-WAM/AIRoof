import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "./support/fakeFirestore";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resend };
  },
}));

import { bookAppointment } from "@/lib/tools/agentTools";

const businessHours = {
  Monday: "09:00 - 17:00",
  Tuesday: "09:00 - 17:00",
  Wednesday: "09:00 - 17:00",
  Thursday: "09:00 - 17:00",
  Friday: "09:00 - 17:00",
  Saturday: "Closed",
  Sunday: "Closed",
};

describe("release boundary: calendar transaction rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves neither locks nor an appointment when the appointment write fails", async () => {
    const firestore = new FakeFirestore((path) =>
      path.includes("/appointments/"),
    );
    firestore.documents.set("businesses/biz-1", {
      businessName: "Example Services",
      timezone: "America/New_York",
      businessHours,
    });
    mocks.getAdminFirestore.mockReturnValue(firestore);
    const startTime = Date.parse("2030-07-23T14:00:00.000Z");

    await expect(
      bookAppointment({
        businessId: "biz-1",
        callerName: "Taylor",
        callerPhone: "+15555550123",
        startTime,
        endTime: startTime + 60 * 60 * 1000,
      }),
    ).rejects.toThrow("Injected transaction write failure");

    expect([...firestore.documents.keys()]).toEqual(["businesses/biz-1"]);
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
