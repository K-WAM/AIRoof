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
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1, payments: [{ eventId: "evt_1", eventType: "checkout.session.completed", amount: 125, currency: "usd", sessionId: "cs_1", paymentIntentId: "pi_1" }] }) });
  render(<UnmatchedPayments businessId="a" />);
  expect(await screen.findByText("Stripe received 1 payment(s) we couldn't match to an invoice — record them by hand.")).toBeInTheDocument();
  expect(screen.getByText(/125.00 USD/)).toHaveTextContent("evt_1 · cs_1 · pi_1");
});
it("reports failed loads rather than claiming there are no unmatched payments", async () => {
  mocks.fetch.mockResolvedValue({ ok: false });
  render(<UnmatchedPayments businessId="a" />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"));
});
