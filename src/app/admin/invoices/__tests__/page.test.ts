import { describe, expect, it, vi } from "vitest";

import {
  canSendSavedInvoice,
  guardUnsavedInvoiceUnload,
  isValidInvoiceEmail,
  loadInvoicePage,
  runSingleFlight,
  UNSAVED_INVOICE_MESSAGE,
} from "@/app/admin/invoices/invoiceFlow";

describe("invoice truthfulness and send guards", () => {
  it("reports an injected invoice-list fetch failure instead of empty success", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.includes("invoice-templates")
            ? { templates: [] }
            : { error: "unavailable" }
        ),
        {
          status: url.includes("invoice-templates") ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const result = await loadInvoicePage(fetchImpl);

    expect(result).toEqual({ status: "error" });
    expect("invoices" in result).toBe(false);
  });

  it("allows sending only a saved, unchanged invoice to a valid email", () => {
    expect(canSendSavedInvoice(null, false, "billing@example.com")).toBe(false);
    expect(canSendSavedInvoice("inv_123", true, "billing@example.com")).toBe(false);
    expect(canSendSavedInvoice("inv_123", false, "not-an-email")).toBe(false);
    expect(canSendSavedInvoice("inv_123", false, "billing@example.com")).toBe(true);
    expect(isValidInvoiceEmail("missing-at.example.com")).toBe(false);
  });

  it("suppresses a double-click while the first send is in flight", async () => {
    const lock = { current: false };
    let release!: () => void;
    const action = vi.fn(
      () => new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    const first = runSingleFlight(lock, action);
    const second = await runSingleFlight(lock, action);

    expect(second).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);

    release();
    await expect(first).resolves.toBe(true);
  });

  it("fires the dirty-invoice unload warning", () => {
    const event = {
      preventDefault: vi.fn(),
      returnValue: "",
    };

    expect(guardUnsavedInvoiceUnload(event, true)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe(UNSAVED_INVOICE_MESSAGE);
  });
});
