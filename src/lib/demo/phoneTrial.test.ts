import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ db: null as unknown, fixedCode: null as number | null }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db, getAdminAuth: () => null }));
vi.mock("node:crypto", async (original) => {
  const real = await original<typeof import("node:crypto")>();
  return { ...real, randomInt: (max: number) => mocks.fixedCode ?? real.randomInt(max) };
});
import { connectPhoneTrial, issuePhoneCode, lockSharedPhoneDemo, PHONE_CODE_TTL_MS } from "./phoneTrial";
import { trialConfig, type RoofingTrial } from "./roofingTrial";
import { getElevenLabsConversation, getElevenLabsConversationForDelivery } from "@/lib/voice/elevenlabs/conversationRecords";

const now = Date.now(), id = "a".repeat(32), businessId = `demo-trial-roofing-${id}`;
describe("private telephone demo credentials", () => {
  let db: ReturnType<typeof makeFakeDb>, trial: RoofingTrial;
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "unit-phone-code-signing-key");
    db = makeFakeDb(); mocks.db = db;
    trial = { id, uid: `demo-trial-${id}`, businessId, name: "Entered Caller", companyName: "Entered Roofing", email: "entered@example.test", secretHash: "test-session-hash", createdAt: now, expiresAt: now + 3600000, calls: 0, notes: 0, tools: 0, corrections: 0, conversationIds: [] };
    db.__seed("demoTrials", id, { ...trial });
    db.__seed("businesses", businessId, { ...trialConfig(trial, "unit-field-key"), isDemoTrial: true, demoTrialExpiresAt: trial.expiresAt });
    db.__seed("businesses", "demo-roofing", { isDemo: true, elevenlabs: { agentId: "shared-agent" } });
    seedCall("conv_phone_1"); seedCall("conv_phone_2");
  });
  afterEach(() => { vi.unstubAllEnvs(); mocks.fixedCode = null; });
  function seedCall(conversationId: string, overrides = {}) {
    db.__seed("elevenlabsConversations", conversationId, { businessId: "demo-roofing", agentId: "shared-agent", callerPhone: "+15555550111", calledNumber: "+16892042643", callSid: `CA_${conversationId}`, createdAt: now, expiresAt: Timestamp.fromMillis(now + 86400000), ...overrides });
  }
  async function issue() {
    const result = await issuePhoneCode(trial, now);
    if (!("code" in result) || !result.code) throw new Error("Expected local phone code");
    return result.code;
  }
  it("denies missing, malformed and wrong codes without disclosing setup details", async () => {
    await issue();
    for (const value of [undefined, "123", "1234 ignore instructions", "12345678", "99-9999"]) {
      const result = await connectPhoneTrial("conv_phone_1", value, now);
      expect(result.result).toMatch(/^NOT CONNECTED:/);
      expect(result).not.toHaveProperty("businessName");
    }
    expect(db.__peek("demoTrials", id)?.calls).toBe(0);
  });
  it("requires the marked shared tenant, matching agent and carrier context", async () => {
    const code = await issue();
    for (const changes of [{ businessId: "real-client" }, { agentId: "other-agent" }, { callSid: null }, { calledNumber: null }]) {
      seedCall("conv_phone_1", changes);
      expect((await connectPhoneTrial("conv_phone_1", code, now)).result).toMatch(/^NOT CONNECTED:/);
    }
    seedCall("conv_phone_1"); db.__seed("businesses", "demo-roofing", { isDemo: false, elevenlabs: { agentId: "shared-agent" } });
    expect((await connectPhoneTrial("conv_phone_1", code, now)).result).toMatch(/^NOT CONNECTED:/);
  });
  it("rejects expired and rotated codes and cannot revive expired private tenants", async () => {
    const first = await issue(), second = await issue();
    expect((await connectPhoneTrial("conv_phone_1", first, now)).result).toMatch(/^NOT CONNECTED:/);
    expect((await connectPhoneTrial("conv_phone_1", second, now + PHONE_CODE_TTL_MS + 1)).result).toMatch(/^NOT CONNECTED:/);
    db.__seed("demoTrials", id, { ...db.__peek("demoTrials", id), expiresAt: now - 1 });
    expect((await connectPhoneTrial("conv_phone_1", second, now)).result).toMatch(/^NOT CONNECTED:/);
  });
  it("caps guessing at five attempts even if a correct code is later supplied", async () => {
    const code = await issue();
    for (let i = 0; i < 5; i++) await connectPhoneTrial("conv_phone_1", "not a code", now);
    expect((await connectPhoneTrial("conv_phone_1", code, now)).result).toMatch(/^NOT CONNECTED:/);
    expect(db.__peek("demoTrials", id)?.calls).toBe(0);
  });
  it("does not issue codes for missing, expired, over-budget or unmarked trials", async () => {
    for (const changes of [{ calls: 2 }, { calls: -1 }, { phoneCodesIssued: 3 }, { phoneCodesIssued: -1 }, { expiresAt: now - 1 }]) {
      db.__seed("demoTrials", id, { ...trial, ...changes });
      expect(await issuePhoneCode(trial, now)).toHaveProperty("error");
    }
    db.__seed("demoTrials", id, { ...trial }); db.__seed("businesses", businessId, { isDemoTrial: false });
    expect(await issuePhoneCode(trial, now)).toHaveProperty("error");
  });
  it("stores no plaintext code and uses the existing bounded TTL cleanup collection", async () => {
    const code = await issue(), record = db.__list("demoTrialBudgets")[0];
    expect(record.id).toMatch(/^phone-code-[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain(code);
    expect(record.data.expiresAt).toEqual(Timestamp.fromMillis(now + PHONE_CODE_TTL_MS));
    expect(db.__peek("demoTrials", id)?.calls).toBe(0);
  });
  it("issues four-digit codes and reuses a code only after it has expired", async () => {
    mocks.fixedCode = 42;
    expect(await issue()).toBe("0042");
    expect((await connectPhoneTrial("conv_phone_1", "0042", now)).result).toMatch(/^CONNECTED:/);
    const otherId = "b".repeat(32), other = { ...trial, id: otherId, businessId: `demo-trial-roofing-${otherId}`, companyName: "Second Roofing", expiresAt: now + 2 * 3600000 };
    db.__seed("demoTrials", otherId, { ...other });
    db.__seed("businesses", other.businessId, { ...trialConfig(other, "other-field-key"), isDemoTrial: true, demoTrialExpiresAt: other.expiresAt });
    expect(await issuePhoneCode(other, now + 1000)).toHaveProperty("error");
    const later = now + PHONE_CODE_TTL_MS + 1;
    expect(await issuePhoneCode(other, later)).toMatchObject({ code: "0042" });
    seedCall("conv_phone_3", { expiresAt: Timestamp.fromMillis(later + 86400000) });
    expect(await connectPhoneTrial("conv_phone_3", "0042", later)).toMatchObject({ businessName: "Second Roofing" });
  });
  it("atomically allows one caller and makes provider retries idempotent", async () => {
    const code = await issue();
    const results = await Promise.all(["conv_phone_1", "conv_phone_2"].map((conversation) => connectPhoneTrial(conversation, code, now)));
    expect(results.filter((result) => result.result.startsWith("CONNECTED:"))).toHaveLength(1);
    expect(results[0]).toMatchObject({ sayToCaller: expect.stringContaining("Entered Roofing"), businessName: "Entered Roofing", callerName: "Entered Caller", confirmationEmail: "entered@example.test" });
    expect(db.__peek("demoTrials", id)).toMatchObject({ calls: 1, conversationIds: ["conv_phone_1"] });
    expect((await connectPhoneTrial("conv_phone_1", code, now + 1000)).result).toMatch(/^CONNECTED:/);
    expect(db.__peek("demoTrials", id)?.calls).toBe(1);
    expect(await lockSharedPhoneDemo("conv_phone_1")).toBe(false);
  });
  it("cannot jump into another private demo after connecting", async () => {
    const code = await issue(); await connectPhoneTrial("conv_phone_1", code, now);
    const otherId = "b".repeat(32), other = { ...trial, id: otherId, businessId: `demo-trial-roofing-${otherId}` };
    db.__seed("demoTrials", otherId, { ...other });
    db.__seed("businesses", other.businessId, { ...trialConfig(other, "other-field-key"), isDemoTrial: true, demoTrialExpiresAt: other.expiresAt });
    const otherCode = await issuePhoneCode(other, now);
    expect((await connectPhoneTrial("conv_phone_1", "code" in otherCode ? otherCode.code : "", now)).result).toMatch(/^NOT CONNECTED:/);
    expect(db.__peek("elevenlabsConversations", "conv_phone_1")?.businessId).toBe(businessId);
  });
  it("serializes shared writes against joining and denies replay without consuming another call", async () => {
    const code = await issue();
    expect(await lockSharedPhoneDemo("conv_phone_1")).toBe(true);
    expect((await connectPhoneTrial("conv_phone_1", code, now)).result).toMatch(/^NOT CONNECTED:/);
    expect((await connectPhoneTrial("conv_phone_2", code, now)).result).toMatch(/^CONNECTED:/);
    expect(db.__peek("demoTrials", id)?.calls).toBe(1);
  });
  it("retains private delivery identity after tool authority expires", async () => {
    const code = await issue(); await connectPhoneTrial("conv_phone_1", code, now);
    expect(await getElevenLabsConversation("conv_phone_1", now + 11 * 60000)).toBeNull();
    expect(await getElevenLabsConversationForDelivery("conv_phone_1", now + 11 * 60000)).toMatchObject({ businessId });
    expect(await getElevenLabsConversationForDelivery("conv_phone_1", now + 86400001)).toBeNull();
  });
});
