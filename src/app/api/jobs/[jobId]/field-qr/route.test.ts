import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const staffUser = { user: { uid: "staff-1", businessId: "biz-1", role: "staff" } };

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
  mintFieldExchangeToken: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
  mintFieldExchangeToken: mocks.mintFieldExchangeToken,
}));

type Doc = Record<string, unknown> | undefined;

function makeDb(opts: { business: Doc; job: Doc }) {
  let business = opts.business;
  const businessSets: Array<Record<string, unknown>> = [];
  const grantSets: Array<Record<string, unknown>> = [];

  const jobRef = {
    get: async () => ({ exists: opts.job !== undefined, data: () => opts.job }),
  };
  const businessRef = {
    get: async () => ({ exists: business !== undefined, data: () => business }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      businessSets.push(data);
      business = options?.merge ? { ...business, ...data } : data;
    },
    collection: (name: string) => {
      if (name !== "jobs") throw new Error(`unexpected collection ${name}`);
      return { doc: () => jobRef };
    },
  };
  const db = {
    collection: (name: string) => {
      if (name === "businesses") return { doc: () => businessRef };
      if (name === "fieldAccessGrants") {
        return {
          doc: () => ({
            set: async (data: Record<string, unknown>) => { grantSets.push(data); },
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { db, businessSets, grantSets };
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => currentDb,
}));

let currentDb: unknown = null;

function requestFor(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/jobs/J-1/field-qr", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/[jobId]/field-qr", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockReset();
    mocks.mintFieldExchangeToken.mockReset();
    mocks.verifyAuthAndRole.mockResolvedValue(staffUser);
  });

  it("mints a grant, stores it under a short opaque id, and returns a /f/ URL", async () => {
    const { db, grantSets } = makeDb({
      business: { businessName: "Apex Roofing", fieldKey: "a".repeat(32) },
      job: { title: "Roof repair" },
    });
    currentDb = db;
    mocks.mintFieldExchangeToken.mockReturnValue({
      ok: true,
      token: "signed-grant-token",
      businessId: "biz-1",
      jobId: "J-1",
      expiresAt: Date.now() + 600_000,
    });

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.ok).toBe(true);
    // Short opaque path, not the ~300-char signed token — the whole point of
    // the /f/[grant] indirection (see its route.ts header comment).
    expect(responseBody.fieldUrl).toMatch(/^http:\/\/localhost\/f\/[A-Za-z0-9_-]{20,}$/);
    expect(mocks.mintFieldExchangeToken).toHaveBeenCalledWith("biz-1", "a".repeat(32), "J-1");
    expect(grantSets).toHaveLength(1);
    expect(grantSets[0]).toMatchObject({ token: "signed-grant-token", businessId: "biz-1", jobId: "J-1" });
  });

  it("lazily provisions a field key when the business doesn't have one yet", async () => {
    const { db, businessSets } = makeDb({
      business: { businessName: "New Client" }, // no fieldKey
      job: { title: "Inspection" },
    });
    currentDb = db;
    mocks.mintFieldExchangeToken.mockReturnValue({
      ok: true,
      token: "signed-grant-token",
      businessId: "biz-1",
      jobId: "J-1",
      expiresAt: Date.now() + 600_000,
    });

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(200);
    expect(businessSets).toHaveLength(1);
    const mintedKey = mocks.mintFieldExchangeToken.mock.calls[0][1] as string;
    expect(mintedKey.length).toBeGreaterThanOrEqual(16);
    expect(businessSets[0].fieldKey).toBe(mintedKey);
  });

  it("returns 400 when businessId is missing", async () => {
    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({}), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.verifyAuthAndRole).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(
      new NextRequest("http://localhost/api/jobs/J-1/field-qr", { method: "POST", body: "not json" }),
      { params: Promise.resolve({ jobId: "J-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("passes through verifyAuthAndRole's error (401/403) without minting a grant", async () => {
    const { NextResponse } = await import("next/server");
    mocks.verifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(401);
    expect(mocks.mintFieldExchangeToken).not.toHaveBeenCalled();
  });

  it("returns 404 when the job doesn't exist", async () => {
    const { db } = makeDb({
      business: { businessName: "Apex Roofing", fieldKey: "a".repeat(32) },
      job: undefined,
    });
    currentDb = db;

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.mintFieldExchangeToken).not.toHaveBeenCalled();
  });

  it("returns 404 when the business doesn't exist", async () => {
    const { db } = makeDb({ business: undefined, job: { title: "x" } });
    currentDb = db;

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(404);
  });

  it("returns 503 when Firestore is unavailable", async () => {
    currentDb = null;
    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(503);
  });

  it("returns 503 when field access isn't configured (mint throws)", async () => {
    const { db } = makeDb({
      business: { businessName: "Apex Roofing", fieldKey: "a".repeat(32) },
      job: { title: "Roof repair" },
    });
    currentDb = db;
    mocks.mintFieldExchangeToken.mockImplementation(() => {
      throw new Error("Field access is not configured");
    });

    const { POST } = await import("@/app/api/jobs/[jobId]/field-qr/route");
    const response = await POST(requestFor({ businessId: "biz-1" }), { params: Promise.resolve({ jobId: "J-1" }) });

    expect(response.status).toBe(503);
  });
});
