import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
import { isSmsEnabled, sendSms } from "./sms";

const SID = "ACtest00000000000000000000000000";
const TOKEN = "secret-token";
const MSG = { businessId: "biz", to: "(305) 555-0111", body: "Hi", messageType: "inspector-assigned", entityId: "appt-1:assigned:100", purpose: "inspector_assigned" as const };
const OP_ID = `sms:${encodeURIComponent("inspector-assigned")}:${encodeURIComponent("appt-1:assigned:100")}`;

const READY = (isDefaultSender = false) => ({ status: "ready", purposes: ["booking_received", "appointment_confirmed", "inspector_assigned"], isDefaultSender });
const US_DEMO = "+16892042643";
const CA_DEMO = "+17789079769";

function seed(business: Record<string, unknown> = {}) {
  // smsFromNumber is deprecated and must be ignored (T-169) — it stays here to prove that.
  db.__seed("businesses", "biz", { businessName: "Apex", smsEnabled: true, smsFromNumber: "+13055550777", ...business });
  db.__seed("businessPhoneNumbers", "biz-main", { businessId: "biz", normalizedPhoneNumber: "+13055550111", status: "live", sms: READY(true) });
}

beforeEach(() => {
  db = makeFakeDb();
  vi.stubEnv("SMS_ENABLED", "true");
  vi.stubEnv("TWILIO_ACCOUNT_SID", SID);
  vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
  vi.stubEnv("TWILIO_PHONE_NUMBER", "+13055550999");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isSmsEnabled", () => {
  it("requires the env flag, Twilio creds and the tenant opt-in", () => {
    expect(isSmsEnabled({ smsEnabled: true })).toBe(true);
    expect(isSmsEnabled({})).toBe(true);
    expect(isSmsEnabled({ smsEnabled: false })).toBe(false);
    vi.stubEnv("SMS_ENABLED", "false");
    expect(isSmsEnabled({})).toBe(false);
    vi.stubEnv("SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(isSmsEnabled({})).toBe(false);
  });
});

describe("sendSms", () => {
  it("posts to Twilio with Basic auth, shapes E.164 and records the operation", async () => {
    seed();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM123" }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendSms(MSG)).toBe("delivered");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`);
    expect(init.body).toContain("To=%2B13055550111");
    expect(init.body).toContain("From=%2B13055550111"); // the default sender line, not smsFromNumber or the env
    expect(init.body).toContain("Body=Hi");
    expect(db.__peek("businesses/biz/operations", OP_ID)?.state).toBe("succeeded");
  });

  it("never sends twice for the same operation", async () => {
    seed();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM123" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms(MSG)).toBe("delivered");
    expect(await sendSms(MSG)).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks a Twilio 4xx as a terminal failure", async () => {
    seed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    expect(await sendSms(MSG)).toBe("failed");
    expect(db.__peek("businesses/biz/operations", OP_ID)?.state).toBe("failed");
  });

  it("aborts a hanging request after 10 seconds", async () => {
    seed();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))));
    const promise = sendSms(MSG);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBe("failed");
  });

  it("returns unconfigured when texting is off and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SMS_ENABLED", "false");
    seed();
    expect(await sendSms(MSG)).toBe("unconfigured");
    vi.stubEnv("SMS_ENABLED", "true");
    seed({ smsEnabled: false });
    expect(await sendSms(MSG)).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an invalid recipient without calling Twilio", async () => {
    seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms({ ...MSG, to: "12" })).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes to the harness outbox and never calls Twilio", async () => {
    vi.stubEnv("E2E_HARNESS", "1");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms({ ...MSG, to: "3055550111" })).toBe("delivered");
    expect(fetchMock).not.toHaveBeenCalled();
    const outbox = db.__list("_e2eOutbox");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].data).toMatchObject({ channel: "sms", to: "+13055550111", from: "+13055550111", body: "Hi" });
  });
});

// T-169 — the text comes from the line the caller dialed, never from their area code, another line or an env default.
describe("sendSms — sender is the dialed line", () => {
  function seedDemoLines(caSms: Record<string, unknown> = READY()) {
    seed();
    db.__seed("businessPhoneNumbers", "biz-us", { businessId: "biz", normalizedPhoneNumber: US_DEMO, status: "live", sms: READY() });
    db.__seed("businessPhoneNumbers", "biz-ca", { businessId: "biz", normalizedPhoneNumber: CA_DEMO, status: "live", sms: caSms });
  }
  const booking = (to: string, calledNumber: string | null) => ({
    businessId: "biz", to, body: "Booked", messageType: "booking-received", entityId: `appt-${to}-${calledNumber}`, purpose: "booking_received" as const, calledNumber,
  });
  function fromOf(fetchMock: ReturnType<typeof vi.fn>): string {
    const [, init] = fetchMock.mock.calls.at(-1) as [string, { body: string }];
    return new URLSearchParams(init.body).get("From") ?? "";
  }

  it("a Canadian caller who dialed the US line gets a US-line text; a US caller who dialed the Canadian line gets a Canadian-line text", async () => {
    seedDemoLines();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM1" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms(booking("+16045550123", US_DEMO))).toBe("delivered");
    expect(fromOf(fetchMock)).toBe(US_DEMO);
    expect(await sendSms(booking("+13055550188", CA_DEMO))).toBe("delivered");
    expect(fromOf(fetchMock)).toBe(CA_DEMO);
  });

  it.each([
    ["an unknown dialed line", "+13055550000", "sender_called_line_unknown"],
    ["a malformed dialed line", "not-a-number", "sender_invalid_called_line"],
  ])("%s sends nothing and records why", async (_name, called, code) => {
    seedDemoLines();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const message = booking("+13055550188", called);
    expect(await sendSms(message)).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
    const op = db.__peek("businesses/biz/operations", `sms:booking-received:${encodeURIComponent(message.entityId)}`);
    expect(op).toMatchObject({ state: "failed", lastFailure: { code, classification: "retryable" } });
  });

  it("a dialed line whose texting is pending or blocked sends nothing — and never falls back to another line", async () => {
    for (const status of ["pending_registration", "blocked", "not_configured"]) {
      db = makeFakeDb();
      seedDemoLines({ ...READY(), status });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await sendSms(booking("+13055550188", CA_DEMO))).toBe("unconfigured");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("another tenant's line is never a sender, even for the number that was dialed", async () => {
    seed();
    db.__seed("businessPhoneNumbers", "other-ca", { businessId: "other", normalizedPhoneNumber: CA_DEMO, status: "live", sms: READY(true) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms(booking("+13055550188", CA_DEMO))).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a line that doesn't allow this kind of text sends nothing", async () => {
    seed();
    db.__seed("businessPhoneNumbers", "biz-us", { businessId: "biz", normalizedPhoneNumber: US_DEMO, status: "live", sms: { status: "ready", purposes: ["inspector_assigned"], isDefaultSender: false } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms(booking("+13055550188", US_DEMO))).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with no dialed line and no Ready default sender, nothing is sent (the env number is never used)", async () => {
    db.__seed("businesses", "biz", { businessName: "Apex", smsEnabled: true });
    db.__seed("businessPhoneNumbers", "biz-main", { businessId: "biz", normalizedPhoneNumber: "+13055550111", status: "live", sms: { ...READY(true), status: "pending_registration" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms(booking("+13055550188", null))).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
