import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => (mocks.allowed ? { user: { uid: "u", role: "staff" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }),
}));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { GET } from "@/app/api/businesses/[businessId]/appointments/route";

const call = async (query = "") => {
  const res = await GET(new NextRequest(`http://localhost/api/businesses/biz/appointments${query}`), { params: Promise.resolve({ businessId: "biz" }) });
  return { status: res.status, body: (await res.json()) as { appointments?: Array<{ appointmentId: string; startTime: number }> } };
};

beforeEach(() => {
  db = makeFakeDb();
  mocks.allowed = true;
  for (const [id, startTime] of [["a", 3000], ["b", 1000], ["c", 2000], ["d", 5000]] as const) {
    db.__seed("businesses/biz/appointments", id, { startTime, status: "confirmed", callerName: id });
  }
});

describe("GET /api/businesses/[businessId]/appointments", () => {
  // REGRESSION (found in the owner's live demo, 2026-09-25): with no from/to the route treated Number(null) === 0 as a
  // real range and searched only startTime 0..0, so the Pipeline, Dashboard and search bar saw ZERO appointments.
  it("with no query at all returns every appointment, soonest first — the Pipeline's exact call", async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.appointments!.map((a) => a.appointmentId)).toEqual(["b", "c", "a", "d"]);
  });

  it("honours limit/order, the Dashboard's and the search bar's calls", async () => {
    expect((await call("?limit=2&order=asc")).body.appointments!.map((a) => a.appointmentId)).toEqual(["b", "c"]);
    expect((await call("?order=desc")).body.appointments!.map((a) => a.appointmentId)).toEqual(["d", "a", "c", "b"]);
  });

  it("returns only the window for a real from/to range — the Calendar's call", async () => {
    expect((await call("?from=1500&to=3500")).body.appointments!.map((a) => a.appointmentId)).toEqual(["c", "a"]);
    expect((await call("?from=0&to=1000")).body.appointments!.map((a) => a.appointmentId)).toEqual(["b"]); // 0 is a legitimate bound
  });

  it("a half-specified or blank range is not a range (it must not silently return nothing)", async () => {
    expect((await call("?from=1500")).body.appointments).toHaveLength(4);
    expect((await call("?to=3500")).body.appointments).toHaveLength(4);
    expect((await call("?from=&to=")).body.appointments).toHaveLength(4);
    expect((await call("?from=abc&to=def")).body.appointments).toHaveLength(4);
  });

  it("refuses an unauthorised caller", async () => {
    mocks.allowed = false;
    expect((await call()).status).toBe(403);
  });
});
