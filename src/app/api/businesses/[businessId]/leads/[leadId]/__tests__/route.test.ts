import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
}));

let leadExists = true;
const updates: Array<Record<string, unknown>> = [];
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: leadExists }),
        update: async (data: Record<string, unknown>) => { updates.push(data); },
      }),
    }),
  }),
}));

import { PATCH } from "@/app/api/businesses/[businessId]/leads/[leadId]/route";

function requestFor(body: unknown) {
  return new NextRequest("http://localhost/api/businesses/biz-1/leads/lead-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/businesses/[businessId]/leads/[leadId]", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1" } });
    leadExists = true;
    updates.length = 0;
  });

  it("updates the lead's status once authorized", async () => {
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "contacted" }), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });

    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "contacted" });
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.anything(), "biz-1", ["owner", "staff", "superadmin"]);
  });

  it("rejects an invalid status without touching Firestore", async () => {
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "not-a-status" }), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("400s when businessId is missing", async () => {
    const response = await PATCH(requestFor({ status: "contacted" }), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("passes through an auth rejection", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "contacted" }), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("404s when the lead doesn't exist", async () => {
    leadExists = false;
    const response = await PATCH(requestFor({ businessId: "biz-1", status: "contacted" }), {
      params: Promise.resolve({ leadId: "missing" }),
    });
    expect(response.status).toBe(404);
  });
});
