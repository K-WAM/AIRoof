import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db, getAdminAuth: () => null }));
import { consumeTrialBudget, isTrialBusiness, readTrial, signedCallIdentity, TRIAL_COOKIE, TRIAL_PREFIX, trialConfig, validTrialDetails } from "./roofingTrial";

const id = "a".repeat(32), secret = "b".repeat(64), businessId = `${TRIAL_PREFIX}${id}`;
describe("private roofing trial boundaries", () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); mocks.db = db; });
  const request = (cookie?: string) => new NextRequest("https://example.test/api/demo/roofing-trial", { headers: cookie ? { cookie: `${TRIAL_COOKIE}=${cookie}` } : {} });
  function seed(overrides = {}) {
    db.__seed("demoTrials", id, { id, businessId, secretHash: createHash("sha256").update(secret).digest("hex"),
      expiresAt: Date.now() + 60000, calls: 0, notes: 0, tools: 0, corrections: 0, ...overrides });
  }
  it("denies absent, wrong, malformed and expired credentials", async () => {
    seed();
    expect(await readTrial(request())).toBeNull();
    expect(await readTrial(request(`${id}.${"c".repeat(64)}`))).toBeNull();
    expect(await readTrial(request(`../real-tenant.${secret}`))).toBeNull();
    seed({ expiresAt: Date.now() - 1 });
    expect(await readTrial(request(`${id}.${secret}`))).toBeNull();
    seed({ businessId: "demo-roofing" });
    expect(await readTrial(request(`${id}.${secret}`))).toBeNull();
  });
  it("requires the provider's single-use URL to bind a conversation to the expected private agent", () => {
    const good = "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_private&conversation_signature=test-only&conversation_id=conv_test_private";
    expect(signedCallIdentity(good.replace("api.elevenlabs.io", "evil.example"), "agent_private")).toBeNull();
    expect(signedCallIdentity(good, "agent_live")).toBeNull();
    expect(signedCallIdentity(good.replace("&conversation_id=conv_test_private", ""), "agent_private")).toBeNull();
    expect(signedCallIdentity(good, "agent_private")?.conversationId).toBe("conv_test_private");
  });
  it("accepts only the exact unexpired private session", async () => {
    seed();
    expect(await readTrial(request(`${id}.${secret}`))).toMatchObject({ id, businessId });
  });
  it("denies missing, expired or poisoned paid counters before any provider work", async () => {
    expect((await consumeTrialBudget(businessId, "calls"))?.status).toBe(429);
    seed({ calls: -1 }); expect((await consumeTrialBudget(businessId, "calls"))?.status).toBe(429);
    seed({ expiresAt: 0 }); expect((await consumeTrialBudget(businessId, "notes"))?.status).toBe(429);
  });
  it("atomically limits concurrent calls across requests and leaves normal tenants untouched", async () => {
    seed();
    const attempts = await Promise.all(Array.from({ length: 6 }, () => consumeTrialBudget(businessId, "calls")));
    expect(attempts.filter((r) => r === null)).toHaveLength(2);
    expect(db.__peek("demoTrials", id)?.calls).toBe(2);
    expect(await consumeTrialBudget("demo-roofing", "calls")).toBeNull();
    expect(await consumeTrialBudget("real-client", "notes")).toBeNull();
  });
  it("rejects malformed signup data and prevents client-supplied tenant paths", () => {
    expect(validTrialDetails({ name: "Name", companyName: "A\nB" })).toBeNull();
    expect(validTrialDetails({ name: "Name", companyName: "Demo", email: "x@example.test\nbcc:evil@example.test" })).toBeNull();
    expect(isTrialBusiness("demo-roofing")).toBe(false);
    expect(isTrialBusiness(`${TRIAL_PREFIX}../client`)).toBe(false);
    expect(validTrialDetails({ name: " Caller ", companyName: " RoofDoctors ", email: "ME@EXAMPLE.COM" })).toEqual({ name: "Caller", companyName: "RoofDoctors", email: "me@example.com", phone: null });
    expect(validTrialDetails({ companyName: "Only Name", phone: "(305) 555-0142" })).toEqual({ name: "", companyName: "Only Name", email: null, phone: "3055550142" });
    expect(validTrialDetails({ companyName: "Only Name", phone: "call me" })).toBeNull();
  });
  it("bounds explicit correction writes separately from the three paid notes", async () => {
    seed({ notes: 3 });
    const attempts = await Promise.all(Array.from({ length: 9 }, () => consumeTrialBudget(businessId, "corrections")));
    expect(attempts.filter((r) => r === null)).toHaveLength(6);
    expect(db.__peek("demoTrials", id)?.notes).toBe(3);
    expect(await consumeTrialBudget("real-client", "corrections")).toBeNull();
  });
  it("uses only explicit demo configuration, not shared phone routing or office recipients", () => {
    const config = trialConfig({ businessId, companyName: "RoofDoctors", name: "Caller", expiresAt: Date.now() + 60000 }, "private-field-key");
    expect(config.businessName).toBe("RoofDoctors");
    expect(config.notificationEmail).toBeUndefined();
    expect(config.elevenlabs).toBeUndefined();
    expect(config.escalationPhone).toBeUndefined();
    expect(config.businessHours).toMatchObject({ Monday: "08:00 - 17:00", Saturday: "Closed" });
  });
});
