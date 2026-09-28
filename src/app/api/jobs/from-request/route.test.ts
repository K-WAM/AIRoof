import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => allowed ? { uid: "staff" } : { error: new Response(null, { status: 403 }) } }));
import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/jobs/from-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { db = makeFakeDb(); allowed = true; db.__seed("businesses", "biz", { jobCounter: 999 }); });

describe("POST /api/jobs/from-request", () => {
  it("creates an appointment job with customer and call provenance", async () => {
    db.__seed("businesses/biz/appointments", "a1", { callerName: "Ana", callerPhone: "+15551234567", callerEmail: "ana@example.com", address: "1 Main", serviceType: "Roof inspection", notes: "Leak", sourceCallId: "c1" });
    db.__seed("businesses/biz/calls", "c1", { summary: "Caller reports leak" });
    const data = await (await POST(request({ businessId: "biz", appointmentId: "a1" }))).json();
    expect(data.job).toMatchObject({ clientEmail: "ana@example.com", notes: "Leak", sourceCallId: "c1", callSummary: "Caller reports leak", title: "Roof inspection — 1 Main" });
    expect(data.job.customerId).toBeTruthy();
    expect(db.__peek("businesses/biz/appointments", "a1")?.jobId).toBe(data.job.jobId);
  });
  it("tells the caller the request already had a job, and records it on the request", async () => {
    db.__seed("businesses/biz/appointments", "a2", { callerName: "Kareem", callerPhone: "+18254887791", address: "317 West Riverbend Drive" });
    db.__seed("businesses/biz/requestJobs", "appointment_a2", { jobId: "J-1016" });
    db.__seed("businesses/biz/jobs", "J-1016", { jobId: "J-1016", clientName: "Kareem" });
    const response = await POST(request({ businessId: "biz", appointmentId: "a2" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false, job: { jobId: "J-1016" } });
    expect(db.__peek("businesses/biz/appointments", "a2")?.jobId).toBe("J-1016");
  });
  it("is idempotent for concurrent and sequential taps", async () => {
    db.__seed("businesses/biz/leads", "l1", { callerName: "Lee", callerPhone: "+15550000000", address: "2 Main", serviceRequested: "Repair" });
    const responses = await Promise.all([POST(request({ businessId: "biz", leadId: "l1" })), POST(request({ businessId: "biz", leadId: "l1" }))]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(bodies.map((body) => body.job.jobId)).size).toBe(1);
    expect(db.__list("businesses/biz/jobs")).toHaveLength(1);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect((await POST(request({ businessId: "biz", leadId: "l1" }))).status).toBe(200);
    expect(db.__peek("businesses", "biz")?.jobCounter).toBe(1000);
  });
  it("rejects invalid and missing requests", async () => {
    expect((await POST(request({ businessId: "biz" }))).status).toBe(400);
    expect((await POST(request({ businessId: "biz", appointmentId: "missing" }))).status).toBe(404);
    allowed = false; expect((await POST(request({ businessId: "biz", leadId: "x" }))).status).toBe(403);
  });
});
