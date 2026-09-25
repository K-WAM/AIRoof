import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), update: vi.fn(), firestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify, verifyFieldAccess: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { PATCH } from "./route";

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
    const findings = [{ findingId: "f", category: "X", problem: "Leak", solution: "Repair\nseam",
      includeInReport: true, includeInQuote: false, addedAt: 1 }];
    expect((await PATCH(request(findings), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ findings }));
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
