import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;

class FakeDocumentSnapshot {
  constructor(private readonly value: StoredDocument | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeDocumentReference {
  constructor(private readonly firestore: FakeFirestore, readonly path: string) {}
  async get() { return new FakeDocumentSnapshot(this.firestore.documents.get(this.path)); }
  async update(value: StoredDocument) {
    const current = this.firestore.documents.get(this.path);
    if (!current) throw new Error(`Document does not exist: ${this.path}`);
    this.firestore.documents.set(this.path, { ...current, ...value });
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  collection(name: string) {
    return { doc: (id: string) => new FakeDocumentReference(this, `${name}/${id}`) };
  }
  seed(path: string, value: StoredDocument) { this.documents.set(path, { ...value }); }
}

const mockVerifySuperadmin = vi.hoisted(() => vi.fn());
const mockCreateInvoiceCheckoutLink = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mockVerifySuperadmin }));
vi.mock("@/lib/billing/stripePayments", () => ({ createInvoiceCheckoutLink: mockCreateInvoiceCheckoutLink }));

let firestore: FakeFirestore;

function postRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/invoices/LX-1001/pay-link", { method: "POST" });
}

describe("/api/admin/invoices/[invoiceId]/pay-link", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifySuperadmin.mockReset();
    mockCreateInvoiceCheckoutLink.mockReset();
    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn(() => firestore) }));
    mockVerifySuperadmin.mockResolvedValue({ user: { uid: "admin-1", superadmin: true } });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("is superadmin-gated", async () => {
    mockVerifySuperadmin.mockResolvedValue({ error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    expect(res.status).toBe(403);
    expect(mockCreateInvoiceCheckoutLink).not.toHaveBeenCalled();
  });

  it("404s for an unknown invoice", async () => {
    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    expect(res.status).toBe(404);
  });

  it("returns the already-generated link without calling Stripe again", async () => {
    firestore.seed("luxorInvoices/LX-1001", { clientName: "Apex Roofing", stripePaymentUrl: "https://checkout.stripe.com/existing" });
    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/existing");
    expect(mockCreateInvoiceCheckoutLink).not.toHaveBeenCalled();
  });

  it("generates and persists a new link when none exists yet", async () => {
    firestore.seed("luxorInvoices/LX-1001", {
      clientName: "Apex Roofing",
      clientEmail: "owner@apexroofing.com",
      lineItems: [{ description: "Monthly plan", quantity: 1, unitPrice: 299, total: 299 }],
      taxRate: 0,
      taxAmount: 0,
    });
    mockCreateInvoiceCheckoutLink.mockResolvedValue({
      status: "created",
      url: "https://checkout.stripe.com/pay/cs_new",
      sessionId: "cs_new",
    });

    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/pay/cs_new");
    expect(mockCreateInvoiceCheckoutLink).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "LX-1001", clientName: "Apex Roofing", clientEmail: "owner@apexroofing.com" })
    );
    expect(firestore.documents.get("luxorInvoices/LX-1001")).toMatchObject({
      stripePaymentUrl: "https://checkout.stripe.com/pay/cs_new",
      stripeCheckoutSessionId: "cs_new",
    });
  });

  it("returns 503 with a clear message when Stripe isn't configured", async () => {
    firestore.seed("luxorInvoices/LX-1001", { clientName: "Apex Roofing", lineItems: [], taxRate: 0, taxAmount: 0 });
    mockCreateInvoiceCheckoutLink.mockResolvedValue({ status: "unconfigured" });

    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/stripe/i);
  });

  it("returns 502 and does not persist anything when Stripe creation fails", async () => {
    firestore.seed("luxorInvoices/LX-1001", { clientName: "Apex Roofing", lineItems: [], taxRate: 0, taxAmount: 0 });
    mockCreateInvoiceCheckoutLink.mockResolvedValue({ status: "failed", error: "boom" });

    const { POST } = await import("@/app/api/admin/invoices/[invoiceId]/pay-link/route");
    const res = await POST(postRequest(), { params: Promise.resolve({ invoiceId: "LX-1001" }) });
    expect(res.status).toBe(502);
    expect(firestore.documents.get("luxorInvoices/LX-1001")?.stripePaymentUrl).toBeUndefined();
  });
});
