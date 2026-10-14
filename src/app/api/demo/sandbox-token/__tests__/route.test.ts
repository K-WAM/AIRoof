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
const mockEnsureSandbox = vi.fn();

function createFakeAuth() {
  return {
    getUserByEmail: mockGetUserByEmail,
    createUser: mockCreateUser,
    createCustomToken: mockCreateCustomToken,
  };
}

let firestore: FakeFirestore;

function postRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/demo/sandbox-token", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("/api/demo/sandbox-token", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUserByEmail.mockReset();
    mockCreateUser.mockReset();
    mockCreateCustomToken.mockReset();
    mockCreateCustomToken.mockResolvedValue("fake-custom-token");
    mockEnsureSandbox.mockReset().mockResolvedValue(true);
    _resetRateLimitState();

    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => createFakeAuth()),
      getAdminFirestore: vi.fn(() => firestore),
    }));

    vi.doMock("@/lib/verticals/sandboxBusiness", () => ({
      ensureSandboxBusiness: mockEnsureSandbox,
      isVerticalId: (v: unknown) => v === "roofing" || v === "dental",
      sandboxBusinessId: (v: string) => `demo-try-${v}`,
    }));
    firestore.seed("businesses/demo-try-roofing", { isDemo: true, businessName: "Apex Roofing South Florida" });
  });

  it.each([null, [], { vertical: "demo-roofing" }, { vertical: "real-client" }, { vertical: 7 }])("refuses unsupported public targets: %j", async (body) => {
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    expect((await POST(postRequest(body))).status).toBe(400);
    expect(mockEnsureSandbox).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("refuses a failed sample seed rather than falling back to live calls", async () => {
    mockEnsureSandbox.mockResolvedValue(false);
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    expect((await POST(postRequest())).status).toBe(503);
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("refuses when the target business is missing", async () => {
    firestore.documents.delete("businesses/demo-try-roofing");
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    expect(res.status).toBe(503);
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("refuses when the target business isn't marked isDemo — this route can never touch a real tenant", async () => {
    firestore.seed("businesses/demo-try-roofing", { isDemo: false, businessName: "Apex Roofing South Florida" });
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    expect(res.status).toBe(503);
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it("older links create a sample viewer, never an identity on the live line", async () => {
    mockGetUserByEmail.mockRejectedValue(new Error("no such user"));
    mockCreateUser.mockResolvedValue({ uid: "sandbox-uid" });

    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    const res = await POST(postRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBe("fake-custom-token");
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sandbox-roofing@luxordev.com" })
    );
    const stored = firestore.documents.get("businessUsers/sandbox-uid");
    expect(stored).toMatchObject({
      businessId: "demo-try-roofing",
      role: "viewer",
      active: true,
      isSandboxVisitor: true,
    });
    expect(mockCreateCustomToken).toHaveBeenCalledWith("sandbox-uid");
    expect(mockEnsureSandbox).toHaveBeenCalledWith(firestore, "roofing");
  });

  it("a supplied business id cannot redirect the default sample into a live tenant", async () => {
    mockGetUserByEmail.mockResolvedValue({ uid: "sandbox-uid" });
    const { POST } = await import("@/app/api/demo/sandbox-token/route");
    expect((await POST(postRequest({ businessId: "demo-roofing" }))).status).toBe(200);
    expect(firestore.documents.get("businessUsers/sandbox-uid")?.businessId).toBe("demo-try-roofing");
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
