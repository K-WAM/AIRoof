import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => allowed ? { uid: "staff" } : { error: new Response(null, { status: 403 }) },
  verifyFieldAccess: async () => ({ error: new Response(null, { status: 403 }) }),
}));
import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/jobs", {
  method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
});
beforeEach(() => { db = makeFakeDb(); allowed = true; db.__seed("businesses", "biz", { jobCounter: 999 }); });

describe("POST /api/jobs", () => {
  it("refuses before touching data when the role check fails", async () => {
    allowed = false;
    expect((await POST(request({ businessId: "biz", title: "Leak" }))).status).toBe(403);
    expect(db.__list("businesses/biz/jobs")).toHaveLength(0);
  });
  it("answers 400, not 500, to malformed input", async () => {
    expect((await POST(request("{not json"))).status).toBe(400);
    expect((await POST(request({ businessId: "biz", title: 42 }))).status).toBe(400);
    expect((await POST(request({ businessId: "biz", title: "   " }))).status).toBe(400);
    expect((await POST(request({ businessId: "biz", title: "Leak", appointmentId: "../x" }))).status).toBe(400);
  });
  it("trims and caps free text", async () => {
    const data = await (await POST(request({ businessId: "biz", title: "  Leak  ", notes: "x".repeat(10_000), clientPhone: 5 }))).json();
    expect(data.job.title).toBe("Leak");
    expect(data.job.notes).toHaveLength(4000);
    expect(data.job.clientPhone).toBeUndefined();
  });
  it("links a job made from a booking, and a second create opens the same job", async () => {
    db.__seed("businesses/biz/appointments", "a1", { callerName: "Ana" });
    const first = await POST(request({ businessId: "biz", title: "Roof inspection", appointmentId: "a1" }));
    expect(first.status).toBe(201);
    const { job } = await first.json();
    expect(db.__peek("businesses/biz/appointments", "a1")?.jobId).toBe(job.jobId);
    const again = await POST(request({ businessId: "biz", title: "Roof inspection", appointmentId: "a1" }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ created: false, job: { jobId: job.jobId } });
    expect(db.__list("businesses/biz/jobs")).toHaveLength(1);
  });
  it("links a typed client name to a customer on the server (no second browser call needed)", async () => {
    const res = await POST(request({ businessId: "biz", title: "Leak", clientName: "José Pérez", clientPhone: "+1 305 555 0101" }));
    const { job } = await res.json();
    await vi.waitFor(() => expect(db.__peek("businesses/biz/jobs", job.jobId)?.customerId).toBeTruthy());
    const customerId = db.__peek("businesses/biz/jobs", job.jobId)?.customerId as string;
    expect(db.__peek("businesses/biz/customers", customerId)).toMatchObject({ name: "José Pérez" });
    // The same person again is the same customer, not a duplicate.
    const again = await (await POST(request({ businessId: "biz", title: "Gutter", clientName: "jose perez", clientPhone: "305-555-0101" }))).json();
    await vi.waitFor(() => expect(db.__peek("businesses/biz/jobs", again.job.jobId)?.customerId).toBe(customerId));
  });
});
