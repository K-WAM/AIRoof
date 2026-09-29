import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const sent = vi.hoisted(() => [] as Array<{ to: string; entityId: string; subject: string; html: string }>);
let db = makeFakeDb();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/tools/agentTools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/agentTools")>();
  return {
    ...actual,
    runLedgeredEmail: vi.fn(async (options: { to: string; entityId: string; subject: string; html: string }) => {
      sent.push(options);
      return "delivered";
    }),
  };
});
import { notifyInspector } from "./inspectorNotify";

const START = Date.parse("2026-10-05T12:00:00Z"); // Mon 8:00 AM ET
const APPT = {
  appointmentId: "appt1",
  startTime: START,
  endTime: START + 3_600_000,
  address: "12 Palm Ave",
  callerName: "Carla",
  callerPhone: "3055550111",
  notes: "Gate at the side\nAccess: gate 1010\nURGENT: active leak",
};

function fake() {
  return db as unknown as Firestore;
}

beforeEach(() => {
  db = makeFakeDb();
  sent.length = 0;
  db.__seed("businesses", "biz", { businessName: "Apex Roofing", timezone: "America/New_York", smsEnabled: true });
  db.__seed("businesses/biz/crews", "c1", { name: "Dominic", kind: "inspector", email: "dom@apex.test", phone: "+13055550111", active: true });
  db.__seed("businessUsers", "u1", { businessId: "biz", crewId: "c1", role: "staff", email: "helper@apex.test", displayName: "Helper", active: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("notifyInspector", () => {
  it("emails the crew and each member with a change-scoped ledger key", async () => {
    expect(await notifyInspector({ db: fake(), businessId: "biz", appointment: APPT, change: "assigned", crewId: "c1" }))
      .toEqual({ emailed: 2, texted: 0 });
    expect(sent.map((email) => email.to)).toEqual(["dom@apex.test", "helper@apex.test"]);
    expect(sent.map((email) => email.entityId)).toEqual([`appt1:assigned:${START}:c1`, `appt1:assigned:${START}:u1`]);
    expect(sent[0].subject).toContain("New inspection");
    expect(sent[0].html).toContain("12 Palm Ave");
    expect(sent[0].html).toContain("Access: gate 1010");
    expect(sent[0].html).toContain("URGENT: active leak");
  });

  it("maps reassigned_away to the reassigned email", async () => {
    expect((await notifyInspector({ db: fake(), businessId: "biz", appointment: APPT, change: "reassigned_away", crewId: "c1" })).emailed).toBe(2);
    expect(sent[0].subject).toContain("Inspection reassigned");
  });

  it("texts the crew row's phone when texting is on", async () => {
    vi.stubEnv("SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest00000000000000000000000000");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+13055550999");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM1" }) });
    vi.stubGlobal("fetch", fetchMock);
    // T-169: a staff notice has no dialed line, so it comes from the business's default sender — only once that line's
    // texting is Ready. The env TWILIO_PHONE_NUMBER above is never used.
    expect(await notifyInspector({ db: fake(), businessId: "biz", appointment: APPT, change: "assigned", crewId: "c1" }))
      .toEqual({ emailed: 2, texted: 0 });
    expect(fetchMock).not.toHaveBeenCalled();

    db.__seed("businessPhoneNumbers", "biz-main", {
      businessId: "biz", normalizedPhoneNumber: "+13055550100", status: "live",
      sms: { status: "ready", purposes: ["inspector_assigned"], isDefaultSender: true },
    });
    expect(await notifyInspector({ db: fake(), businessId: "biz", appointment: { ...APPT, appointmentId: "appt2" }, change: "assigned", crewId: "c1" }))
      .toEqual({ emailed: 2, texted: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URLSearchParams((fetchMock.mock.calls[0] as [string, { body: string }])[1].body).get("From")).toBe("+13055550100");
    expect(db.__list("_e2eOutbox")).toHaveLength(0);
  });

  it("does not text for a cancellation", async () => {
    vi.stubEnv("SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest00000000000000000000000000");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+13055550999");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM1" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyInspector({ db: fake(), businessId: "biz", appointment: APPT, change: "cancelled", crewId: "c1" }))
      .toEqual({ emailed: 2, texted: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws — logs and returns zero counts", async () => {
    const failing = { collection: () => { throw new Error("boom"); } } as unknown as Firestore;
    expect(await notifyInspector({ db: failing, businessId: "biz", appointment: APPT, change: "assigned", crewId: "c1" }))
      .toEqual({ emailed: 0, texted: 0 });
  });
});
