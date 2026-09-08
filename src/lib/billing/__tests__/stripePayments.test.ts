import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock() {
    // @ts-expect-error test double: replicate the shape createInvoiceCheckoutLink() reads, not the real SDK
    this.checkout = { sessions: { create: mockCreate } };
  }),
}));

describe("createInvoiceCheckoutLink", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns unconfigured without touching Stripe when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    const result = await createInvoiceCheckoutLink({
      invoiceId: "LX-1001",
      clientName: "Apex Roofing",
      lineItems: [{ description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 }],
      taxRate: 0,
      taxAmount: 0,
      baseUrl: "https://ai-roof.vercel.app",
    });

    expect(result).toEqual({ status: "unconfigured" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an invoice with no billable line items before ever calling Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    const result = await createInvoiceCheckoutLink({
      invoiceId: "LX-1002",
      clientName: "Apex Roofing",
      lineItems: [{ description: "Comped item", quantity: 1, unitPrice: 0, total: 0 }],
      taxRate: 0,
      taxAmount: 0,
      baseUrl: "https://ai-roof.vercel.app",
    });

    expect(result.status).toBe("failed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("collapses each line item to a fixed-price quantity-1 line and appends tax as its own line", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    mockCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" });
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    const result = await createInvoiceCheckoutLink({
      invoiceId: "LX-1003",
      clientName: "Apex Roofing",
      lineItems: [
        { description: "3.5 labor hours", quantity: 3.5, unitPrice: 65, total: 227.5 }, // fractional qty
        { description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 },
      ],
      taxRate: 8.5,
      taxAmount: 44.7,
      clientEmail: "owner@apexroofing.com",
      baseUrl: "https://ai-roof.vercel.app",
    });

    expect(result).toEqual({
      status: "created",
      url: "https://checkout.stripe.com/pay/cs_test_1",
      sessionId: "cs_test_1",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    expect(call.mode).toBe("payment");
    expect(call.customer_email).toBe("owner@apexroofing.com");
    expect(call.success_url).toBe("https://ai-roof.vercel.app/pay/success?invoice=LX-1003");
    expect(call.cancel_url).toBe("https://ai-roof.vercel.app/pay/cancelled?invoice=LX-1003");
    expect(call.metadata).toEqual({ invoiceId: "LX-1003", clientName: "Apex Roofing" });

    // Every line item is quantity 1 (never a fractional Stripe quantity) with
    // unit_amount matching the invoice's own pre-computed total, in cents.
    expect(call.line_items).toEqual([
      { quantity: 1, price_data: { currency: "usd", unit_amount: 22750, product_data: { name: "3.5 labor hours" } } },
      { quantity: 1, price_data: { currency: "usd", unit_amount: 29900, product_data: { name: "Monthly plan" } } },
      { quantity: 1, price_data: { currency: "usd", unit_amount: 4470, product_data: { name: "Tax (8.5%)" } } },
    ]);
  });

  it("omits the tax line entirely when taxAmount is zero", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    mockCreate.mockResolvedValue({ id: "cs_test_2", url: "https://checkout.stripe.com/pay/cs_test_2" });
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    await createInvoiceCheckoutLink({
      invoiceId: "LX-1004",
      clientName: "Apex Roofing",
      lineItems: [{ description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 }],
      taxRate: 0,
      taxAmount: 0,
      baseUrl: "https://ai-roof.vercel.app",
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(1);
  });

  it("filters out non-billable ($0) rows but still bills the rest", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    mockCreate.mockResolvedValue({ id: "cs_test_3", url: "https://checkout.stripe.com/pay/cs_test_3" });
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    await createInvoiceCheckoutLink({
      invoiceId: "LX-1005",
      clientName: "Apex Roofing",
      lineItems: [
        { description: "Free consultation", quantity: 1, unitPrice: 0, total: 0 },
        { description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 },
      ],
      taxRate: 0,
      taxAmount: 0,
      baseUrl: "https://ai-roof.vercel.app",
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(1);
    expect(call.line_items[0].price_data.product_data.name).toBe("Monthly plan");
  });

  it("surfaces a Stripe API failure as a failed result rather than throwing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    mockCreate.mockRejectedValue(new Error("Stripe is down"));
    const { createInvoiceCheckoutLink } = await import("@/lib/billing/stripePayments");

    const result = await createInvoiceCheckoutLink({
      invoiceId: "LX-1006",
      clientName: "Apex Roofing",
      lineItems: [{ description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 }],
      taxRate: 0,
      taxAmount: 0,
      baseUrl: "https://ai-roof.vercel.app",
    });

    expect(result).toEqual({ status: "failed", error: "Stripe is down" });
  });
});
