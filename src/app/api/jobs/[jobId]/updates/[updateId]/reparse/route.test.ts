import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/ai/deepseekClient", () => ({ parseFieldUpdate: mocks.parse }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { POST } from "./route";

const ctx = (updateId: string) => ({ params: Promise.resolve({ jobId: "J-1016", updateId }) });
const call = (updateId: string, body: unknown = { businessId: "biz" }) =>
  POST(new NextRequest(`http://localhost/api/jobs/J-1016/updates/${updateId}/reparse`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), ctx(updateId));
const peek = (id: string) => db.__peek("businesses/biz/jobs/J-1016/updates", id) as Record<string, unknown>;
const parsedOk = { timeline: [], materials: [{ item: "Vacuum cleaners", quantity: "11" }], labor: [], issues: [], invoiceSuggestions: [] };

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "biz", { businessName: "Roofdoctor", industry: "roofing" });
  db.__seed("businesses/biz/jobs", "J-1016", { jobId: "J-1016", status: "in_progress", title: "Cracked shingle repair" });
  db.__seed("businesses/biz/jobs/J-1016/updates", "upd_2", {
    updateId: "upd_2", kind: "normal", rawText: "Used eleven vacuum cleaners", language: "en", submittedBy: "Kevin", createdAt: 2,
    parseError: "parseFieldUpdate: schema validation failed — transcriptEn: Value is missing or below the allowed minimum",
  });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "u", role: "owner" } });
  mocks.parse.mockReset().mockResolvedValue(parsedOk);
});

describe("POST /api/jobs/[jobId]/updates/[updateId]/reparse", () => {
  it("re-reads a failed note, clears the error, keeps the original fields and recomputes the job", async () => {
    const res = await call("upd_2");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true });
    const update = peek("upd_2");
    expect(update).not.toHaveProperty("parseError");
    expect(update).toMatchObject({ parsed: parsedOk, submittedBy: "Kevin", createdAt: 2, rawText: "Used eleven vacuum cleaners" });
    expect(mocks.parse.mock.calls[0][0]).toMatchObject({ rawText: "Used eleven vacuum cleaners", industry: "roofing", jobContext: { title: "Cracked shingle repair" } });
    expect((db.__peek("businesses/biz/jobs", "J-1016") as { parsed?: { materials: unknown[] } }).parsed?.materials).toHaveLength(1);
  });

  it("keeps the note and reports a clear error when the parse fails again", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("model timeout"));
    const res = await call("upd_2");
    expect(res.status).toBe(502);
    expect(peek("upd_2")).toMatchObject({ parseError: "model timeout", rawText: "Used eleven vacuum cleaners" });
  });

  it("does nothing for an update that already parsed", async () => {
    db.__seed("businesses/biz/jobs/J-1016/updates", "upd_1", { updateId: "upd_1", kind: "normal", rawText: "Arrived", createdAt: 1, parsed: parsedOk });
    expect(await (await call("upd_1")).json()).toMatchObject({ changed: false });
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("refuses without a staff session, 404s an unknown update, 400s a missing businessId", async () => {
    mocks.verify.mockResolvedValueOnce({ error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) });
    expect((await call("upd_2")).status).toBe(401);
    expect(peek("upd_2")).toHaveProperty("parseError");
    expect((await call("nope")).status).toBe(404);
    expect((await call("upd_2", {})).status).toBe(400);
  });
});
