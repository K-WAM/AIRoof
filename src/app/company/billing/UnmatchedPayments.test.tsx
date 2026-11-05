// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UnmatchedPayments } from "./UnmatchedPayments";
const mocks = vi.hoisted(() => ({ role: "owner", fetch: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
beforeEach(() => { mocks.role = "owner"; vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["viewer", "crew"])("does not request office payment references as %s", role => {
  mocks.role = role;
  const { container } = render(<UnmatchedPayments businessId="a" />);
  expect(container).toBeEmptyDOMElement(); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("shows the plain office notice, amount and Stripe references", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1, paymentCount: 1, refundCount: 0, payments: [{ eventId: "pay_pi_1", kind: "payment", eventType: "checkout.session.completed", amount: 125, currency: "usd", sessionId: "cs_1", paymentIntentId: "pi_1" }] }) });
  render(<UnmatchedPayments businessId="a" />);
  expect(await screen.findByText("Stripe received 1 payment(s) we couldn't match to an invoice - record them by hand.")).toBeInTheDocument();
  expect(screen.getByText(/125.00 USD/)).toHaveTextContent("Payment received: 125.00 USD · pay_pi_1 · cs_1 · pi_1");
  expect(screen.queryByText(/refund\(s\)/)).not.toBeInTheDocument();
});
it("counts payments and refunds separately, including records beyond the displayed list", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 41, paymentCount: 31, refundCount: 10, payments: [
    { eventId: "pay_pi_1", kind: "payment", amount: 125, currency: "usd", paymentIntentId: "pi_1" },
    { eventId: "refund_ch_1_3000", kind: "refund", amount: 30, currency: "usd", chargeId: "ch_1" },
  ] }) });
  render(<UnmatchedPayments businessId="a" />);
  expect(await screen.findByText("Stripe received 31 payment(s) we couldn't match to an invoice - record them by hand.")).toBeInTheDocument();
  expect(screen.getByText("10 refund(s) we couldn't match.")).toBeInTheDocument();
  expect(screen.getByText(/Payment received: 125.00 USD/)).toBeInTheDocument();
  expect(screen.getByText(/Refund sent: 30.00 USD/)).toHaveTextContent("ch_1");
  expect(screen.queryByText(/41 payment\(s\)/)).not.toBeInTheDocument();
});
it("shows only the refund notice when no payments are unmatched", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1, paymentCount: 0, refundCount: 1, payments: [
    { eventId: "refund_ch_1_3000", kind: "refund", amount: 30, currency: "usd", chargeId: "ch_1" },
  ] }) });
  render(<UnmatchedPayments businessId="a" />);
  expect(await screen.findByText("1 refund(s) we couldn't match.")).toBeInTheDocument();
  expect(screen.queryByText(/Stripe received/)).not.toBeInTheDocument();
  expect(screen.getByText(/Refund sent: 30.00 USD/)).toBeInTheDocument();
});
it("reports failed loads rather than claiming there are no unmatched payments", async () => {
  mocks.fetch.mockResolvedValue({ ok: false });
  render(<UnmatchedPayments businessId="a" />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"));
});
