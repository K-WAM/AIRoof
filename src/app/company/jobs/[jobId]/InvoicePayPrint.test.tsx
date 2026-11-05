// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InvoicePayPrint } from "./InvoicePayPrint";

const mock = vi.hoisted(() => ({ qr: vi.fn(), fetch: vi.fn() }));
vi.mock("qrcode", () => ({ toDataURL: mock.qr }));
const link = { url: "https://app.test/api/pay/invoice?b=a&i=INV-1&t=secret", expiresAt: Date.now() + 100000 };
const props = { link, businessId: "a", invoiceId: "INV-1", jobId: "job1" };
beforeEach(() => { vi.stubGlobal("fetch", mock.fetch); vi.clearAllMocks(); mock.qr.mockResolvedValue("data:image/png;base64,test"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("creates a print-only QR from a token revalidated by the server", async () => {
  mock.fetch.mockResolvedValue({ ok: true, json: async () => link });
  render(<InvoicePayPrint {...props} />);
  const image = await screen.findByAltText("Scan to pay this invoice");
  expect(image).toHaveAttribute("src", "data:image/png;base64,test");
  expect(screen.getByRole("link", { hidden: true })).toHaveAttribute("href", link.url);
  expect(mock.qr).toHaveBeenCalledWith(link.url, expect.anything());
});
it("recovers the Pay online link and QR after reload without a sender-tab URL", async () => {
  mock.fetch.mockResolvedValue({ ok: true, json: async () => link });
  render(<InvoicePayPrint {...props} link={null} />);
  expect(await screen.findByAltText("Scan to pay this invoice")).toBeInTheDocument();
  expect(mock.fetch).toHaveBeenCalledWith("/api/jobs/job1/invoice/pay-link?businessId=a&invoiceId=INV-1", { cache: "no-store" });
});
it.each(["unavailable", "expired"])("prints no URL or QR when %s", async reason => {
  mock.fetch.mockResolvedValue({ ok: reason === "expired", json: async () => ({ ...link, expiresAt: 1 }) });
  const { container } = render(<InvoicePayPrint {...props} />);
  await waitFor(() => expect(mock.fetch).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement(); expect(mock.qr).not.toHaveBeenCalled();
});
it("does not reuse a previous invoice link while another invoice loads", async () => {
  mock.fetch.mockResolvedValueOnce({ ok: true, json: async () => link });
  const { rerender, container } = render(<InvoicePayPrint {...props} />);
  await screen.findByAltText("Scan to pay this invoice");
  mock.fetch.mockImplementationOnce(() => new Promise(() => {}));
  rerender(<InvoicePayPrint {...props} invoiceId="INV-2" />);
  expect(container).toBeEmptyDOMElement();
});
