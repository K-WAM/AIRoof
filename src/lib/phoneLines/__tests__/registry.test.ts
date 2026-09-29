import { describe, expect, it } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { countryOf, findLineConflicts, formatLineDisplay, toE164, toPhoneLineView } from "@/lib/phoneLines/registry";
import { routingWithLine, transition } from "@/lib/phoneLines/lifecycle";

const US_DEMO = "+16892042643";
const CA_DEMO = "+17789079769";

function db() {
  const fake = makeFakeDb();
  fake.__seed("businesses", "demo-roofing", { isDemo: true, elevenlabs: { agentId: "agent", phoneNumber: US_DEMO, extraPhoneNumbers: [CA_DEMO] } });
  fake.__seed("businesses", "acme", { businessName: "Acme", elevenlabs: { agentId: "a2", phoneNumber: "+13055550100" } });
  fake.__seed("businesses", "newco", { businessName: "NewCo" });
  fake.__seed("businessPhoneNumbers", "beta-main", { businessId: "beta", normalizedPhoneNumber: "+13055550199", purpose: "client", status: "draft" });
  fake.__seed("businessPhoneNumbers", "gone-main", { businessId: "gone", normalizedPhoneNumber: "+13055550177", purpose: "client", status: "retired" });
  return fake as never;
}

describe("toE164 — only real numbers", () => {
  it("normalises the ways a person types a North American number", () => {
    expect(toE164("(689) 204-2643")).toBe(US_DEMO);
    expect(toE164("1 689 204 2643")).toBe(US_DEMO);
    expect(toE164("+1 (778) 907-9769")).toBe(CA_DEMO);
  });
  it("rejects malformed input", () => {
    for (const bad of ["", "12345", "+1 089 204 2643", "555-0100", "+1234", "tel:abc", 42, null]) expect(toE164(bad)).toBeNull();
  });
  it("formats and places a number", () => {
    expect(formatLineDisplay(US_DEMO)).toBe("+1 (689) 204-2643");
    expect(countryOf(US_DEMO)).toBe("US");
    expect(countryOf(CA_DEMO)).toBe("CA");
  });
});

describe("findLineConflicts — every way a number is already taken", () => {
  it("the US and Canadian demo lines can never be given to a client", async () => {
    expect(await findLineConflicts(db(), US_DEMO, "newco")).toEqual([{ kind: "demo_reserved", businessId: "demo-roofing" }]);
    expect(await findLineConflicts(db(), CA_DEMO, "newco")).toEqual([{ kind: "demo_reserved", businessId: "demo-roofing" }]);
  });
  it("another client's live number or registry line is refused", async () => {
    expect(await findLineConflicts(db(), "+13055550100", "newco")).toEqual([{ kind: "other_tenant_line", businessId: "acme" }]);
    expect(await findLineConflicts(db(), "+13055550199", "newco")).toEqual([{ kind: "other_tenant_registry", businessId: "beta" }]);
  });
  it("a client's line can't be added to the demo tenant", async () => {
    expect(await findLineConflicts(db(), "+13055550199", "demo-roofing")).toEqual([{ kind: "client_line_on_demo", businessId: "beta" }]);
  });
  it("a tenant re-saving its own number, a retired line and a fresh number are free", async () => {
    expect(await findLineConflicts(db(), US_DEMO, "demo-roofing")).toEqual([]);
    expect(await findLineConflicts(db(), "+13055550100", "acme")).toEqual([]);
    expect(await findLineConflicts(db(), "+13055550177", "newco")).toEqual([]);
    expect(await findLineConflicts(db(), "+13055550123", "newco")).toEqual([]);
  });
});

describe("line lifecycle", () => {
  it("allows the ordered path and refuses skips", () => {
    expect(transition("draft", "mark_connected")).toEqual({ ok: true, next: "connected" });
    expect(transition("connected", "record_test")).toEqual({ ok: true, next: "test_passed" });
    expect(transition("test_passed", "go_live")).toEqual({ ok: true, next: "live" });
    expect(transition("live", "record_test")).toEqual({ ok: true, next: "live" });
    expect(transition("connected", "go_live").ok).toBe(false);
    expect(transition("draft", "go_live").ok).toBe(false);
    expect(transition("draft", "record_test").ok).toBe(false);
    expect(transition("retired", "retire").ok).toBe(false);
    expect(transition("retired", "set_sms").ok).toBe(false);
  });
  it("adds a number as primary when free, else as an extra, and never beyond five extras", () => {
    expect(routingWithLine({}, "+13055550123")).toEqual({ phoneNumber: "+13055550123", extraPhoneNumbers: [] });
    expect(routingWithLine({ phoneNumber: "+13055550100" }, "+13055550123")).toEqual({ phoneNumber: "+13055550100", extraPhoneNumbers: ["+13055550123"] });
    expect(routingWithLine({ phoneNumber: "+1", extraPhoneNumbers: ["1", "2", "3", "4", "5"] }, "+13055550123")).toEqual({ error: expect.any(String) });
  });
  it("shapes a pre-registry doc safely: Draft, texting off, never Ready", () => {
    const view = toPhoneLineView("x", { businessId: "acme", normalizedPhoneNumber: "+13055550100" }, false);
    expect(view).toMatchObject({ status: "draft", sms: { status: "not_configured", isDefaultSender: false }, purpose: "client" });
    expect(view).not.toHaveProperty("provider");
  });
});
