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
  });
  return { db: { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }) }, docs };
}

const context = { params: Promise.resolve({ leadId: "lead" }) };
const requestFor = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/businesses/biz/leads/lead", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
let state: ReturnType<typeof makeDb>;

beforeEach(() => {
  state = makeDb();
  state.docs.set("businesses/biz", { businessName: "Roof Co", contactEmail: "hello@roof.example" });
  state.docs.set("businesses/biz/leads/lead", { callerName: "Mina", callerEmail: "mina@example.com" });
  mocks.firestore.mockReset().mockReturnValue(state.db);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("PATCH /api/businesses/[businessId]/leads/[leadId] decline", () => {
  it("rejects bad reasons and custom messages over 300 characters", async () => {
    expect((await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "No thanks" }), context)).status).toBe(400);
    expect((await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Other", customMessage: "x".repeat(301) }), context)).status).toBe(400);
  });

  it("returns 404 for a missing lead", async () => {
    const response = await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Fully booked" }), {
      params: Promise.resolve({ leadId: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("is idempotent and never sends a second decline", async () => {
    await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Fully booked" }), context);
    const response = await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ alreadyDeclined: true, notifiedCustomer: false });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("does not send when the lead has no caller email", async () => {
    state.docs.set("businesses/biz/leads/lead", {});
    const response = await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ ok: true, noEmail: true, notifiedCustomer: false });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("uses the tenant sender/reply-to and reports a failed delivery without throwing", async () => {
    mocks.send.mockResolvedValue({ status: "failed" });
    const response = await PATCH(requestFor({ businessId: "biz", status: "lost", declineReason: "Fully booked" }), context);
    expect(await response.json()).toMatchObject({ ok: true, notifiedCustomer: false });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "mina@example.com", fromName: "Roof Co", replyTo: "hello@roof.example",
    }));
  });
});
