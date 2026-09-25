import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/comms/send", () => ({ isCommsConfigured: () => true, sendEmail: mocks.send }));

import { GET, POST, PATCH } from "./route";
import { POST as SEND } from "./send/route";

function makeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)!,
    get: async () => ({ id: path.split("/").at(-1), exists: docs.has(path), data: () => docs.get(path) }),
    update: async (patch: Record<string, unknown>) => { docs.set(path, { ...docs.get(path), ...patch }); },
  });
  const db = {
    collection: (path: string) => ({ doc: (id: string) => ref(`${path}/${id}`) }),
    runTransaction: async (fn: (tx: { get: (r: ReturnType<typeof ref>) => ReturnType<ReturnType<typeof ref>["get"]>; update: (r: ReturnType<typeof ref>, patch: Record<string, unknown>) => void }) => Promise<unknown>) => {
      const writes: Array<() => Promise<void>> = [];
      const result = await fn({ get: (r) => r.get(), update: (r, patch) => { writes.push(() => r.update(patch)); } });
      for (const write of writes) await write();
      return result;
    },
    batch: () => { const writes: Array<() => Promise<void>> = []; return {
      set: (r: ReturnType<typeof ref>, data: Record<string, unknown>) => { writes.push(async () => { docs.set(r.path, data); }); },
      update: (r: ReturnType<typeof ref>, patch: Record<string, unknown>) => { writes.push(() => r.update(patch)); },
      commit: async () => { for (const write of writes) await write(); },
    }; },
  };
  docs.set("businesses/b", { industry: "roofing", businessName: "Roof Co" });
  docs.set("businesses/b/jobs/j", { jobId: "j", businessId: "b", title: "Repair", status: "inspection",
    clientName: "Client", clientEmail: "client@example.com", findings: [{ findingId: "f", category: "Leaks",
      problem: "Leak", solution: "Repair", includeInReport: true, includeInQuote: true, addedAt: 1,
      lines: [{ kind: "labor", description: "Repair", quantity: 2, unitPrice: 50 }] }] });
  return { db, docs };
}
const context = { params: Promise.resolve({ jobId: "j" }) };
const bodyReq = (path: string, body: Record<string, unknown>, method = "POST") => new NextRequest(`http://localhost/api/jobs/j/${path}`, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
let state: ReturnType<typeof makeDb>;
beforeEach(() => {
  state = makeDb();
  mocks.firestore.mockReset().mockReturnValue(state.db);
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  mocks.send.mockReset().mockResolvedValue({ status: "delivered" });
});

describe("job quote routes", () => {
  it("requires businessId and rejects unauthenticated reads before Firestore", async () => {
    expect((await GET(new NextRequest("http://localhost/api/jobs/j/quote"), context)).status).toBe(400);
    mocks.verify.mockResolvedValue({ error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) });
    expect((await GET(new NextRequest("http://localhost/api/jobs/j/quote?businessId=b"), context)).status).toBe(401);
    expect(mocks.firestore).not.toHaveBeenCalled();
  });
  it("rejects unauthorized creation and invalid draft lines", async () => {
    mocks.verify.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(bodyReq("quote", { businessId: "b" }), context)).status).toBe(403);
    expect(state.docs.get("businesses/b")?.quoteCounter).toBeUndefined();
    expect((await POST(bodyReq("quote", { businessId: "b" }), context)).status).toBe(201);
    const res = await PATCH(bodyReq("quote", { businessId: "b", lines: [{ lineId: "x", kind: "other", description: "<script>", quantity: 1, unitPrice: 1 }] }, "PATCH"), context);
    expect(res.status).toBe(400);
  });
  it("allocates a separate Q counter, creates once, and sends with a manual status transition", async () => {
    const first = await POST(bodyReq("quote", { businessId: "b" }), context);
    expect((await first.json()).quote.quoteId).toBe("Q-1000");
    expect(state.docs.get("businesses/b")?.quoteCounter).toBe(1000);
    expect(state.docs.get("businesses/b")?.invoiceCounter).toBeUndefined();
    expect((await POST(bodyReq("quote", { businessId: "b" }), context)).status).toBe(200);
    expect(state.docs.get("businesses/b")?.quoteCounter).toBe(1000);
    expect((await PATCH(bodyReq("quote", { businessId: "b", status: "accepted" }, "PATCH"), context)).status).toBe(409);
    expect((await SEND(bodyReq("quote/send", { businessId: "b", to: "client@example.com" }), context)).status).toBe(200);
    expect(state.docs.get("businesses/b/jobs/j")?.status).toBe("quoted");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect((await PATCH(bodyReq("quote", { businessId: "b", status: "accepted" }, "PATCH"), context)).status).toBe(200);
    expect(state.docs.get("businesses/b/quotes/Q-1000")?.status).toBe("accepted");
  });
  it("blocks unauthorized sending and never downgrades a job already in progress", async () => {
    await POST(bodyReq("quote", { businessId: "b" }), context);
    mocks.verify.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await SEND(bodyReq("quote/send", { businessId: "b", to: "client@example.com" }), context)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
    state.docs.set("businesses/b/jobs/j", { ...state.docs.get("businesses/b/jobs/j"), status: "in_progress" });
    expect((await SEND(bodyReq("quote/send", { businessId: "b", to: "client@example.com" }), context)).status).toBe(200);
    expect(state.docs.get("businesses/b/jobs/j")?.status).toBe("in_progress");
  });
});
