import { afterEach, describe, expect, it } from "vitest";
import { buildLuxorReminderEmail, luxorZelleBlock } from "@/lib/billing/luxorNotices";

describe("Luxor Zelle option", () => {
  afterEach(() => { delete process.env.LUXOR_ZELLE_TO; });
  it("is absent until LUXOR_ZELLE_TO is set", () => {
    expect(luxorZelleBlock("LX-1001")).toBe("");
  });
  it("names the address and the invoice number for the memo, escaped", () => {
    process.env.LUXOR_ZELLE_TO = "pay@luxor<x>.test";
    const html = luxorZelleBlock("LX-1001");
    expect(html).toContain("pay@luxor&lt;x&gt;.test");
    expect(html).toContain("LX-1001");
    const reminder = JSON.stringify(buildLuxorReminderEmail({ invoiceId: "LX-1001", clientName: "Acme", total: 1200, dueDate: "2026-10-01" } as never, 7));
    expect(reminder).toContain("Pay by Zelle");
  });
});

describe("Zelle address saved in the app (owner, 2026-10-10)", () => {
  afterEach(() => { delete process.env.LUXOR_ZELLE_TO; });
  it("a saved address wins over the env var, and a saved blank switches Zelle off", async () => {
    process.env.LUXOR_ZELLE_TO = "old@env.test";
    expect(luxorZelleBlock("LX-1", "pay@luxordev.com")).toContain("pay@luxordev.com");
    expect(luxorZelleBlock("LX-1", "")).toBe("");
    expect(luxorZelleBlock("LX-1", null)).toContain("old@env.test");
    expect(JSON.stringify(buildLuxorReminderEmail({ invoiceId: "LX-1", clientName: "A", total: 1, dueDate: "2026-10-01" } as never, 3, "pay@luxordev.com"))).toContain("pay@luxordev.com");
  });
  it("accepts an email, a US phone or blank; refuses anything else", async () => {
    const { validZelleTo } = await import("@/lib/billing/luxorPaySettings");
    for (const ok of ["", "pay@luxordev.com", "(305) 555-0142", "+1 305 555 0142"]) expect(validZelleTo(ok)).toBe(true);
    for (const bad of ["nope", "555-0142", "<b>@x.co", 42, "a@b.c".padStart(130, "x")]) expect(validZelleTo(bad)).toBe(false);
  });
});
