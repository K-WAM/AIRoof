import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { ensureCallLead } from "./callLead";
import { escalateCall, createLead } from "@/lib/tools/agentTools";
import type { Firestore } from "firebase-admin/firestore";

const CALL = "call_elevenlabs_conv_9";
const lead = () => db.__peek("businesses/biz/leads", `lead_call_${CALL}`) as Record<string, unknown> | undefined;
const run = (classification: Parameters<typeof ensureCallLead>[1]["classification"], extra: { callerPhone?: string | null; summary?: string | null } = {}) =>
  ensureCallLead(db as unknown as Firestore, {
    businessId: "biz", callId: CALL, callerPhone: extra.callerPhone === undefined ? "+18254887791" : extra.callerPhone,
    summary: extra.summary === undefined ? "Caller reported a drip from the roof." : extra.summary, classification,
  });

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "biz", { businessName: "Roofdoctor", industry: "roofing" });
});

describe("ensureCallLead — the end-of-call safety net", () => {
  it("puts an escalated call with no lead into the Pipeline as an urgent, escalated lead with what the caller said", async () => {
    expect(await run({ outcome: "escalated", reason: "Active roof leak", callerName: "Kareem", address: "317 West Riverbend Drive" })).toBe("created");
    expect(lead()).toMatchObject({
      sourceCallId: CALL, status: "new", urgency: "urgent", escalated: true, escalationReason: "Active roof leak",
      callerName: "Kareem", callerPhone: "+18254887791", address: "317 West Riverbend Drive", notes: "Caller reported a drip from the roof.",
    });
  });

  it("a call the AI claimed to book with no saved appointment becomes a lead that says so", async () => {
    expect(await run({ outcome: "scheduled", reason: "Booked an inspection", service: "Cracked shingle repair" })).toBe("created");
    expect(lead()).toMatchObject({ urgency: "normal", serviceRequested: "Cracked shingle repair", notes: expect.stringContaining("no appointment was saved") });
  });

  it("does nothing when the call already produced an appointment, or produced nothing to act on", async () => {
    db.__seed("businesses/biz/appointments", "appt_1", { sourceCallId: CALL });
    expect(await run({ outcome: "scheduled", reason: "Booked" })).toBe("exists");
    expect(await run({ outcome: "no_action", reason: "Wrong number" })).toBe("skipped");
    expect(db.__list("businesses/biz/leads")).toHaveLength(0);
  });

  it("skips a caller it has no way to reach and no name for", async () => {
    expect(await run({ outcome: "lead_captured", reason: "Asked for a quote" }, { callerPhone: null })).toBe("skipped");
    expect(db.__list("businesses/biz/leads")).toHaveLength(0);
  });

  it("fills in the name and address on an escalation lead without overwriting what is there", async () => {
    db.__seed("businesses/biz/leads", `lead_call_${CALL}`, { leadId: `lead_call_${CALL}`, sourceCallId: CALL, urgency: "urgent", escalated: true, callerName: "", serviceRequested: "Leak", status: "new" });
    expect(await run({ outcome: "escalated", reason: "Leak", callerName: "Kareem", address: "317 West Riverbend Drive" })).toBe("enriched");
    expect(lead()).toMatchObject({ callerName: "Kareem", address: "317 West Riverbend Drive", serviceRequested: "Leak" });
  });
});

describe("escalateCall records a lead; createLead keeps one lead per call", () => {
  it("an escalation creates an urgent Pipeline lead even when the alert email cannot be sent", async () => {
    const out = await escalateCall({ businessId: "biz", callId: CALL, reason: "Water coming through the ceiling", callerPhone: "+18254887791", summary: "Active leak during rain." });
    expect(out.status).toBe("unconfigured"); // no notification email / comms in this test
    expect(lead()).toMatchObject({ urgency: "urgent", escalated: true, serviceRequested: "Water coming through the ceiling", sourceCallId: CALL, status: "new" });
  });

  it("the AI's own createLead on the same call merges into the escalation lead instead of adding a second one", async () => {
    await escalateCall({ businessId: "biz", callId: CALL, reason: "Leak", callerPhone: "+18254887791", summary: "Active leak." });
    await createLead({ businessId: "biz", callerName: "Kareem", callerPhone: "+18254887791", address: "317 West Riverbend Drive", urgency: "normal", notes: "Wants a tarp.", sourceCallId: CALL });
    expect(db.__list("businesses/biz/leads")).toHaveLength(1);
    expect(lead()).toMatchObject({ callerName: "Kareem", address: "317 West Riverbend Drive", urgency: "urgent", escalated: true, notes: "Active leak.\nWants a tarp." });
  });

  it("a lead that did not come from a call keeps its own id", async () => {
    const created = await createLead({ businessId: "biz", callerName: "Walk-in", urgency: "low" });
    expect(created.leadId).toMatch(/^lead_\d+$/);
  });
});
