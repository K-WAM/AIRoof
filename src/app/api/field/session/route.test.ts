import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  peek: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  peekFieldSessionClaims: mocks.peek,
  verifyFieldAccess: mocks.verify,
}));

import { GET } from "@/app/api/field/session/route";

describe("GET /api/field/session", () => {
  beforeEach(() => {
    mocks.peek.mockReset();
    mocks.verify.mockReset().mockResolvedValue({ user: { uid: "field:test" } });
  });

  it("returns businessId/jobId from a valid field-session cookie", async () => {
    mocks.peek.mockReturnValue({ businessId: "biz-1", jobId: "J-10", offlineOwner: expect.stringMatching(/^field:[a-f0-9]{64}$/) });
    const response = await GET(new NextRequest("http://localhost/api/field/session"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ businessId: "biz-1", jobId: "J-10", offlineOwner: expect.stringMatching(/^field:[a-f0-9]{64}$/) });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns jobId: null for a business-wide (non-job-scoped) session", async () => {
    mocks.peek.mockReturnValue({ businessId: "biz-1" });
    const response = await GET(new NextRequest("http://localhost/api/field/session"));

    expect(await response.json()).toEqual({ businessId: "biz-1", jobId: null, offlineOwner: expect.stringMatching(/^field:[a-f0-9]{64}$/) });
  });

  it("401s when there is no valid field session", async () => {
    mocks.peek.mockReturnValue(null);
    const response = await GET(new NextRequest("http://localhost/api/field/session"));

    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("refuses a revoked session even if its signed claims still parse", async () => {
    mocks.peek.mockReturnValue({ businessId: "biz-1", jobId: "J-10" });
    mocks.verify.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const response = await GET(new NextRequest("http://localhost/api/field/session", { headers: { cookie: "__session=office; __field_access=old" } }));
    expect(response.status).toBe(401);
    const [request, businessId, options] = mocks.verify.mock.calls[0];
    expect(request.headers.get("x-offline-owner")).toMatch(/^field:/);
    expect(businessId).toBe("biz-1");
    expect(options).toEqual({ jobId: "J-10" });
  });
});
