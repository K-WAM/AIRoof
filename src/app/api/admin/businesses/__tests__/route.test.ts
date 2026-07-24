import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;

class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined,
  ) {}

  get id() {
    return this.ref.id;
  }

  get exists() {
    return this.value !== undefined;
  }

  data() {
    return this.value ? { ...this.value } : undefined;
  }
}

class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  async get() {
    return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path));
  }

  async set(value: StoredDocument) {
    this.firestore.documents.set(this.path, { ...value });
  }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];

  constructor(private readonly firestore: FakeFirestore) {}

  get(reference: FakeDocumentReference) {
    return reference.get();
  }

  set(reference: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => this.firestore.documents.set(reference.path, { ...value }));
  }

  commit() {
    this.writes.forEach((write) => write());
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;

  collection(name: string) {
    const coll = new FakeCollectionReference(this, name);
    coll.doc = (id?: string) =>
      new FakeDocumentReference(this, `${name}/${id ?? `auto-${this.nextId++}`}`);
    return coll;
  }

  runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const transaction = new FakeTransaction(this);
    return callback(transaction as unknown as FakeTransaction).then((result) => {
      transaction.commit();
      return result;
    });
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {}

  doc(id?: string) {
    return new FakeDocumentReference(
      this.firestore,
      `${this.path}/${id ?? `auto-${this.firestore.nextId++}`}`,
    );
  }
}

const mockSendBusinessWelcome = vi.hoisted(() => vi.fn());
const mockGeneratePasswordResetLink = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockVerifySuperadmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notify", () => ({
  sendBusinessWelcomeEmail: mockSendBusinessWelcome,
  buildBusinessWelcomeEmail: vi.fn(() => ({
    subject: "[Luxor AI] Your Test Biz account is ready",
    html: "<p>mock html</p>",
  })),
  buildCrewAssignmentEmail: vi.fn(),
  buildCustomerConfirmationEmail: vi.fn(),
  sendCrewAssignment: vi.fn(),
  sendCustomerConfirmation: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifySuperadmin: mockVerifySuperadmin,
}));

function createFakeFirestore(): FakeFirestore {
  return new FakeFirestore();
}

function createFakeAuth() {
  return {
    createUser: mockCreateUser,
    generatePasswordResetLink: mockGeneratePasswordResetLink,
  };
}

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/businesses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  businessId: "test-biz",
  businessName: "Test Biz",
  industry: "general-contracting",
  ownerEmail: "owner@luxordev.com",
  serviceArea: "NYC",
};

describe("POST /api/admin/businesses — welcome email", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSendBusinessWelcome.mockReset();
    mockGeneratePasswordResetLink.mockReset();
    mockCreateUser.mockReset();
    mockVerifySuperadmin.mockReset();

    const auth = createFakeAuth();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => auth),
      getAdminFirestore: vi.fn(() => createFakeFirestore()),
    }));

    mockVerifySuperadmin.mockResolvedValue({ uid: "admin-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends welcome email when ownerEmail is present and Resend is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    mockCreateUser.mockResolvedValue({
      uid: "user-1",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockResolvedValue(
      "https://luxor-dev.firebaseapp.com/__/auth/action?mode=resetPassword",
    );
    mockSendBusinessWelcome.mockResolvedValue({
      status: "delivered",
      providerId: "msg_abc",
    });

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.welcomeEmail).toBeDefined();
    expect(body.welcomeEmail.status).toBe("sent");
    expect(mockGeneratePasswordResetLink).toHaveBeenCalledWith("owner@luxordev.com");
    expect(mockSendBusinessWelcome).toHaveBeenCalledTimes(1);
    expect(mockSendBusinessWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@luxordev.com",
        brandName: "Test Biz",
      }),
    );
  });

  it("returns not_configured when Resend env vars are missing", async () => {
    mockCreateUser.mockResolvedValue({
      uid: "user-2",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockResolvedValue(
      "https://luxor-dev.firebaseapp.com/__/auth/action?mode=resetPassword",
    );
    mockSendBusinessWelcome.mockResolvedValue({ status: "unconfigured" });

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.welcomeEmail).toBeDefined();
    expect(body.welcomeEmail.status).toBe("not_configured");
  });

  it("skips welcome email when ownerEmail is missing and still creates business", async () => {
    mockCreateUser.mockResolvedValue(null);

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const bodyWithoutEmail = { ...validBody };
    delete bodyWithoutEmail.ownerEmail;
    const request = createRequest(bodyWithoutEmail);
    const response = await freshPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.welcomeEmail).toBeUndefined();
    expect(mockGeneratePasswordResetLink).not.toHaveBeenCalled();
    expect(mockSendBusinessWelcome).not.toHaveBeenCalled();
  });

  it("surfaces generatePasswordResetLink failure in welcomeEmail", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    mockCreateUser.mockResolvedValue({
      uid: "user-3",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockRejectedValue(
      new Error("Firebase project not configured for email"),
    );

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.welcomeEmail).toBeDefined();
    expect(body.welcomeEmail.status).toBe("failed");
    expect(body.welcomeEmail.reason).toBe("Could not generate password reset link");
    expect(mockSendBusinessWelcome).not.toHaveBeenCalled();
  });

  it("does not rollback Firestore when welcome email send fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    mockCreateUser.mockResolvedValue({
      uid: "user-4",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockResolvedValue(
      "https://luxor-dev.firebaseapp.com/__/auth/action?mode=resetPassword",
    );
    mockSendBusinessWelcome.mockResolvedValue({
      status: "failed",
      failureCode: "provider_503",
      failureClassification: "retryable",
    });

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.businessId).toBe("test-biz");
    expect(body.welcomeEmail).toBeDefined();
    expect(body.welcomeEmail.status).toBe("failed");
    expect(body.welcomeEmail.reason).toBe("provider_503");
  });

  it("returns tempPassword in response for superadmin relay but never in email-related fields", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    mockCreateUser.mockResolvedValue({
      uid: "user-5",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockResolvedValue(
      "https://luxor-dev.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=test",
    );
    mockSendBusinessWelcome.mockResolvedValue({
      status: "delivered",
      providerId: "msg_abc",
    });

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();

    expect(body.tempPassword).toBeDefined();
    const json = JSON.stringify(body);
    expect(json).not.toContain(body.tempPassword + "@"); // not leaked anywhere else
    expect(body.welcomeEmail?.reason).toBeUndefined(); // sent path has no error reason
  });

  it("never exposes the password reset link in the API response", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "no-reply@luxordev.com");
    mockCreateUser.mockResolvedValue({
      uid: "user-6",
      email: "owner@luxordev.com",
    });
    mockGeneratePasswordResetLink.mockResolvedValue(
      "https://luxor-dev.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=SECRET_CODE",
    );
    mockSendBusinessWelcome.mockResolvedValue({
      status: "delivered",
      providerId: "msg_abc",
    });

    const { POST: freshPost } = await import("@/app/api/admin/businesses/route");
    const request = createRequest(validBody);
    const response = await freshPost(request);
    const body = await response.json();
    const json = JSON.stringify(body);

    expect(json).not.toContain("SECRET_CODE");
    expect(json).not.toContain("resetPassword");
  });
});
