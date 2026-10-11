import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), update: vi.fn(), firestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify, verifyFieldAccess: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { PATCH } from "./route";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { quoteLinesFromFindings, quoteTotal } from "@/lib/billing/jobQuote";
import type { JobFinding } from "@/types/workCatalog";

const finding = (findingId: string, over: Partial<JobFinding> = {}): JobFinding => ({ findingId, category: "Roof", problem: `Problem ${findingId}`,
  solution: "Fix it", includeInReport: true, includeInQuote: true, addedAt: 1, ...over });
/** A roofing business with job "j" (and optionally quote Q-1) in the shared in-memory Firestore fake. */
function fakeDb(job: Record<string, unknown> = {}, quote?: Record<string, unknown>) {
  const db = makeFakeDb();
  db.__seed("businesses", "b", { industry: "roofing" });
  db.__seed("businesses/b/jobs", "j", { status: "inspection", ...job });
  if (quote) db.__seed("businesses/b/quotes", "Q-1", quote);
  mocks.firestore.mockReturnValue(db);
  return db;
}

const context = { params: Promise.resolve({ jobId: "j" }) };
const request = (findings: unknown) => new NextRequest("http://localhost/api/jobs/j", { method: "PATCH",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: "b", findings }) });
const reportRequest = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/jobs/j", { method: "PATCH",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: "b", ...body }) });
beforeEach(() => {
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  mocks.update.mockReset();
  mocks.firestore.mockReset().mockReturnValue({ collection: (path: string) => ({ doc: () => ({
    get: async () => ({ exists: true, data: () => ({ industry: path === "businesses" ? "roofing" : undefined }) }),
    update: mocks.update,
  }) }) });
});

describe("job findings PATCH", () => {
  it("rejects unauthenticated edits before touching Firestore", async () => {
    mocks.verify.mockResolvedValue({ error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) });
    expect((await PATCH(request([]), context)).status).toBe(401);
    expect(mocks.firestore).not.toHaveBeenCalled();
  });
  it("rejects malformed findings and HTML before any write", async () => {
    const invalid = [{ findingId: "f", category: "X", problem: "<script>", solution: "Repair",
      includeInReport: true, includeInQuote: true, addedAt: 1 }];
    expect((await PATCH(request(invalid), context)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("stores valid findings as a job snapshot", async () => {
    const db = fakeDb();
    const findings = [{ findingId: "f", category: "X", problem: "Leak", solution: "Repair\nseam",
      includeInReport: true, includeInQuote: false, addedAt: 1 }];
    expect((await PATCH(request(findings), context)).status).toBe(200);
    expect(db.__peek("businesses/b/jobs", "j")?.findings).toEqual(findings);
  });
  it("a missing job is a 404, not a crash", async () => {
    const db = makeFakeDb();
    db.__seed("businesses", "b", { industry: "roofing" });
    mocks.firestore.mockReturnValue(db);
    expect((await PATCH(request([]), context)).status).toBe(404);
  });
});

// Owner, 2026-10-10: "I added findings, and they didn't show in the quote. But it did show on report."
describe("findings save keeps a draft quote in step", () => {
  const tile = finding("tile", { itemId: "tile", lines: [{ description: "Tile", quantity: 2, unitPrice: 50, kind: "material" }] });
  const flashing = finding("flash", { lines: [{ description: "Flashing", quantity: 1, unitPrice: 120, kind: "labor" }] });
  const quoteWith = (findings: JobFinding[], status = "draft", extra: Record<string, unknown> = {}) => {
    const lines = quoteLinesFromFindings(findings);
    return { quoteId: "Q-1", status, findings, lines, subtotal: quoteTotal(lines), total: quoteTotal(lines), ...extra };
  };

  it("adds a finding newly marked In quote, with its priced lines and total", async () => {
    const db = fakeDb({ findings: [tile], quoteId: "Q-1" }, quoteWith([tile]));
    expect((await PATCH(request([tile, flashing]), context)).status).toBe(200);
    const quote = db.__peek("businesses/b/quotes", "Q-1") as { findings: JobFinding[]; lines: Array<{ description: string }>; total: number };
    expect(quote.findings.map((f: JobFinding) => f.findingId)).toEqual(["tile", "flash"]);
    expect(quote.lines.map((l: { description: string }) => l.description)).toEqual(["Tile", "Flashing"]);
    expect(quote.total).toBe(220);
  });
  it("removes one unmarked on the Findings tab, and leaves alone one removed on the Quote tab", async () => {
    const db = fakeDb({ findings: [tile, flashing], quoteId: "Q-1" }, quoteWith([flashing]));
    expect((await PATCH(request([tile, { ...flashing, includeInQuote: false }]), context)).status).toBe(200);
    const quote = db.__peek("businesses/b/quotes", "Q-1") as { findings: JobFinding[]; lines: Array<{ description: string }>; total: number };
    expect(quote.findings).toEqual([]);
    expect(quote.total).toBe(0);
  });
  it("keeps a project price and never touches a sent quote", async () => {
    const project = fakeDb({ findings: [tile], quoteId: "Q-1" }, quoteWith([tile], "draft", { priceMode: "project", customerSubtotal: 999 }));
    expect((await PATCH(request([tile, flashing]), context)).status).toBe(200);
    expect(project.__peek("businesses/b/quotes", "Q-1")).toMatchObject({ total: 999, calculatedSubtotal: 220 });

    const sent = fakeDb({ findings: [tile], quoteId: "Q-1" }, quoteWith([tile], "sent"));
    expect((await PATCH(request([tile, flashing]), context)).status).toBe(200);
    expect(sent.__peek("businesses/b/quotes", "Q-1")!.findings).toHaveLength(1);
    expect(sent.__peek("businesses/b/jobs", "j")!.findings).toHaveLength(2);
  });
});

describe("report customer-copy PATCH", () => {
  it("rejects invalid report options and technician content before writing", async () => {
    expect((await PATCH(reportRequest({ reportOptions: { hideLabor: "yes" } }), context)).status).toBe(400);
    expect((await PATCH(reportRequest({ reportTechnicians: ["<script>"] }), context)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("persists optional report settings without a migration", async () => {
    const reportOptions = { hideMaterials: true, hideLabor: true, showPhotos: true, showTechnicians: true };
    expect((await PATCH(reportRequest({ reportNotes: "Completed repair.", reportOptions, reportTechnicians: ["Ava"] }), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ reportNotes: "Completed repair.", reportOptions, reportTechnicians: ["Ava"] }));
  });
  it("a status change also appends to the status history; an edit without a status does not", async () => {
    expect((await PATCH(reportRequest({ status: "quoted" }), context)).status).toBe(200);
    const withStatus = mocks.update.mock.calls.at(-1)![0];
    expect(withStatus.status).toBe("quoted");
    expect(withStatus.statusHistory).toBeTruthy(); // FieldValue.arrayUnion sentinel: atomic append, no read needed
    mocks.update.mockClear();
    expect((await PATCH(reportRequest({ reportNotes: "Notes only." }), context)).status).toBe(200);
    expect(mocks.update.mock.calls.at(-1)![0].statusHistory).toBeUndefined();
  });
});
