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
