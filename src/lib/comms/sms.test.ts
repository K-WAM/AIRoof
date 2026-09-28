import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
import { isSmsEnabled, sendSms } from "./sms";

const SID = "ACtest00000000000000000000000000";
const TOKEN = "secret-token";
const MSG = { businessId: "biz", to: "(305) 555-0111", body: "Hi", messageType: "inspector-assigned", entityId: "appt-1:assigned:100" };
const OP_ID = `sms:${encodeURIComponent("inspector-assigned")}:${encodeURIComponent("appt-1:assigned:100")}`;

function seed(business: Record<string, unknown> = {}) {
  db.__seed("businesses", "biz", { businessName: "Apex", smsEnabled: true, smsFromNumber: "+13055550111", ...business });
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
    expect(init.body).toContain("From=%2B13055550111");
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
    expect(outbox[0].data).toMatchObject({ channel: "sms", to: "+13055550111", body: "Hi" });
  });
});
