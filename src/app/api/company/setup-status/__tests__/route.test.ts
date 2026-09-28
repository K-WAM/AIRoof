import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verifyAuthAndRole: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verifyAuthAndRole }));

let currentDb: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => currentDb }));

import { GET } from "../route";

const get = (businessId = "biz-1") => GET(new NextRequest(`http://localhost/api/company/setup-status?businessId=${businessId}`));

describe("GET /api/company/setup-status", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "owner-1" } });
    currentDb = makeFakeDb();
    currentDb.__seed("businesses", "biz-1", { businessName: "Fresh Roofing", phoneNumber: "+15550400" });
  });

  it("requires businessId", async () => {
    const res = await GET(new NextRequest("http://localhost/api/company/setup-status"));
    expect(res.status).toBe(400);
  });

  it("returns the auth gate's error untouched (401 / wrong tenant 403) and gates on owner/staff/superadmin", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await get("other-biz");
    expect(res.status).toBe(403);
    expect(mocks.verifyAuthAndRole).toHaveBeenCalledWith(expect.anything(), "other-biz", ["owner", "staff", "superadmin"]);
  });

  it("reports a tenant with nothing set up", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(await res.json()).toEqual({ phoneConfigured: false, prices: 0, resources: 0, hasLogo: false, teamMembers: 0, calls: 0, phoneNumber: "+15550400" });
  });

  it("counts every source the checklist depends on", async () => {
    currentDb.__seed("businesses", "biz-1", {
      businessName: "Fresh Roofing", phoneNumber: "+15550999",
      businessHours: "Mon-Fri 8-5",
      voiceProvider: "elevenlabs", elevenlabs: { agentId: "agent-1", phoneNumber: "+15550400" },
    });
    currentDb.__seed("businesses/biz-1/library", "pricing", { materials: [{ name: "Shingles" }, { name: "Nails" }], laborRates: [{ role: "Roofer" }] });
    currentDb.__seed("businesses/biz-1/library", "workCatalog", { items: [{ id: "w1" }] });
    currentDb.__seed("businesses/biz-1/library", "logos", { logos: [{ id: "l1" }] });
    currentDb.__seed("businesses/biz-1/crews", "c1", { name: "Crew A" });
    currentDb.__seed("businesses/biz-1/calls", "call-1", {});
    currentDb.__seed("businessUsers", "owner-1", { businessId: "biz-1" });
    currentDb.__seed("businessUsers", "staff-1", { businessId: "biz-1" });
    currentDb.__seed("businessUsers", "someone-else", { businessId: "biz-2" });

    expect(await (await get()).json()).toEqual({
      phoneConfigured: true, businessHours: "Mon-Fri 8-5", prices: 4, resources: 1, hasLogo: true, teamMembers: 2, calls: 1,
      // The AI line wins over the "Main phone" field.
      phoneNumber: "+15550400",
    });
  });

  it("treats Vapi IDs and a legacy logoUrl as set up", async () => {
    currentDb.__seed("businesses", "biz-1", { vapiAssistantId: "asst-1", logoUrl: "https://example.test/logo.png" });
    expect(await (await get()).json()).toMatchObject({ phoneConfigured: true, hasLogo: true, phoneNumber: null });
  });

  it("404s for a business that does not exist", async () => {
    expect((await get("missing")).status).toBe(404);
  });
});
