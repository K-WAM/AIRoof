import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
const mocks = vi.hoisted(() => ({ classify: vi.fn(), lead: vi.fn() }));
vi.mock("@/lib/ai/deepseekClient", () => ({ classifyCallOutcome: mocks.classify }));
vi.mock("@/lib/calls/callLead", () => ({ ensureCallLead: mocks.lead }));
import { writeEndedCallReport, type EndedCallReportInput } from "./endOfCallWriter";
const input: EndedCallReportInput = {
  businessId: "biz", callId: "call_1", callerPhone: null, summary: "Inspection requested",
  startedAt: 100, durationSecs: 42,
  messages: [{ messageId: "m0", role: "agent", text: "How can I help?", timestamp: 100 },
    { messageId: "m1", role: "caller", text: "Book an inspection", timestamp: 200 }],
};
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => { vi.clearAllMocks(); db = makeFakeDb(); db.__seed("businesses", "biz", { businessName: "RoofDoctors" }); });
const run = () => writeEndedCallReport(db as unknown as Firestore, input);
const call = () => db.__peek("businesses/biz/calls", "call_1");
describe("ended call durability", () => {
  it("retains the complete ended transcript when classification fails", async () => {
    mocks.classify.mockRejectedValue(new Error("provider timeout"));
    await run();
    expect(call()).toMatchObject({ status: "ended", messages: input.messages, summary: input.summary, startedAt: 100, durationSecs: 42 });
    expect(mocks.lead).not.toHaveBeenCalled();
  });
  it("fails closed before spending on AI when the raw call cannot be saved", async () => {
    const ref = db.collection("businesses").doc("biz").collection("calls").doc("call_1");
    // Every ref in the fake uses the same set implementation.
    const prototype = Object.getPrototypeOf(ref);
    const fail = vi.spyOn(prototype, "set").mockRejectedValueOnce(new Error("write unavailable"));
    try { await expect(run()).rejects.toThrow("write unavailable"); expect(mocks.classify).not.toHaveBeenCalled(); }
    finally { fail.mockRestore(); }
  });
  it("saves provider facts before a stalled classifier and still runs the lead safety net on recovery", async () => {
    let finish!: (value: { outcome: "scheduled"; reason: string }) => void;
    const pending = new Promise<{ outcome: "scheduled"; reason: string }>((resolve) => { finish = resolve; });
    mocks.classify.mockImplementation(() => {
      expect(call()).toMatchObject({ status: "ended", messages: input.messages });
      return pending;
    });
    const writing = run();
    await vi.waitFor(() => expect(mocks.classify).toHaveBeenCalledOnce());
    expect(call()).toMatchObject({ status: "ended", messages: input.messages });
    finish({ outcome: "scheduled", reason: "Booked" }); await writing;
    expect(mocks.lead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "biz", callId: "call_1", classification: { outcome: "scheduled", reason: "Booked" } }));
    expect(call()).toMatchObject({ outcome: "scheduled", outcomeReason: "Booked", messages: input.messages });
  });

  describe("company attribution (T-317 fix)", () => {
    const rdsf = { id: "rdsf", name: "Roof Pros South", shortName: "RDSF", isDefault: true };
    const rcu = { id: "rcu", name: "Concepts Unlimited", shortName: "RCU" };
    const attributedInput: EndedCallReportInput = { ...input, callerPhone: "+1 (555) 123-4567" };
    const runAttributed = () => writeEndedCallReport(db as unknown as Firestore, attributedInput);

    beforeEach(() => {
      db.__seed("businesses", "biz", { businessName: "RoofDoctors", billingCompanies: [rdsf, rcu] });
      db.__seed("businesses/biz/customers", "C-1", { phone: "+15551234567", companyId: "rcu", searchTokens: ["1234567"] });
      mocks.classify.mockResolvedValue({ outcome: "scheduled", reason: "Booked" });
    });

    it("reads the business document once for attribution and classification", async () => {
      const ref = db.collection("businesses").doc("biz");
      const prototype = Object.getPrototypeOf(ref);
      const originalGet = prototype.get;
      let businessReads = 0;
      const spy = vi.spyOn(prototype, "get").mockImplementation(function (this: { id: string }) {
        if (this.id === "biz") businessReads += 1;
        return originalGet.call(this);
      });
      try {
        await runAttributed();
        expect(call()).toMatchObject({ companyId: "rcu" });
        expect(businessReads).toBe(1);
      } finally { spy.mockRestore(); }
    });

    it("a failed company write is logged and never stops classification or the lead safety net", async () => {
      const ref = db.collection("businesses").doc("biz").collection("calls").doc("call_1");
      const prototype = Object.getPrototypeOf(ref);
      const originalSet = prototype.set;
      const failing = vi.spyOn(prototype, "set").mockImplementation(function (this: unknown, ...args: unknown[]) {
        const [data] = args as [Record<string, unknown> | undefined];
        if (data && typeof data === "object" && "companyId" in data && !("messages" in data)) return Promise.reject(new Error("write unavailable"));
        return originalSet.apply(this, args);
      });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await runAttributed();
        expect(mocks.classify).toHaveBeenCalledOnce();
        expect(mocks.lead).toHaveBeenCalledOnce();
        expect(call()).toMatchObject({ status: "ended", outcome: "scheduled", outcomeReason: "Booked", messages: input.messages });
        expect(logged).toHaveBeenCalledWith("writeEndedCallReport: company attribution failed", expect.any(Error));
      } finally { failing.mockRestore(); logged.mockRestore(); }
    });
  });
});
