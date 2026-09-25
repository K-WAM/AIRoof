import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), firestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { PATCH } from "./route";

const context = { params: Promise.resolve({ jobId: "j" }) };
const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/jobs/j/invoice", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let db: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses/b/jobs", "j", { invoiceId: "INV-1" });
  db.__seed("businesses/b/invoices", "INV-1", { status: "draft", labor: [], materials: [], other: [], taxRate: 0, hideMaterials: false });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "u" } });
  mocks.firestore.mockReset().mockReturnValue(db);
});

describe("invoice document options", () => {
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
});
