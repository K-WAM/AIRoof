import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  peek: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  peekFieldSessionClaims: mocks.peek,
}));

import { GET } from "@/app/api/field/session/route";

describe("GET /api/field/session", () => {
  beforeEach(() => {
    mocks.peek.mockReset();
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
  });
});
