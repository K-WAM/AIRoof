import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSendFeedbackEmail = vi.hoisted(() => vi.fn());
const mockVerifyAuthAndRole = vi.hoisted(() => vi.fn());
const mockGetBusinessDoc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notify", () => ({
  sendFeedbackEmail: mockSendFeedbackEmail,
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mockVerifyAuthAndRole,
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: mockGetBusinessDoc }),
    }),
  }),
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  businessId: "test-biz",
  message: "The dashboard is great but could use a dark mode toggle.",
};

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSendFeedbackEmail.mockReset();
    mockVerifyAuthAndRole.mockReset();
    mockGetBusinessDoc.mockReset();
    mockGetBusinessDoc.mockResolvedValue({ data: () => ({ businessName: "Test Business" }) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends feedback email and returns ok on success", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockSendFeedbackEmail).toHaveBeenCalledTimes(1);
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Test Business",
        submitterName: "user@test.com",
        submitterEmail: "user@test.com",
        businessId: "test-biz",
        message: validBody.message,
      }),
    );
  });

  it("falls back to businessId when the business doc has no businessName", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockGetBusinessDoc.mockResolvedValue({ data: () => undefined });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "test-biz" }),
    );
  });

  it("sends feedback email with optional category", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ ...validBody, category: "Feature request" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Feature request" }),
    );
  });

  it("returns 400 when message is missing", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("message");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when message is empty string", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz", message: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("message");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when businessId is missing", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ message: "hello" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("businessId");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when message exceeds max length", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz", message: "x".repeat(2001) }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("too long");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when category is too long", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz", message: "ok", category: "x".repeat(101) }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("category");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not JSON", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        body: "not json",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("JSON");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when session is missing", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBeDefined();
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks required role", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBeDefined();
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 503 when Resend is not configured", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "unconfigured" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
    expect(mockSendFeedbackEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when email delivery fails", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "failed", failureCode: "provider_500" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("Failed to send");
    expect(mockSendFeedbackEmail).toHaveBeenCalledTimes(1);
  });

  it("passes through verifyAuthAndRole with correct roles", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "viewer", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockVerifyAuthAndRole).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "test-biz",
      ["owner", "staff", "viewer", "superadmin"],
    );
  });

  it("uses uid as fallback when email is missing", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-no-email", email: undefined, superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterName: "user-no-email",
        submitterEmail: "",
      }),
    );
  });

  it("trims message whitespace before sending", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({
      user: { uid: "user-1", email: "user@test.com", superadmin: false, role: "owner", businessId: "test-biz" },
    });
    mockSendFeedbackEmail.mockResolvedValue({ status: "delivered", providerId: "msg_1" });

    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz", message: "  useful feedback  " }));

    expect(response.status).toBe(200);
    expect(mockSendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ message: "useful feedback" }),
    );
  });

  it("rejects whitespace-only message", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(createRequest({ businessId: "test-biz", message: "   " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("message");
    expect(mockSendFeedbackEmail).not.toHaveBeenCalled();
  });
});
