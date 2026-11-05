// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InvoicePayPrint } from "./InvoicePayPrint";

const mock = vi.hoisted(() => ({ qr: vi.fn(), fetch: vi.fn() }));
vi.mock("qrcode", () => ({ toDataURL: mock.qr }));
const link = { url: "https://app.test/api/pay/invoice?b=a&i=INV-1&t=secret", hash: "hash", expiresAt: Date.now() + 100000 };
const props = { link, businessId: "a", invoiceId: "INV-1", jobId: "job1" };
beforeEach(() => { vi.stubGlobal("fetch", mock.fetch); vi.clearAllMocks(); mock.qr.mockResolvedValue("data:image/png;base64,test"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("creates a print-only QR from a token revalidated by the server", async () => {
  mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ payNowAvailable: true, invoice: { payTokenHash: "hash" } }) });
  render(<InvoicePayPrint {...props} />);
  const image = await screen.findByAltText("Scan to pay this invoice");
  expect(image).toHaveAttribute("src", "data:image/png;base64,test");
  expect(screen.getByRole("link", { hidden: true })).toHaveAttribute("href", link.url);
  expect(mock.qr).toHaveBeenCalledWith(link.url, expect.anything());
});
it("prints nothing after reload when no bearer URL is in memory", () => {
  const { container } = render(<InvoicePayPrint {...props} link={null} />);
  expect(container).toBeEmptyDOMElement(); expect(mock.fetch).not.toHaveBeenCalled();
});
it("prints nothing for an expired link", () => {
  const { container } = render(<InvoicePayPrint {...props} link={{ ...link, expiresAt: 1 }} />);
  expect(container).toBeEmptyDOMElement(); expect(mock.fetch).not.toHaveBeenCalled();
});
