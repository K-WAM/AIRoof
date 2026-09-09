import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";

type StoredDocument = Record<string, unknown>;

class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: StoredDocument | undefined
  ) {}
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
    readonly path: string
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }
  async get() {
    return new FakeDocumentSnapshot(this.id, this.firestore.documents.get(this.path));
  }
  async set(value: StoredDocument, opts?: { merge?: boolean }) {
    if (opts?.merge) {
      const current = this.firestore.documents.get(this.path) ?? {};
      this.firestore.documents.set(this.path, { ...current, ...value });
    } else {
      this.firestore.documents.set(this.path, { ...value });
    }
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string
  ) {}
  doc(id: string) {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`);
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }
  seed(path: string, value: StoredDocument) {
    this.documents.set(path, { ...value });
  }
}

const mockGetUserByEmail = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateCustomToken = vi.fn();

function createFakeAuth() {
  return {
    getUserByEmail: mockGetUserByEmail,
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
  };
}

let firestore: FakeFirestore;

function postRequest(): NextRequest {
  return new NextRequest("http://localhost/api/demo/sandbox-token", { method: "POST" });
}

describe("/api/demo/sandbox-token", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUserByEmail.mockReset();
    mockCreateUser.mockReset();
    mockCreateCustomToken.mockReset();
    mockCreateCustomToken.mockResolvedValue("fake-custom-token");
    _resetRateLimitState();

    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => createFakeAuth()),
      getAdminFirestore: vi.fn(() => firestore),
    }));

    firestore.seed("businesses/demo-roofing", { isDemo: true, businessName: "Apex Roofing South Florida" });
  });

  it("refuses when the target business is missing", async () => {
    firestore.documents.delete("businesses/demo-roofing");
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    expect(res.status).toBe(503);
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("refuses when the target business isn't marked isDemo — this route can never touch a real tenant", async () => {
    firestore.seed("businesses/demo-roofing", { isDemo: false, businessName: "Apex Roofing South Florida" });
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    expect(res.status).toBe(503);
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("creates the shared sandbox visitor as a read-only viewer and mints a token", async () => {
    mockGetUserByEmail.mockRejectedValue(new Error("no such user"));
    mockCreateUser.mockResolvedValue({ uid: "sandbox-uid" });

    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBe("fake-custom-token");
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sandbox-visitor@luxordev.com" })
    );
    const stored = firestore.documents.get("businessUsers/sandbox-uid");
    expect(stored).toMatchObject({
      businessId: "demo-roofing",
      role: "viewer",
      active: true,
      isSandboxVisitor: true,
    });
    expect(mockCreateCustomToken).toHaveBeenCalledWith("sandbox-uid");
  });

  it("reuses the existing sandbox Auth user instead of creating a second one", async () => {
    mockGetUserByEmail.mockResolvedValue({ uid: "existing-sandbox-uid" });

    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());

    expect(res.status).toBe(200);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).toHaveBeenCalledWith("existing-sandbox-uid");
    expect(firestore.documents.get("businessUsers/existing-sandbox-uid")).toMatchObject({
      role: "viewer",
      active: true,
    });
  });

  it("rate-limits repeated requests from the same IP", async () => {
    mockGetUserByEmail.mockResolvedValue({ uid: "existing-sandbox-uid" });
    const { POST } = await import("@/app/api/demo/sandbox-token/route");

    let lastStatus = 200;
    for (let i = 0; i < 25; i++) {
      const res = await POST(postRequest());
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
