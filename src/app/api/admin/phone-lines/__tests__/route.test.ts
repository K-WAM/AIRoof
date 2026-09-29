import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

// T-171 — the phone-line registry routes: a client line can never take a demo line or another tenant's number, goes live
// only after a test call that really landed on it, and a retire restores the routing it replaced without touching calls.

const mocks = vi.hoisted(() => ({ verifySuperadmin: vi.fn(), verifyAuthAndRole: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mocks.verifySuperadmin, verifyAuthAndRole: mocks.verifyAuthAndRole }));

let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

const US_DEMO = "+16892042643";
const CA_DEMO = "+17789079769";
const NEW_LINE = "+13055550123";

function seed() {
  db = makeFakeDb();
  db.__seed("businesses", "demo-roofing", { isDemo: true, elevenlabs: { agentId: "agent-demo", phoneNumber: US_DEMO, extraPhoneNumbers: [CA_DEMO] } });
  db.__seed("businesses", "acme", { businessName: "Acme Roofing", elevenlabs: { agentId: "agent-acme", phoneNumber: "+13055550100" } });
  db.__seed("businesses", "newco", { businessName: "NewCo", elevenlabs: { agentId: "agent-newco" } });
  db.__seed("businesses/newco/calls", "call-good", { callId: "call-good", calledNumber: NEW_LINE, startedAt: Date.now() + 1000 });
  db.__seed("businesses/newco/calls", "call-other-line", { callId: "call-other-line", calledNumber: "+13055550999", startedAt: Date.now() + 1000 });
  db.__seed("businesses/newco/calls", "call-no-number", { callId: "call-no-number", startedAt: Date.now() + 1000 });
  db.__seed("businesses/acme/calls", "call-acme", { callId: "call-acme", calledNumber: NEW_LINE, startedAt: Date.now() + 1000 });
}

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
}

async function create(businessId: string, phoneNumber: string) {
  const { POST } = await import("@/app/api/admin/phone-lines/route");
  return POST(req("POST", "/api/admin/phone-lines", { businessId, phoneNumber, acquisition: "new" }));
}

async function patch(lineId: string, body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/admin/phone-lines/[lineId]/route");
  return PATCH(req("PATCH", `/api/admin/phone-lines/${lineId}`, body), { params: Promise.resolve({ lineId }) });
}

const LINE_ID = `newco-${NEW_LINE.slice(1)}`;

beforeEach(() => {
  vi.resetModules();
  seed();
  mocks.verifySuperadmin.mockReset().mockResolvedValue({ user: { uid: "admin-1", email: "connect@luxordev.com", superadmin: true } });
  mocks.verifyAuthAndRole.mockReset();
});

describe("POST /api/admin/phone-lines", () => {
  it("is superadmin-only", async () => {
    mocks.verifySuperadmin.mockResolvedValue({ error: new Response("Forbidden", { status: 403 }) });
    expect((await create("newco", NEW_LINE)).status).toBe(403);
    expect(db.__list("businessPhoneNumbers")).toEqual([]);
  });

  it("refuses both demo lines, another tenant's number, and malformed numbers — writing nothing", async () => {
    expect((await create("newco", US_DEMO)).status).toBe(409);
    expect((await create("newco", CA_DEMO)).status).toBe(409);
    expect((await create("newco", "+13055550100")).status).toBe(409);
    expect((await create("newco", "12345")).status).toBe(400);
    expect(db.__list("businessPhoneNumbers")).toEqual([]);
  });

  it("creates a Draft client line with texting off and an audit event", async () => {
    const res = await create("newco", "(305) 555-0123");
    expect(res.status).toBe(201);
    const { line } = await res.json();
    expect(line).toMatchObject({ lineId: LINE_ID, e164: NEW_LINE, status: "draft", purpose: "client", country: "US", sms: { status: "not_configured" } });
    expect(db.__list("adminAuditEvents").map((event) => event.data.action)).toEqual(["phone_line.created"]);
    expect((await create("newco", NEW_LINE)).status).toBe(409);
    expect(db.__peek("businesses", "newco")?.elevenlabs).toEqual({ agentId: "agent-newco" });
  });
});

describe("PATCH /api/admin/phone-lines/[lineId] — lifecycle and cutover", () => {
  async function toConnected() {
    await create("newco", NEW_LINE);
    db.__seed("businessPhoneNumbers", LINE_ID, { ...db.__peek("businessPhoneNumbers", LINE_ID), connectedAt: 0 });
    expect((await patch(LINE_ID, { action: "mark_connected", provider: "elevenlabs" })).status).toBe(200);
    const stored = db.__peek("businessPhoneNumbers", LINE_ID);
    db.__seed("businessPhoneNumbers", LINE_ID, { ...stored, connectedAt: Date.now() - 60_000 });
  }

  it("go_live is refused before a passing test call", async () => {
    await toConnected();
    expect((await patch(LINE_ID, { action: "go_live", confirm: NEW_LINE, dryRun: false })).status).toBe(409);
    expect(db.__peek("businesses", "newco")?.elevenlabs).toEqual({ agentId: "agent-newco" });
  });

  it("a test call must be in THIS tenant, on THIS number, with a dialed-number record", async () => {
    await toConnected();
    expect((await patch(LINE_ID, { action: "record_test", callId: "call-acme" })).status).toBe(409); // other tenant
    expect((await patch(LINE_ID, { action: "record_test", callId: "call-other-line" })).status).toBe(409);
    expect((await patch(LINE_ID, { action: "record_test", callId: "call-no-number" })).status).toBe(409);
    expect((await patch(LINE_ID, { action: "record_test", callId: "call-good" })).status).toBe(200);
    expect(db.__peek("businessPhoneNumbers", LINE_ID)).toMatchObject({ status: "test_passed", lastTestCallId: "call-good" });
  });

  it("go_live is a dry run unless told otherwise, needs the typed number, then writes routing and keeps the old", async () => {
    await toConnected();
    await patch(LINE_ID, { action: "record_test", callId: "call-good" });

    expect((await patch(LINE_ID, { action: "go_live", confirm: "+10000000000" })).status).toBe(400);
    const dry = await (await patch(LINE_ID, { action: "go_live", confirm: NEW_LINE })).json();
    expect(dry).toMatchObject({ dryRun: true, routing: { before: { phoneNumber: null }, after: { phoneNumber: NEW_LINE } } });
    expect(db.__peek("businesses", "newco")?.elevenlabs).toEqual({ agentId: "agent-newco" });

    expect((await patch(LINE_ID, { action: "go_live", confirm: NEW_LINE, dryRun: false })).status).toBe(200);
    expect(db.__peek("businesses", "newco")?.elevenlabs).toMatchObject({ agentId: "agent-newco", phoneNumber: NEW_LINE });
    expect(db.__peek("businessPhoneNumbers", LINE_ID)).toMatchObject({ status: "live", active: true, previousRouting: { elevenlabsPhoneNumber: null } });
    // The demo tenant is untouched by a client cutover.
    expect(db.__peek("businesses", "demo-roofing")?.elevenlabs).toEqual({ agentId: "agent-demo", phoneNumber: US_DEMO, extraPhoneNumbers: [CA_DEMO] });
  });

  it("retire restores the routing and keeps every call record", async () => {
    await toConnected();
    await patch(LINE_ID, { action: "record_test", callId: "call-good" });
    await patch(LINE_ID, { action: "go_live", confirm: NEW_LINE, dryRun: false });
    const callsBefore = db.__list("businesses/newco/calls").length;

    expect((await patch(LINE_ID, { action: "retire", confirm: NEW_LINE })).status).toBe(200); // dry run
    expect(db.__peek("businesses", "newco")?.elevenlabs).toMatchObject({ phoneNumber: NEW_LINE });
    expect((await patch(LINE_ID, { action: "retire", confirm: NEW_LINE, dryRun: false })).status).toBe(200);
    expect(db.__peek("businesses", "newco")?.elevenlabs).toEqual({ agentId: "agent-newco", extraPhoneNumbers: [] });
    expect(db.__peek("businessPhoneNumbers", LINE_ID)).toMatchObject({ status: "retired", active: false });
    expect(db.__list("businesses/newco/calls")).toHaveLength(callsBefore);
  });

  it("a demo line cannot be retired from here", async () => {
    db.__seed("businessPhoneNumbers", "demo-us", { businessId: "demo-roofing", normalizedPhoneNumber: US_DEMO, purpose: "demo", status: "live", provider: "elevenlabs" });
    expect((await patch("demo-us", { action: "retire", confirm: US_DEMO, dryRun: false })).status).toBe(409);
    expect(db.__peek("businesses", "demo-roofing")?.elevenlabs).toMatchObject({ phoneNumber: US_DEMO });
  });

  it("texting becomes Ready only with the typed number, and a business keeps one default sender", async () => {
    await create("newco", NEW_LINE);
    db.__seed("businessPhoneNumbers", "newco-second", { businessId: "newco", normalizedPhoneNumber: "+13055550124", status: "live", sms: { status: "ready", purposes: [], isDefaultSender: true } });
    expect((await patch(LINE_ID, { action: "set_sms", sms: { status: "ready" } })).status).toBe(400);
    expect((await patch(LINE_ID, { action: "set_sms", sms: { status: "ready", isDefaultSender: true }, confirm: NEW_LINE })).status).toBe(200);
    expect(db.__peek("businessPhoneNumbers", LINE_ID)?.sms).toMatchObject({ status: "ready", isDefaultSender: true });
    expect(db.__peek("businessPhoneNumbers", "newco-second")?.sms).toMatchObject({ isDefaultSender: false });
  });
});

describe("GET /api/company/phone-lines", () => {
  it("returns only this tenant's non-retired lines, without provider details", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "owner", superadmin: false, role: "owner", businessId: "newco" } });
    db.__seed("businessPhoneNumbers", "n1", { businessId: "newco", normalizedPhoneNumber: NEW_LINE, status: "live", provider: "elevenlabs" });
    db.__seed("businessPhoneNumbers", "n2", { businessId: "newco", normalizedPhoneNumber: "+13055550124", status: "retired" });
    db.__seed("businessPhoneNumbers", "a1", { businessId: "acme", normalizedPhoneNumber: "+13055550100", status: "live" });
    const { GET } = await import("@/app/api/company/phone-lines/route");
    const res = await GET(req("GET", "/api/company/phone-lines?businessId=newco"));
    const { lines } = await res.json();
    expect(lines.map((line: { lineId: string }) => line.lineId)).toEqual(["n1"]);
    expect(lines[0]).not.toHaveProperty("provider");
    expect(res.headers.get("cache-control")).not.toMatch(/public|s-maxage/);
  });

  it("is refused for another tenant", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: new Response("Forbidden", { status: 403 }) });
    const { GET } = await import("@/app/api/company/phone-lines/route");
    expect((await GET(req("GET", "/api/company/phone-lines?businessId=acme"))).status).toBe(403);
  });
});
