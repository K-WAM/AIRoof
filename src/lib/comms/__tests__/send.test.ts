import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

function createFakeResend(
  behaviour: "success" | "error-4xx" | "error-5xx" | "throw" | "no-id",
) {
  return class FakeResend {
    emails = {
      send: vi.fn().mockImplementation(async () => {
        if (behaviour === "throw") throw new Error("network error");
        if (behaviour === "error-4xx") {
          return { error: { statusCode: 400, message: "Bad request" }, data: null };
        }
        if (behaviour === "error-5xx") {
          return { error: { statusCode: 503, message: "Server error" }, data: null };
        }
        if (behaviour === "no-id") {
          return { error: null, data: { id: "" } };
        }
        return { error: null, data: { id: "resend_msg_abc123" } };
      }),
    };
  };
}

const mockClaimOperation = vi.hoisted(() => vi.fn());
const mockCompleteOperationAttempt = vi.hoisted(() => vi.fn());
const mockCreateEmailOperationId = vi.hoisted(() => vi.fn());
const mockStartOperationAttempt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ops/ledger", () => ({
  claimOperation: mockClaimOperation,
  completeOperationAttempt: mockCompleteOperationAttempt,
  createEmailOperationId: mockCreateEmailOperationId,
  startOperationAttempt: mockStartOperationAttempt,
}));

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns unconfigured when Resend is not configured", async () => {
    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("unconfigured");
  });

  it("returns no_recipient when to is empty", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("no_recipient");
  });

  it("returns delivered with providerId on success", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("success") }));

    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("delivered");
    expect(result.providerId).toBe("resend_msg_abc123");
  });

  it("classifies 4xx errors as terminal", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("error-4xx") }));

    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("failed");
    expect(result.failureClassification).toBe("terminal");
    expect(result.failureCode).toBe("provider_400");
  });

  it("classifies 5xx errors as retryable", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("error-5xx") }));

    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("failed");
    expect(result.failureClassification).toBe("retryable");
    expect(result.failureCode).toBe("provider_503");
  });

  it("returns failed when no provider ID is returned", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("no-id") }));

    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("failed");
    expect(result.failureCode).toBe("no_provider_id");
  });

  it("returns failed when Resend throws unexpectedly", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("throw") }));

    const { sendEmail } = await import("@/lib/comms/send");
    const result = await sendEmail({ to: "user@example.com", subject: "S", html: "<p>H</p>" });
    expect(result.status).toBe("failed");
    expect(result.failureClassification).toBe("retryable");
    expect(result.failureCode).toBe("provider_error");
  });
});

describe("sendWithLedger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockClaimOperation.mockReset();
    mockCompleteOperationAttempt.mockReset();
    mockCreateEmailOperationId.mockReset();
    mockStartOperationAttempt.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fakeFirestore = {} as unknown as import("firebase-admin/firestore").Firestore;

  it("returns unconfigured when Resend is not configured", async () => {
    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "user@example.com",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("unconfigured");
  });

  it("returns failed when to is empty", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");

    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("failed");
  });

  it("returns delivered without re-sending when already succeeded", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const opId = "email:test:entity";
    mockCreateEmailOperationId.mockReturnValue(opId);
    mockClaimOperation.mockResolvedValue({
      claimed: false,
      operation: { state: "succeeded", lastFailure: undefined },
    });

    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "user@example.com",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("delivered");
    expect(mockClaimOperation).toHaveBeenCalledTimes(1);
    expect(mockStartOperationAttempt).not.toHaveBeenCalled();
  });

  it("returns pending when operation is in progress", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const opId = "email:test:entity";
    mockCreateEmailOperationId.mockReturnValue(opId);
    mockClaimOperation.mockResolvedValue({
      claimed: false,
      operation: { state: "pending", lastFailure: undefined },
    });

    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "user@example.com",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("pending");
  });

  it("sends and records a successful delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("success") }));

    const opId = "email:test:entity";
    mockCreateEmailOperationId.mockReturnValue(opId);
    mockClaimOperation.mockResolvedValue({
      claimed: true,
      operation: { state: "pending", opId },
    });
    mockStartOperationAttempt.mockResolvedValue({
      attemptId: "000001",
      state: "pending",
    });
    mockCompleteOperationAttempt.mockResolvedValue({});

    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "user@example.com",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("delivered");
    expect(mockCompleteOperationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "succeeded",
        providerId: "resend_msg_abc123",
      }),
      expect.anything(),
    );
  });

  it("records failure when Resend returns 4xx", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    vi.doMock("resend", () => ({ Resend: createFakeResend("error-4xx") }));

    const opId = "email:test:entity";
    mockCreateEmailOperationId.mockReturnValue(opId);
    mockClaimOperation.mockResolvedValue({
      claimed: true,
      operation: { state: "pending", opId },
    });
    mockStartOperationAttempt.mockResolvedValue({
      attemptId: "000001",
      state: "pending",
    });
    mockCompleteOperationAttempt.mockResolvedValue({});

    const { sendWithLedger } = await import("@/lib/comms/send");
    const result = await sendWithLedger({
      firestore: fakeFirestore,
      businessId: "biz-1",
      to: "user@example.com",
      subject: "S",
      html: "<p>H</p>",
      messageType: "test",
      entityId: "entity",
      entityRef: { collection: "test", id: "entity" },
    });
    expect(result).toBe("failed");
    expect(mockCompleteOperationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "failed",
        failure: expect.objectContaining({
          classification: "terminal",
          code: "provider_400",
        }),
      }),
      expect.anything(),
    );
  });
});

describe("subject format convention", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("buildCrewAssignmentEmail uses [Assignment] prefix", async () => {
    const { buildCrewAssignmentEmail } = await import("@/lib/notify");
    const result = buildCrewAssignmentEmail({
      brand: { businessName: "Test Co" },
      crewName: "Carlos Crew",
      jobTitle: "Roof repair",
      when: "Monday, July 28",
      address: "123 Main St",
      clientName: "Jordan Blake",
    });
    expect(result.subject).toMatch(/^\[Assignment\] /);
    expect(result.subject).toMatch(/\u2014/);
  });

  it("buildCustomerConfirmationEmail uses [Appointment] prefix", async () => {
    const { buildCustomerConfirmationEmail } = await import("@/lib/notify");
    const result = buildCustomerConfirmationEmail({
      brand: { businessName: "Test Co" },
      clientName: "Priya Shah",
      serviceType: "AC repair",
      when: "Tuesday, July 29",
      address: "88 Brickell Ave",
    });
    expect(result.subject).toMatch(/^\[Appointment\] Confirmed/);
  });

  it("buildBusinessWelcomeEmail uses [Luxor AI] prefix", async () => {
    const { buildBusinessWelcomeEmail } = await import("@/lib/notify");
    const result = buildBusinessWelcomeEmail({
      brandName: "Test Co",
      ownerEmail: "owner@test.com",
      resetLink: "https://example.com/reset",
    });
    expect(result.subject).toMatch(/^\[Luxor AI\] /);
  });

  it("buildFeedbackEmail uses [Feedback] prefix", async () => {
    const { buildFeedbackEmail } = await import("@/lib/notify");
    const result = buildFeedbackEmail({
      businessName: "Test Co",
      submitterName: "Jordan",
      submitterEmail: "jordan@test.com",
      businessId: "test-123",
      message: "Great app, needs dark mode.",
    });
    expect(result.subject).toMatch(/^\[Feedback\] /);
  });
});

describe("isCommsConfigured", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when both RESEND_API_KEY and RESEND_FROM are set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const { isCommsConfigured } = await import("@/lib/comms/send");
    expect(isCommsConfigured()).toBe(true);
  });

  it("returns false when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    const { isCommsConfigured } = await import("@/lib/comms/send");
    expect(isCommsConfigured()).toBe(false);
  });

  it("returns false when RESEND_FROM is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const { isCommsConfigured } = await import("@/lib/comms/send");
    expect(isCommsConfigured()).toBe(false);
  });
});
