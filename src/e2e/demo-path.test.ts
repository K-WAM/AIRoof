import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  db: undefined as FakeDb | undefined,
  actorBusinessId: "e2e-roofing",
  emails: [] as Array<Record<string, unknown>>,
  sendResult: "delivered" as "delivered" | "failed",
  parseFieldUpdate: vi.fn(), classifyCallOutcome: vi.fn(),
  findBusinessByElevenLabsPhoneNumber: vi.fn(), findBusinessByElevenLabsAgentId: vi.fn(),
  runLedgeredEmail: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db, verifyIdToken: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => {
  const gate = async (request: NextRequest, businessId: string) => {
    if (!request.headers.get("authorization")) return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
    if (mocks.actorBusinessId !== businessId) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    return { user: { uid: "e2e-owner" }, membership: { role: "owner" } };
  };
  return { verifyAuthAndRole: gate, verifyFieldAccess: gate };
});
vi.mock("@/lib/ai/deepseekClient", () => ({ parseFieldUpdate: mocks.parseFieldUpdate, classifyCallOutcome: mocks.classifyCallOutcome }));
vi.mock("@/lib/vapi/businessLookup", () => ({ findBusinessByElevenLabsPhoneNumber: mocks.findBusinessByElevenLabsPhoneNumber, findBusinessByElevenLabsAgentId: mocks.findBusinessByElevenLabsAgentId }));
vi.mock("@/lib/comms/send", async () => {
  const { extractInlineImages, htmlToText } = await vi.importActual<typeof import("@/lib/comms/prepare")>("@/lib/comms/prepare");
  return {
    isCommsConfigured: () => true,
    sendWithLedger: async () => "delivered",
    sendEmail: async (message: Record<string, unknown>) => {
      const prepared = extractInlineImages(String(message.html));
      mocks.emails.push({ ...message, html: prepared.html, text: htmlToText(prepared.html), attachments: prepared.attachments });
      return { status: mocks.sendResult };
    },
  };
});
vi.mock("@/lib/tools/agentTools", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tools/agentTools")>("@/lib/tools/agentTools");
  return { ...actual, runLedgeredEmail: mocks.runLedgeredEmail };
});

import { POST as initiate } from "@/app/api/webhooks/elevenlabs/initiation/route";
import { POST as tool } from "@/app/api/webhooks/elevenlabs/tools/[tool]/route";
import { POST as postCall } from "@/app/api/webhooks/elevenlabs/post-call/route";
import { GET as callsList } from "@/app/api/businesses/[businessId]/calls/route";
import { GET as appointmentsList } from "@/app/api/businesses/[businessId]/appointments/route";
import { PATCH as appointmentPatch } from "@/app/api/appointments/[appointmentId]/route";
import { POST as createJob } from "@/app/api/jobs/route";
import { POST as resolveCustomer } from "@/app/api/company/customers/resolve/route";
import { POST as fieldUpdate } from "@/app/api/jobs/[jobId]/updates/route";
import { GET as jobGet, PATCH as jobPatch } from "@/app/api/jobs/[jobId]/route";
import { POST as reportSend } from "@/app/api/jobs/[jobId]/report/send/route";
import { POST as quoteCreate, PATCH as quotePatch } from "@/app/api/jobs/[jobId]/quote/route";
import { POST as quoteSend } from "@/app/api/jobs/[jobId]/quote/send/route";
import { POST as invoiceCreate, PATCH as invoicePatch } from "@/app/api/jobs/[jobId]/invoice/route";
import { POST as invoiceSend } from "@/app/api/jobs/[jobId]/invoice/send/route";

const BUSINESS_ID = "e2e-roofing";
const EMAIL = "customer@example.test";
const auth = { authorization: "Bearer e2e" };
const json = (url: string, body: Record<string, unknown>, method = "POST") => new NextRequest(url, { method, headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body) });
const context = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

function signedPostCall(payload: Record<string, unknown>) {
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(payload);
  const digest = createHmac("sha256", "e2e-webhook-secret").update(`${timestamp}.${raw}`).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/elevenlabs/post-call", { method: "POST", headers: { "content-type": "application/json", "elevenlabs-signature": `t=${timestamp},v0=${digest}` }, body: raw });
}

describe("offline demo-path smoke test", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = makeFakeDb(); mocks.db = db; mocks.actorBusinessId = BUSINESS_ID; mocks.emails.length = 0; mocks.sendResult = "delivered";
    mocks.findBusinessByElevenLabsPhoneNumber.mockResolvedValue(BUSINESS_ID); mocks.findBusinessByElevenLabsAgentId.mockResolvedValue(BUSINESS_ID);
    mocks.classifyCallOutcome.mockResolvedValue({ outcome: "scheduled", reason: "Appointment requested" }); mocks.runLedgeredEmail.mockResolvedValue("delivered");
    mocks.parseFieldUpdate.mockResolvedValue({ transcriptEn: "Used 12 bundles of shingles, Carlos worked 8 hours, and found a cracked vent boot.", timeline: [{ description: "Roof repair completed" }], materials: [{ item: "shingles", quantity: 12, unit: "bundles" }], labor: [{ description: "Carlos roofing labor", hours: 8 }], issues: [{ description: "Cracked vent boot", severity: "medium" }], invoiceSuggestions: [] });
    db.__seed("businesses", BUSINESS_ID, { businessId: BUSINESS_ID, businessName: "E2E Roofing", industry: "roofing", brandColor: "#008c95", contactEmail: "office@e2e-roofing.test", contactPhone: "+15550100", notificationEmail: "notify@e2e-roofing.test", timezone: "America/New_York", serviceArea: "Miami", approvedServices: ["Roof repair"], approvedFaqs: [], emergencyRules: [], bookingRules: [], disallowedTopics: [], active: true, greeting: "Welcome to E2E Roofing.", businessHours: { Monday: "00:00 - 23:59", Tuesday: "00:00 - 23:59", Wednesday: "00:00 - 23:59", Thursday: "00:00 - 23:59", Friday: "00:00 - 23:59", Saturday: "00:00 - 23:59", Sunday: "00:00 - 23:59" } });
    db.__seed(`businesses/${BUSINESS_ID}/library`, "logos", { logos: [{ logoId: "logo-1", name: "E2E logo", b64: "iVBORw0KGgo=", mimeType: "image/png", variant: "color", isDefault: true, createdAt: 1 }] });
  });

  it("rejects a request with no session", async () => {
    expect((await jobGet(new NextRequest(`http://localhost/api/jobs/J-1000?businessId=${BUSINESS_ID}`), context("J-1000"))).status).toBe(401);
  });

  it("walks the demo story through real route handlers", async () => {
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "e2e-tool-secret"); vi.stubEnv("ELEVENLABS_WEBHOOK_SECRET", "e2e-webhook-secret");
    const future = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const initiation = await initiate(new NextRequest("http://localhost/api/webhooks/elevenlabs/initiation", { method: "POST", headers: { "content-type": "application/json", "x-luxor-tool-secret": "e2e-tool-secret" }, body: JSON.stringify({ caller_id: "+15550199", called_number: "+17542837658", agent_id: "agent-e2e", conversation_id: "conv-e2e" }) }));
    expect(initiation.status).toBe(200); expect(db.__peek("elevenlabsConversations", "conv-e2e")?.businessId).toBe(BUSINESS_ID);
    for (const [name, body] of [["checkAvailability", { service: "Roof repair" }], ["bookAppointment", { name: "Mina", email: EMAIL, service: "Roof repair", address: "12 Palm Ave", preferredTime: future }]] as const) {
      const response = await tool(new NextRequest(`http://localhost/api/webhooks/elevenlabs/tools/${name}`, { method: "POST", headers: { "content-type": "application/json", "x-luxor-tool-secret": "e2e-tool-secret", "x-luxor-conversation-id": "conv-e2e" }, body: JSON.stringify(body) }), { params: Promise.resolve({ tool: name }) });
      expect(response.status).toBe(200);
    }
    const appointment = db.__list(`businesses/${BUSINESS_ID}/appointments`)[0];
    expect(appointment.data).toMatchObject({ status: "requested", pendingConfirmation: true, callerName: "Mina", callerPhone: "+15550199", address: "12 Palm Ave", serviceType: "Roof repair" });
    const postCallResponse = await postCall(signedPostCall({ type: "post_call_transcription", event_timestamp: Math.floor(Date.now() / 1000), data: { agent_id: "agent-e2e", conversation_id: "conv-e2e", transcript: [{ role: "agent", message: "Welcome", time_in_call_secs: 0 }, { role: "user", message: "Please repair my roof", time_in_call_secs: 1 }], metadata: { start_time_unix_secs: Math.floor(Date.now() / 1000), call_duration_secs: 35 }, analysis: { transcript_summary: "Roof repair request" } } }));
    expect(postCallResponse.status).toBe(200); expect(db.__peek(`businesses/${BUSINESS_ID}/calls`, "call_elevenlabs_conv-e2e")).toMatchObject({ startedAt: expect.any(Number), outcome: "scheduled" });
    expect((await callsList(new NextRequest(`http://localhost/api/businesses/${BUSINESS_ID}/calls`, { headers: auth }), { params: Promise.resolve({ businessId: BUSINESS_ID }) })).status).toBe(200);
    expect((await appointmentsList(new NextRequest(`http://localhost/api/businesses/${BUSINESS_ID}/appointments`, { headers: auth }), { params: Promise.resolve({ businessId: BUSINESS_ID }) })).status).toBe(200);
    expect((await appointmentPatch(json(`http://localhost/api/appointments/${appointment.id}`, { businessId: BUSINESS_ID, confirm: true, notifyCustomer: true }, "PATCH"), { params: Promise.resolve({ appointmentId: appointment.id }) })).status).toBe(200);
    expect(db.__peek(`businesses/${BUSINESS_ID}/appointments`, appointment.id)).toMatchObject({ status: "confirmed", pendingConfirmation: false }); expect(mocks.runLedgeredEmail).toHaveBeenCalledOnce();
    db.__seed(`businesses/${BUSINESS_ID}/appointments`, "decline-e2e", { ...appointment.data, appointmentId: "decline-e2e", callerEmail: EMAIL });
    expect((await appointmentPatch(json("http://localhost/api/appointments/decline-e2e", { businessId: BUSINESS_ID, declineReason: "Fully booked" }, "PATCH"), { params: Promise.resolve({ appointmentId: "decline-e2e" }) })).status).toBe(200);
    expect((await appointmentPatch(json("http://localhost/api/appointments/decline-e2e", { businessId: BUSINESS_ID, declineReason: "Fully booked" }, "PATCH"), { params: Promise.resolve({ appointmentId: "decline-e2e" }) })).status).toBe(200);
    const jobResponse = await createJob(json("http://localhost/api/jobs", { businessId: BUSINESS_ID, title: "Roof repair", address: "12 Palm Ave", clientName: "Mina", clientPhone: "+15550199", appointmentId: appointment.id }));
    expect(jobResponse.status).toBe(201); const { job } = await jobResponse.json() as { job: { jobId: string } };
    expect(db.__peek(`businesses/${BUSINESS_ID}/jobs`, job.jobId)).toMatchObject({ clientName: "Mina", clientPhone: "+15550199", address: "12 Palm Ave" });
    const resolveBody = { businessId: BUSINESS_ID, jobId: job.jobId, name: "Mina", phone: "+15550199", email: EMAIL, address: "12 Palm Ave" };
    const firstCustomer = await resolveCustomer(json("http://localhost/api/company/customers/resolve", resolveBody));
    const secondCustomer = await resolveCustomer(json("http://localhost/api/company/customers/resolve", resolveBody));
    expect((await firstCustomer.json()).created).toBe(true);
    expect(await secondCustomer.json()).toMatchObject({ created: false, customerId: "C-1000" });
    expect(db.__list(`businesses/${BUSINESS_ID}/customers`)).toHaveLength(1);
    expect((await fieldUpdate(json(`http://localhost/api/jobs/${job.jobId}/updates`, { businessId: BUSINESS_ID, rawText: "Carlos usó 12 paquetes de tejas y encontró una bota de ventilación agrietada." }), context(job.jobId))).status).toBe(201);
    expect(db.__list(`businesses/${BUSINESS_ID}/jobs/${job.jobId}/updates`)[0].data).toMatchObject({ rawTextEn: expect.stringContaining("Used 12 bundles") });
    expect((await jobGet(new NextRequest(`http://localhost/api/jobs/${job.jobId}?businessId=${BUSINESS_ID}`, { headers: auth }), context(job.jobId))).status).toBe(200);
    await jobPatch(json(`http://localhost/api/jobs/${job.jobId}`, { businessId: BUSINESS_ID, reportNotes: "Cracked vent boot repaired.", reportOptions: { hideLabor: false, hideMaterials: false }, reportTechnicians: ["Carlos"] }, "PATCH"), context(job.jobId));
    expect((await reportSend(json(`http://localhost/api/jobs/${job.jobId}/report/send`, { businessId: BUSINESS_ID, to: EMAIL }), context(job.jobId))).status).toBe(200);
    const visibleReport = mocks.emails.at(-1)!;
    expect(String(visibleReport.html)).toContain("cid:");
    expect(String(visibleReport.html)).toContain("shingles");
    expect(String(visibleReport.html)).toContain("Carlos roofing labor");
    expect(String(visibleReport.html).toLowerCase()).not.toMatch(/\$|total|estimate/);
    await jobPatch(json(`http://localhost/api/jobs/${job.jobId}`, { businessId: BUSINESS_ID, reportOptions: { hideLabor: true, hideMaterials: true } }, "PATCH"), context(job.jobId));
    expect((await reportSend(json(`http://localhost/api/jobs/${job.jobId}/report/send`, { businessId: BUSINESS_ID, to: EMAIL }), context(job.jobId))).status).toBe(200);
    expect(String(mocks.emails.at(-1)!.html)).not.toContain("Carlos roofing labor");
    expect(String(mocks.emails.at(-1)!.html)).not.toContain("shingles");
    expect((await quoteCreate(json(`http://localhost/api/jobs/${job.jobId}/quote`, { businessId: BUSINESS_ID }), context(job.jobId))).status).toBe(201);
    expect((await quotePatch(json(`http://localhost/api/jobs/${job.jobId}/quote`, { businessId: BUSINESS_ID, hideLabor: true, hideMaterials: true, lines: [{ lineId: "labor-1", kind: "labor", description: "Carlos roofing labor", quantity: 8, unit: "hours", unitPrice: 75 }, { lineId: "material-1", kind: "material", description: "Shingles", quantity: 12, unit: "bundles", unitPrice: 30 }] }, "PATCH"), context(job.jobId))).status).toBe(200);
    expect((await quoteSend(json(`http://localhost/api/jobs/${job.jobId}/quote/send`, { businessId: BUSINESS_ID, to: EMAIL }), context(job.jobId))).status).toBe(200);
    expect((await invoiceCreate(json(`http://localhost/api/jobs/${job.jobId}/invoice`, { businessId: BUSINESS_ID }), context(job.jobId))).status).toBe(201);
    expect((await invoicePatch(json(`http://localhost/api/jobs/${job.jobId}/invoice`, { businessId: BUSINESS_ID, hideLabor: true, hideMaterials: true }, "PATCH"), context(job.jobId))).status).toBe(200);
    expect((await invoiceSend(json(`http://localhost/api/jobs/${job.jobId}/invoice/send`, { businessId: BUSINESS_ID, to: EMAIL }), context(job.jobId))).status).toBe(200);
    mocks.sendResult = "failed"; expect((await invoiceSend(json(`http://localhost/api/jobs/${job.jobId}/invoice/send`, { businessId: BUSINESS_ID, to: EMAIL }), context(job.jobId))).status).toBe(502);
    mocks.actorBusinessId = "other-business";
    for (const request of [() => jobGet(new NextRequest(`http://localhost/api/jobs/${job.jobId}?businessId=${BUSINESS_ID}`, { headers: auth }), context(job.jobId)), () => appointmentPatch(json(`http://localhost/api/appointments/${appointment.id}`, { businessId: BUSINESS_ID, confirm: true }, "PATCH"), { params: Promise.resolve({ appointmentId: appointment.id }) }), () => quoteCreate(json(`http://localhost/api/jobs/${job.jobId}/quote`, { businessId: BUSINESS_ID }), context(job.jobId)), () => invoiceCreate(json(`http://localhost/api/jobs/${job.jobId}/invoice`, { businessId: BUSINESS_ID }), context(job.jobId))]) expect((await request()).status).toBe(403);
    for (const email of mocks.emails) { expect(email).toMatchObject({ fromName: "E2E Roofing", replyTo: "office@e2e-roofing.test" }); expect(email.text).toBeTruthy(); expect(String(email.html)).not.toContain("data:image"); }
  });
});
