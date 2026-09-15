import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
}));

let apptExists = true;
const updates: Array<Record<string, unknown>> = [];
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: apptExists }),
        update: async (data: Record<string, unknown>) => { updates.push(data); },
      }),
    }),
  }),
}));

import { PATCH } from "@/app/api/businesses/[businessId]/appointments/[appointmentId]/route";

function requestFor(body: unknown) {
  return new NextRequest("http://localhost/api/businesses/biz-1/appointments/appt-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/businesses/[businessId]/appointments/[appointmentId]", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    apptExists = true;
    updates.length = 0;
  });

  it("confirms an appointment once authorized", async () => {
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "confirmed" }), {
      params: Promise.resolve({ appointmentId: "appt-1" }),
    });

    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "confirmed" });
  });

  it("cancels an appointment once authorized", async () => {
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "cancelled" }), {
      params: Promise.resolve({ appointmentId: "appt-1" }),
    });

    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "cancelled" });
  });

  it("rejects an invalid status without touching Firestore", async () => {
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "bogus" }), {
      params: Promise.resolve({ appointmentId: "appt-1" }),
    });
    expect(response.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "confirmed" }), {
      params: Promise.resolve({ appointmentId: "appt-1" }),
    });
    expect(response.status).toBe(403);
  });

  it("404s when the appointment doesn't exist", async () => {
    apptExists = false;
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "confirmed" }), {
      params: Promise.resolve({ appointmentId: "missing" }),
    });
    expect(response.status).toBe(404);
  });
});
