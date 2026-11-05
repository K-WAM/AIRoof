// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsPreview, type PaymentsPreviewInvoice } from "./PaymentsPreview";

const bootstrap = vi.hoisted(() => ({ current: { data: null as unknown } }));

vi.mock("@/contexts/BootstrapContext", () => ({
  useBootstrap: () => bootstrap.current,
}));

afterEach(cleanup);

const invoices: PaymentsPreviewInvoice[] = [
  { invoiceId: "INV-1001", customer: "Acme Property Group", total: 1450, balance: 1450, status: "sent", daysLate: 0 },
  { invoiceId: "INV-1002", customer: "12 Palm Court", total: 900, balance: 300, status: "sent", daysLate: 12 },
  { invoiceId: "INV-1000", customer: "Northside Plaza", total: 4800, balance: 0, status: "paid", daysLate: 0 },
];

describe("PaymentsPreview", () => {
  beforeEach(() => {
    bootstrap.current = { data: { business: { showcase: { payments: true } } } };
  });

  it("opens a preview whose payment buttons are all disabled and say when payments turn on", () => {
    render(<PaymentsPreview invoices={invoices} />);

    expect(screen.getByTestId("payments-preview")).toBeInTheDocument();
    expect(screen.getByText("Online payments")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("See how customers would pay online")).toBeInTheDocument();

    expect(screen.getByText("Invoice INV-1001")).toBeInTheDocument();
    expect(screen.getByText("Acme Property Group")).toBeInTheDocument();
    expect(screen.getByText("Payments by Stripe")).toBeInTheDocument();
    expect(screen.getByText("Stripe charges a fee per payment; exact rates are confirmed at setup.")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Online payments turn on at launch.");
    }
    expect(screen.getByRole("button", { name: /Pay by bank \(ACH\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pay by card/ })).toBeDisabled();
  });

  it("shows the office counts and three sample deposits", () => {
    render(<PaymentsPreview invoices={invoices} />);

    expect(screen.getByText("Partly paid").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Overdue").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Paid").nextSibling).toHaveTextContent("1");
    expect(screen.getAllByText(/^Sample · /)).toHaveLength(3);
  });

  it("is absent when the business's payments showcase switch is off", () => {
    for (const data of [null, { business: {} }, { business: { showcase: {} } }, { business: { showcase: { payments: false } } }]) {
      bootstrap.current = { data };
      const { unmount } = render(<PaymentsPreview invoices={invoices} />);
      expect(screen.queryByTestId("payments-preview")).not.toBeInTheDocument();
      expect(screen.queryByText("Online payments")).not.toBeInTheDocument();
      unmount();
    }
  });
});
