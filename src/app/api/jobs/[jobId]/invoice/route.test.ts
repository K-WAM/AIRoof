import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn(), listPhotoMetas: vi.fn(), getPhotoBlobs: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
vi.mock("@/lib/photos/store", () => ({ listPhotoMetas: mocks.listPhotoMetas, getPhotoBlobs: mocks.getPhotoBlobs }));
import { PATCH, POST } from "./route";

const context = { params: Promise.resolve({ jobId: "j" }) };
const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/jobs/j/invoice", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses/b/jobs", "j", { invoiceId: "INV-1" });
  db.__seed("businesses/b/invoices", "INV-1", { status: "draft", labor: [], materials: [], other: [], taxRate: 0, hideMaterials: false });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "u" } });
  mocks.firestore.mockReset().mockReturnValue(db);
  mocks.listPhotoMetas.mockReset().mockResolvedValue([]);
  mocks.getPhotoBlobs.mockReset().mockResolvedValue({});
});

describe("Mark paid", () => {
  it("only a sent invoice can be marked paid, and nothing else may ride along", async () => {
    expect((await PATCH(request({ businessId: "b", status: "paid" }), context)).status).toBe(409); // still a draft
    db.__seed("businesses/b/invoices", "INV-1", { status: "sent", labor: [], materials: [], other: [], taxRate: 0, total: 120 });
    expect((await PATCH(request({ businessId: "b", status: "paid", total: 0 }), context)).status).toBe(400);
    expect((await PATCH(request({ businessId: "b", status: "void" }), context)).status).toBe(400);
    expect((await PATCH(request({ businessId: "b", status: "paid" }), context)).status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ status: "paid", paidAt: expect.any(Number), total: 120 });
    expect((await PATCH(request({ businessId: "b", status: "paid" }), context)).status).toBe(409);
  });
});

describe("invoice document options", () => {
  it("rejects invalid project prices, a locked invoice, and a foreign tenant", async () => {
    for (const customerSubtotal of [null, -1, 10_000_000.01, 1.001, Number.NaN]) {
      expect((await PATCH(request({ businessId: "b", priceMode: "project", customerSubtotal }), context)).status).toBe(400);
    }
    mocks.verify.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await PATCH(request({ businessId: "foreign", priceMode: "project", customerSubtotal: 130 }), context)).status).toBe(403);
    db.__seed("businesses/b/invoices", "INV-1", { status: "sent", labor: [], materials: [], other: [], taxRate: 0, priceMode: "project", customerSubtotal: 130, subtotal: 130, total: 130 });
    expect((await PATCH(request({ businessId: "b", customerSubtotal: 50 }), context)).status).toBe(409);
  });

  it("stores the project customer subtotal with tax while keeping the line sum internal", async () => {
    const response = await PATCH(request({ businessId: "b", labor: [{ lineId: "l", name: "Work", hours: 1, rate: 100, total: 100, source: "manual" }], taxRate: 7.5, discount: { kind: "amount", value: 10 }, priceMode: "project", customerSubtotal: 130.25 }), context);
    expect(response.status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ calculatedSubtotal: 100, subtotal: 130.25, taxAmount: 9.77, total: 140.02 });
    const changed = await PATCH(request({ businessId: "b", labor: [{ lineId: "l", name: "More work", hours: 1, rate: 175, total: 175, source: "manual" }] }), context);
    expect(changed.status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ calculatedSubtotal: 175, subtotal: 130.25, total: 140.02 });
  });

  it("inherits an accepted quote only when creating the first invoice", async () => {
    db.__seed("businesses", "b", { businessName: "Roof Co", industry: "roofing" });
    db.__seed("businesses/b/jobs", "j", { jobId: "j", businessId: "b", title: "Repair", status: "quoted", quoteId: "Q-1", parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] } });
    db.__seed("businesses/b/quotes", "Q-1", { status: "accepted", priceMode: "project", hideMaterials: true, hideLabor: true, subtotal: 250 });
    const response = await POST(request({ businessId: "b" }), context);
    expect(response.status).toBe(201);
    expect((await response.json()).invoice).toMatchObject({ priceMode: "project", hideMaterials: true, hideLabor: true, customerSubtotal: 250, subtotal: 250, total: 250 });
  });
  it("inherits the bundle flags from a line-priced accepted quote", async () => {
    db.__seed("businesses", "b", { businessName: "Roof Co", industry: "roofing" });
    db.__seed("businesses/b/jobs", "j", { jobId: "j", businessId: "b", quoteId: "Q-2", parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] } });
    db.__seed("businesses/b/quotes", "Q-2", { status: "accepted", hideMaterials: true, hideLabor: true, subtotal: 250 });
    const response = await POST(request({ businessId: "b" }), context);
    expect(response.status).toBe(201);
    expect((await response.json()).invoice).toMatchObject({ priceMode: "lines", hideMaterials: true, hideLabor: true, subtotal: 0, total: 0 });
  });
  it("rejects invalid options before writing", async () => {
    for (const invalid of [{ hideMaterials: "true" }, { hideLabor: "true" }, { showTechnicians: 1 }, { technicians: ["<script>"] }, { narrative: "x".repeat(4001) }]) {
      expect((await PATCH(request({ businessId: "b", ...invalid }), context)).status).toBe(400);
    }
    expect(db.__peek("businesses/b/invoices", "INV-1")?.hideLabor).toBeUndefined();
  });
  it("persists valid options and preserves the computed total", async () => {
    const result = await PATCH(request({ businessId: "b", hideMaterials: true, hideLabor: true, showTechnicians: true, technicians: ["Roofer"], narrative: "Roof repair." }), context);
    expect(result.status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ hideMaterials: true, hideLabor: true, showTechnicians: true, technicians: ["Roofer"], narrative: "Roof repair.", total: 0 });
  });
  it("persists edited customer wording and due date without changing totals", async () => {
    const dueAt = Date.parse("2026-10-01T12:00:00Z");
    const result = await PATCH(request({ businessId: "b", opening: "Opening", closing: "Closing", thankYou: "Thank you", terms: "Due upon completion", poNumber: "PO-7", dueAt }), context);
    expect(result.status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")).toMatchObject({ opening: "Opening", closing: "Closing", thankYou: "Thank you", terms: "Due upon completion", poNumber: "PO-7", dueAt, total: 0 });
    expect((await PATCH(request({ businessId: "b", opening: "<script>" }), context)).status).toBe(400);
  });
  it("persists only validated photo ids", async () => {
    const meta = { photoId: "after", label: "After", phase: "after", thumbB64: "thumb", createdAt: 1, includeInReport: true };
    mocks.listPhotoMetas.mockResolvedValue([meta]);
    mocks.getPhotoBlobs.mockResolvedValue({ after: "blob" });
    expect((await PATCH(request({ businessId: "b", photoIds: ["after"] }), context)).status).toBe(200);
    expect(db.__peek("businesses/b/invoices", "INV-1")?.photoIds).toEqual(["after"]);

    mocks.getPhotoBlobs.mockResolvedValue({});
    const response = await PATCH(request({ businessId: "b", photoIds: ["after"] }), context);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/no longer exist/i);
  });
});
