import { describe, expect, it, vi, beforeEach } from "vitest";
import { allowlistFromBusiness, isRecipientAllowed } from "@/lib/comms/evaluationGuard";

const businessDocs = vi.hoisted(() => new Map<string, Record<string, unknown> | "throw">());

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => {
          const d = businessDocs.get(id);
          if (d === "throw") throw new Error("unavailable");
          return { data: () => d };
        },
      }),
    }),
  }),
}));

describe("isRecipientAllowed (pure)", () => {
  it("no list = everyone allowed (every normal client)", () => {
    expect(isRecipientAllowed(null, "anyone@example.com")).toBe(true);
    expect(isRecipientAllowed(undefined, "anyone@example.com")).toBe(true);
  });
  it("matches case-insensitively and inside a display name", () => {
    const list = ["owner+rd@example.com"];
    expect(isRecipientAllowed(list, "OWNER+RD@Example.com")).toBe(true);
    expect(isRecipientAllowed(list, "Owner <owner+rd@example.com>")).toBe(true);
  });
  it("blocks anyone not on the list, and blanks", () => {
    expect(isRecipientAllowed(["a@example.com"], "customer@realco.com")).toBe(false);
    expect(isRecipientAllowed(["a@example.com"], "")).toBe(false);
    expect(isRecipientAllowed([], "a@example.com")).toBe(false);
  });
});

describe("allowlistFromBusiness", () => {
  it("missing field = no guard", () => {
    expect(allowlistFromBusiness({ businessName: "X" })).toBeNull();
    expect(allowlistFromBusiness(undefined)).toBeNull();
  });
  it("malformed field fails closed", () => {
    expect(allowlistFromBusiness({ outboundEmailAllowlist: "a@example.com" })).toEqual([]);
  });
  it("normalizes entries", () => {
    expect(allowlistFromBusiness({ outboundEmailAllowlist: [" A@Example.com ", 5, ""] })).toEqual(["a@example.com"]);
  });
});

describe("sendEmail with the guard (blocked before any provider call)", () => {
  beforeEach(() => {
    vi.resetModules();
    businessDocs.clear();
  });

  async function send(businessId: string | null, to: string) {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const { sendEmail } = await import("@/lib/comms/send");
    return sendEmail({ businessId, to, subject: "S", html: "<p>H</p>" });
  }

  it("skips (never throws) mail to a non-listed address for a guarded business", async () => {
    businessDocs.set("roofdoctors", { outboundEmailAllowlist: ["owner+rd@example.com"] });
    const result = await send("roofdoctors", "real.customer@realco.com");
    expect(result).toEqual({ status: "failed", failureCode: "evaluation_guard", failureClassification: "terminal" });
  });

  it("fails closed when the business can't be read", async () => {
    businessDocs.set("roofdoctors", "throw");
    const result = await send("roofdoctors", "owner+rd@example.com");
    expect(result.failureCode).toBe("evaluation_guard");
  });

  it("platform mail (businessId null) is never guarded", async () => {
    const { checkOutboundEmail } = await import("@/lib/comms/evaluationGuard");
    expect(await checkOutboundEmail(null, "connect@luxordev.com")).toEqual({ allowed: true });
  });

  it("an unguarded business sends normally", async () => {
    const { checkOutboundEmail } = await import("@/lib/comms/evaluationGuard");
    businessDocs.set("apex", { businessName: "Apex" });
    expect(await checkOutboundEmail("apex", "anyone@example.com")).toEqual({ allowed: true });
  });

  it("a listed address passes the guard", async () => {
    const { checkOutboundEmail } = await import("@/lib/comms/evaluationGuard");
    businessDocs.set("roofdoctors", { outboundEmailAllowlist: ["owner+rd@example.com"] });
    expect(await checkOutboundEmail("roofdoctors", "owner+rd@example.com")).toEqual({ allowed: true });
  });
});

describe("phone side: texts and outbound calls under evaluation", () => {
  it("outside evaluation mode every number is allowed", async () => {
    const { isPhoneAllowed, isEvaluationBusiness } = await import("@/lib/comms/evaluationGuard");
    expect(isEvaluationBusiness({ businessName: "X" })).toBe(false);
    expect(isPhoneAllowed({ businessName: "X" }, "+1 (305) 555-0101")).toBe(true);
    expect(isPhoneAllowed(undefined, "+13055550101")).toBe(true);
  });

  it("evaluation mode with no phone list blocks everyone, even an empty email list", async () => {
    const { isPhoneAllowed, isEvaluationBusiness } = await import("@/lib/comms/evaluationGuard");
    expect(isEvaluationBusiness({ outboundEmailAllowlist: [] })).toBe(true);
    expect(isPhoneAllowed({ outboundEmailAllowlist: [] }, "+13055550101")).toBe(false);
    expect(isPhoneAllowed({ outboundEmailAllowlist: "bad" }, "+13055550101")).toBe(false);
    expect(isPhoneAllowed({ outboundEmailAllowlist: [], outboundPhoneAllowlist: "bad" }, "+13055550101")).toBe(false);
  });

  it("only the owner's listed phones pass, compared on the last 10 digits", async () => {
    const { isPhoneAllowed } = await import("@/lib/comms/evaluationGuard");
    const biz = { outboundEmailAllowlist: ["me@example.com"], outboundPhoneAllowlist: ["(305) 555-0101"] };
    expect(isPhoneAllowed(biz, "+1 305 555 0101")).toBe(true);
    expect(isPhoneAllowed(biz, "13055550101")).toBe(true);
    expect(isPhoneAllowed(biz, "+13055550102")).toBe(false);
    expect(isPhoneAllowed(biz, "5550101")).toBe(false);
    expect(isPhoneAllowed(biz, "")).toBe(false);
  });

  it("assertPhoneAllowed throws a plain-language error and never logs the full number", async () => {
    const { assertPhoneAllowed, EvaluationGuardError } = await import("@/lib/comms/evaluationGuard");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertPhoneAllowed({ outboundEmailAllowlist: [] }, "+13055550199", "call", "biz-1")).toThrow(EvaluationGuardError);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("…0199");
    expect(logged).not.toContain("3055550199");
    warn.mockRestore();
  });
});
