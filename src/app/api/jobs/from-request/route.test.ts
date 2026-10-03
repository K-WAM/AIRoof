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
  it("keeps the booked time as a hint, never as the schedule (T-149)", async () => {
    db.__seed("businesses/biz/appointments", "a3", { callerName: "Bea", callerPhone: "+15557654321", address: "3 Main", startTime: 1_800_000_000_000, endTime: 1_800_003_600_000 });
    const data = await (await POST(request({ businessId: "biz", appointmentId: "a3" }))).json();
    expect(data.job).toMatchObject({ requestedStart: 1_800_000_000_000, requestedEnd: 1_800_003_600_000 });
    expect(data.job.scheduledStart).toBeUndefined();
    expect(data.job.assignedCrewId).toBeUndefined();
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
  it("opens a job the New Job form made for this booking before it was stamped (pre-2026-10-03 data)", async () => {
    db.__seed("businesses/biz/appointments", "a4", { callerName: "Old", callerPhone: "+15550001111", address: "4 Main" });
    db.__seed("businesses/biz/jobs", "J-1005", { jobId: "J-1005", appointmentId: "a4" });
    const response = await POST(request({ businessId: "biz", appointmentId: "a4" }));
    expect(response.status).toBe(200);
    expect((await response.json()).job.jobId).toBe("J-1005");
    expect(db.__peek("businesses/biz/appointments", "a4")?.jobId).toBe("J-1005");
    expect(db.__list("businesses/biz/jobs")).toHaveLength(1);
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
  it("gives one call's lead and booking one job (Carla, 2026-09-28)", async () => {
    db.__seed("businesses/biz/leads", "lead_call_c9", { callerName: "Carla", callerPhone: "+19548829586", sourceCallId: "c9", escalated: true });
    db.__seed("businesses/biz/appointments", "a9", { callerName: "Carla", callerPhone: "+19548829586", address: "22572 Long York St", sourceCallId: "c9" });
    const first = await (await POST(request({ businessId: "biz", appointmentId: "a9" }))).json();
    expect(first.created).toBe(true);
    expect(db.__peek("businesses/biz/leads", "lead_call_c9")?.jobId).toBe(first.job.jobId);
    const fromLead = await POST(request({ businessId: "biz", leadId: "lead_call_c9" }));
    expect(fromLead.status).toBe(200);
    expect((await fromLead.json()).job.jobId).toBe(first.job.jobId);
    expect(db.__list("businesses/biz/jobs")).toHaveLength(1);
  });
  it("reuses a job made before siblings were stamped", async () => {
    db.__seed("businesses/biz/leads", "lead_call_c8", { callerName: "Dee", sourceCallId: "c8" });
    db.__seed("businesses/biz/appointments", "a8", { callerName: "Dee", sourceCallId: "c8", jobId: "J-1042" });
    db.__seed("businesses/biz/jobs", "J-1042", { jobId: "J-1042", clientName: "Dee" });
    const data = await (await POST(request({ businessId: "biz", leadId: "lead_call_c8" }))).json();
    expect(data).toMatchObject({ created: false, job: { jobId: "J-1042" } });
    expect(db.__peek("businesses/biz/leads", "lead_call_c8")?.jobId).toBe("J-1042");
  });
  it("rejects invalid and missing requests", async () => {
    expect((await POST(request({ businessId: "biz" }))).status).toBe(400);
    expect((await POST(request({ businessId: "biz", appointmentId: "missing" }))).status).toBe(404);
    allowed = false; expect((await POST(request({ businessId: "biz", leadId: "x" }))).status).toBe(403);
  });
});
