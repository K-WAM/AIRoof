import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySuperadmin: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifySuperadmin: mocks.verifySuperadmin,
}));

interface FakeDoc { id: string; exists: boolean; data: () => Record<string, unknown> | undefined }

let getAllCalls: string[][] = [];
let currentDb: unknown = null;

function makeDb(opts: {
  businesses: Array<{ id: string; data: Record<string, unknown> }>;
  onboarding: Record<string, Record<string, unknown>>;
  integration: Record<string, Record<string, unknown>>;
}) {
  getAllCalls = [];
  const db = {
    collection: (name: string) => {
      if (name === "businesses") {
        return {
          orderBy: () => ({
            get: async () => ({
              empty: opts.businesses.length === 0,
              docs: opts.businesses.map((b) => ({ id: b.id, data: () => b.data })),
            }),
          }),
        };
      }
      if (name === "businessOnboarding" || name === "businessIntegrationStatus") {
        return {
          doc: (id: string) => ({ __collection: name, __id: id }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    getAll: async (...refs: Array<{ __collection: string; __id: string }>): Promise<FakeDoc[]> => {
      getAllCalls.push(refs.map((r) => `${r.__collection}/${r.__id}`));
      const source = refs[0]?.__collection === "businessOnboarding" ? opts.onboarding : opts.integration;
      return refs.map((r) => ({
        id: r.__id,
        exists: r.__id in source,
        data: () => source[r.__id],
      }));
    },
  };
  return db;
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => currentDb,
  getAdminAuth: () => null,
}));

import { GET } from "@/app/api/admin/businesses/route";

describe("GET /api/admin/businesses", () => {
  beforeEach(() => {
    mocks.verifySuperadmin.mockReset();
    mocks.verifySuperadmin.mockResolvedValue({ user: { uid: "root", superadmin: true } });
  });

  it("batches companion docs via getAll instead of one .get() per business", async () => {
    currentDb = makeDb({
      businesses: [
        { id: "biz-1", data: { businessName: "Apex Roofing" } },
        { id: "biz-2", data: { businessName: "Northwind HVAC" } },
      ],
      onboarding: { "biz-1": { profileComplete: true } },
      integration: { "biz-2": { openaiConfigured: true } },
    });

    const response = await GET(new NextRequest("http://localhost/api/admin/businesses"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Exactly two getAll calls total (one for onboarding refs, one for
    // integration refs), regardless of how many businesses exist — not N
    // separate .get() round trips.
    expect(getAllCalls).toHaveLength(2);
    expect(getAllCalls[0]).toEqual(["businessOnboarding/biz-1", "businessOnboarding/biz-2"]);
    expect(getAllCalls[1]).toEqual(["businessIntegrationStatus/biz-1", "businessIntegrationStatus/biz-2"]);

    expect(body.businesses).toHaveLength(2);
    expect(body.businesses[0]).toMatchObject({
      business: { businessId: "biz-1", businessName: "Apex Roofing" },
      onboarding: { profileComplete: true },
      integrationStatus: null,
    });
    expect(body.businesses[1]).toMatchObject({
      business: { businessId: "biz-2", businessName: "Northwind HVAC" },
      onboarding: null,
      integrationStatus: { openaiConfigured: true },
    });
  });

  it("handles zero businesses without calling getAll", async () => {
    currentDb = makeDb({ businesses: [], onboarding: {}, integration: {} });
    const response = await GET(new NextRequest("http://localhost/api/admin/businesses"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.businesses).toEqual([]);
    expect(getAllCalls).toHaveLength(0);
  });

  it("passes through a superadmin auth rejection", async () => {
    const { NextResponse } = await import("next/server");
    mocks.verifySuperadmin.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    currentDb = makeDb({ businesses: [], onboarding: {}, integration: {} });

    const response = await GET(new NextRequest("http://localhost/api/admin/businesses"));
    expect(response.status).toBe(403);
  });
});
