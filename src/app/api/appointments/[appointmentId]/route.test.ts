import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.send }));

import { PATCH } from "./route";

function makeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    update: async (patch: Record<string, unknown>) => docs.set(path, { ...docs.get(path), ...patch }),
    delete: async () => { docs.delete(path); },
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
  });
  return { db: {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T,>(fn: (tx: {
      get: (reference: ReturnType<typeof ref>) => ReturnType<ReturnType<typeof ref>["get"]>;
      update: (reference: ReturnType<typeof ref>, data: Record<string, unknown>) => void;
      delete: (reference: ReturnType<typeof ref>) => void;
    }) => Promise<T>) => {
      const writes: Array<() => Promise<unknown>> = [];
      const result = await fn({
        get: (reference) => reference.get(),
        update: (reference, data) => { writes.push(() => reference.update(data)); },
        delete: (reference) => { writes.push(() => reference.delete()); },
      });
      for (const write of writes) await write();
      return result;
    },
  }, docs };
}

const context = { params: Promise.resolve({ appointmentId: "appt" }) };
const requestFor = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/appointments/appt", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
let state: ReturnType<typeof makeDb>;

beforeEach(() => {
  state = makeDb();
  state.docs.set("businesses/biz", { businessName: "Roof Co", contactEmail: "hello@roof.example" });
  state.docs.set("businesses/biz/appointments/appt", { callerName: "Mina", callerEmail: "mina@example.com" });
  mocks.firestore.mockReset().mockReturnValue(state.db);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("PATCH /api/appointments/[appointmentId] decline", () => {
  it("rejects an invalid reason and overlong custom message", async () => {
    expect((await PATCH(requestFor({ businessId: "biz", declineReason: "No thanks" }), context)).status).toBe(400);
    expect((await PATCH(requestFor({ businessId: "biz", declineReason: "Other", customMessage: "x".repeat(301) }), context)).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing appointment", async () => {
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), {
      params: Promise.resolve({ appointmentId: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("is idempotent and does not send a second decline", async () => {
    expect((await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context)).status).toBe(200);
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ alreadyDeclined: true, notifiedCustomer: false });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("declines without sending when no caller email is available", async () => {
    state.docs.set("businesses/biz/appointments/appt", {});
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ ok: true, noEmail: true, notifiedCustomer: false });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("uses tenant sender and reply-to details, and reports a delivery failure", async () => {
    mocks.send.mockResolvedValue({ status: "failed" });
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ ok: true, notifiedCustomer: false });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "mina@example.com", fromName: "Roof Co", replyTo: "hello@roof.example",
    }));
  });

  it("deletes only the declined appointment's scheduling locks", async () => {
    const startTime = Date.parse("2030-07-23T14:00:00.000Z");
    state.docs.set("businesses/biz/appointments/appt", { startTime, endTime: startTime + 3600000 });
    for (let bucket = startTime; bucket < startTime + 3600000; bucket += 900000) {
      state.docs.set(`businesses/biz/schedulingLocks/unassigned:${bucket}`, { entityId: "appt" });
    }
    const response = await PATCH(requestFor({ businessId: "biz", declineReason: "Fully booked" }), context);
    expect(response.status).toBe(200);
    expect([...state.docs.keys()].filter((key) => key.includes("schedulingLocks"))).toHaveLength(0);
  });
});
