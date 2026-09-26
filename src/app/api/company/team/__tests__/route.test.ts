import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;
type QueryFilter = [field: string, operator: string, expected: unknown];

class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined
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

class FakeQuery {
  readonly filters: QueryFilter[] = [];

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string
  ) {}

  where(field: string, operator: string, expected: unknown) {
    this.filters.push([field, operator, expected]);
    return this;
  }

  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    const matches = [...this.firestore.documents.entries()]
      .filter(
        ([path]) => path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          throw new Error(`Unsupported fake query operator: ${operator}`);
        })
      );

    return {
      docs: matches.map(
        ([path, data]) => new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, path), data)
      ),
      empty: matches.length === 0,
      size: matches.length,
    };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id?: string) {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id ?? `auto-${this.firestore.nextId++}`}`);
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
    return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path));
  }

  async set(value: StoredDocument, opts?: { merge?: boolean }) {
    if (opts?.merge) {
      const current = this.firestore.documents.get(this.path) ?? {};
      this.firestore.documents.set(this.path, { ...current, ...value });
    } else {
      this.firestore.documents.set(this.path, { ...value });
    }
  }

  async update(value: StoredDocument) {
    const current = this.firestore.documents.get(this.path);
    if (!current) throw new Error(`Document does not exist: ${this.path}`);
    this.firestore.documents.set(this.path, { ...current, ...value });
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  seed(path: string, value: StoredDocument) {
    this.documents.set(path, { ...value });
  }
}

const mockVerifyAuthAndRole = vi.hoisted(() => vi.fn());
const mockSendTeamInviteEmail = vi.hoisted(() => vi.fn());
const mockGetUserByEmail = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockGeneratePasswordResetLink = vi.hoisted(() => vi.fn());
const mockGetUsers = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockRevokeRefreshTokens = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mockVerifyAuthAndRole,
}));
vi.mock("@/lib/notify", () => ({
  sendTeamInviteEmail: mockSendTeamInviteEmail,
}));

let firestore: FakeFirestore;

function createFakeAuth() {
  return {
    getUserByEmail: mockGetUserByEmail,
    createUser: mockCreateUser,
    generatePasswordResetLink: mockGeneratePasswordResetLink,
    getUsers: mockGetUsers,
    updateUser: mockUpdateUser,
    revokeRefreshTokens: mockRevokeRefreshTokens,
  };
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/company/team", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(businessId: string): NextRequest {
  return new NextRequest(`http://localhost/api/company/team?businessId=${businessId}`);
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/company/team/some-uid", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const OWNER_GATE = { user: { uid: "owner-1", email: "owner@biz.com", superadmin: false, role: "owner" as const, businessId: "biz-1" } };

describe("/api/company/team", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifyAuthAndRole.mockReset();
    mockSendTeamInviteEmail.mockReset();
    mockGetUserByEmail.mockReset();
    mockCreateUser.mockReset();
    mockGeneratePasswordResetLink.mockReset();
    mockGetUsers.mockReset().mockResolvedValue({ users: [] });
    mockUpdateUser.mockReset().mockResolvedValue({});
    mockRevokeRefreshTokens.mockReset().mockResolvedValue(undefined);

    firestore = new FakeFirestore();
    const auth = createFakeAuth();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => auth),
      getAdminFirestore: vi.fn(() => firestore),
    }));

    firestore.seed("businesses/biz-1", { businessName: "Biz One" });
    mockVerifyAuthAndRole.mockResolvedValue(OWNER_GATE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET", () => {
    it("derives Invited and Active from Auth last sign-in and Locked from membership", async () => {
      firestore.seed("businessUsers/new", { businessId: "biz-1", email: "new@example.com", role: "staff", active: true });
      firestore.seed("businessUsers/seen", { businessId: "biz-1", email: "seen@example.com", role: "staff", active: true });
      firestore.seed("businessUsers/locked", { businessId: "biz-1", email: "locked@example.com", role: "viewer", active: false });
      mockGetUsers.mockResolvedValue({ users: [
        { uid: "new", metadata: { lastSignInTime: null } },
        { uid: "seen", metadata: { lastSignInTime: "2026-09-25T12:00:00Z" } },
        { uid: "locked", metadata: { lastSignInTime: "2026-09-24T12:00:00Z" } },
      ] });
      const { GET } = await import("@/app/api/company/team/route");
      const { members } = await (await GET(getRequest("biz-1"))).json();
      expect(members.map((m: { status: string }) => m.status)).toEqual(["Invited", "Active", "Locked"]);
      expect(mockGetUsers).toHaveBeenCalledOnce();
    });
    it("returns 400 without businessId", async () => {
      const { GET } = await import("@/app/api/company/team/route");
      const res = await GET(new NextRequest("http://localhost/api/company/team"));
      expect(res.status).toBe(400);
    });

    it("is gated to owner/superadmin", async () => {
      mockVerifyAuthAndRole.mockResolvedValue({
        error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
      });
      const { GET } = await import("@/app/api/company/team/route");
      const res = await GET(getRequest("biz-1"));
      expect(res.status).toBe(403);
    });

    it("lists members sorted by createdAt", async () => {
      firestore.seed("businessUsers/u2", { uid: "u2", businessId: "biz-1", email: "b@biz.com", role: "staff", active: true, createdAt: 200 });
      firestore.seed("businessUsers/u1", { uid: "u1", businessId: "biz-1", email: "a@biz.com", role: "owner", active: true, createdAt: 100 });
      firestore.seed("businessUsers/u3", { uid: "u3", businessId: "other-biz", email: "c@other.com", role: "owner", active: true, createdAt: 50 });

      const { GET } = await import("@/app/api/company/team/route");
      const res = await GET(getRequest("biz-1"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.members.map((m: { email: string }) => m.email)).toEqual(["a@biz.com", "b@biz.com"]);
    });
  });

  describe("POST", () => {
    const validBody = { businessId: "biz-1", email: "newhire@biz.com", role: "staff" };

    it("rejects an invalid role", async () => {
      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest({ ...validBody, role: "admin" }));
      expect(res.status).toBe(400);
    });

    it("creates a new Auth user, writes an active businessUsers doc, and emails the invite", async () => {
      mockGetUserByEmail.mockRejectedValue(new Error("no such user"));
      mockCreateUser.mockResolvedValue({ uid: "new-uid" });
      mockGeneratePasswordResetLink.mockResolvedValue("https://example.com/reset");
      mockSendTeamInviteEmail.mockResolvedValue({ status: "delivered" });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.invite.status).toBe("sent");
      const stored = firestore.documents.get("businessUsers/new-uid");
      expect(stored).toMatchObject({ businessId: "biz-1", email: "newhire@biz.com", role: "staff", active: true });
      expect(mockSendTeamInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "newhire@biz.com", role: "staff" })
      );
    });

    it("blocks inviting a platform superadmin's email", async () => {
      mockGetUserByEmail.mockResolvedValue({ uid: "admin-uid", customClaims: { superadmin: true } });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(409);
      expect(firestore.documents.has("businessUsers/admin-uid")).toBe(false);
    });

    it("blocks inviting someone who already belongs to a different business", async () => {
      mockGetUserByEmail.mockResolvedValue({ uid: "cross-tenant-uid", customClaims: {} });
      firestore.seed("businessUsers/cross-tenant-uid", { businessId: "other-biz", role: "owner", active: true });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(409);
    });

    it("rejects re-inviting someone already active on this business", async () => {
      mockGetUserByEmail.mockResolvedValue({ uid: "existing-uid", customClaims: {} });
      firestore.seed("businessUsers/existing-uid", { businessId: "biz-1", role: "staff", active: true });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(409);
    });

    it("rejects a new invite once the business's seatLimit is reached", async () => {
      firestore.seed("businesses/biz-1", { businessName: "Biz One", seatLimit: 1 });
      firestore.seed("businessUsers/existing-owner", { businessId: "biz-1", role: "owner", active: true });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/seat limit/i);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("falls back to the default seat limit when unset", async () => {
      // 4 active members already on a business with no explicit seatLimit (default 5) — still room for one more.
      for (const n of [1, 2, 3, 4]) {
        firestore.seed(`businessUsers/m${n}`, { businessId: "biz-1", role: "staff", active: true });
      }
      mockGetUserByEmail.mockRejectedValue(new Error("no such user"));
      mockCreateUser.mockResolvedValue({ uid: "new-uid" });
      mockGeneratePasswordResetLink.mockResolvedValue("https://example.com/reset");
      mockSendTeamInviteEmail.mockResolvedValue({ status: "delivered" });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(200);
    });

    it("reactivates a previously-removed member on the same business", async () => {
      mockGetUserByEmail.mockResolvedValue({ uid: "returning-uid", customClaims: {}, disabled: true });
      firestore.seed("businessUsers/returning-uid", { businessId: "biz-1", role: "viewer", active: false });
      mockGeneratePasswordResetLink.mockResolvedValue("https://example.com/reset");
      mockSendTeamInviteEmail.mockResolvedValue({ status: "delivered" });

      const { POST } = await import("@/app/api/company/team/route");
      const res = await POST(postRequest({ ...validBody, role: "owner" }));
      expect(res.status).toBe(200);
      const stored = firestore.documents.get("businessUsers/returning-uid");
      expect(stored).toMatchObject({ active: true, role: "owner" });
      expect(mockUpdateUser).toHaveBeenCalledWith("returning-uid", { disabled: false });
    });
  });
});

describe("/api/company/team/[uid]", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifyAuthAndRole.mockReset();
    mockUpdateUser.mockReset().mockResolvedValue({});
    mockRevokeRefreshTokens.mockReset().mockResolvedValue(undefined);
    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => createFakeAuth()),
      getAdminFirestore: vi.fn(() => firestore),
    }));
    mockVerifyAuthAndRole.mockResolvedValue(OWNER_GATE);
  });

  it("404s for a member outside the given business", async () => {
    firestore.seed("businessUsers/target", { businessId: "other-biz", role: "staff", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    const res = await PATCH(patchRequest({ businessId: "biz-1", role: "owner" }), {
      params: Promise.resolve({ uid: "target" }),
    });
    expect(res.status).toBe(404);
  });

  it("blocks demoting the last active owner", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "owner", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    const res = await PATCH(patchRequest({ businessId: "biz-1", role: "staff" }), {
      params: Promise.resolve({ uid: "target" }),
    });
    expect(res.status).toBe(400);
    const stored = firestore.documents.get("businessUsers/target");
    expect(stored?.role).toBe("owner");
  });

  it("blocks deactivating the last active owner", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "owner", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    const res = await PATCH(patchRequest({ businessId: "biz-1", active: false }), {
      params: Promise.resolve({ uid: "target" }),
    });
    expect(res.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("locks a member in Firestore and Auth and revokes refresh tokens", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "staff", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    expect((await PATCH(patchRequest({ businessId: "biz-1", active: false }), { params: Promise.resolve({ uid: "target" }) })).status).toBe(200);
    expect(firestore.documents.get("businessUsers/target")).toMatchObject({ active: false, lockedBy: "owner-1", lockedAt: expect.any(Number) });
    expect(mockUpdateUser).toHaveBeenCalledWith("target", { disabled: true });
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith("target");
  });

  it("unlocks a member in Firestore and Auth", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "staff", active: false, lockedAt: 100, lockedBy: "owner-1" });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    expect((await PATCH(patchRequest({ businessId: "biz-1", active: true }), { params: Promise.resolve({ uid: "target" }) })).status).toBe(200);
    expect(firestore.documents.get("businessUsers/target")).toMatchObject({ active: true, lockedAt: null, lockedBy: null });
    expect(mockUpdateUser).toHaveBeenCalledWith("target", { disabled: false });
  });

  it("allows demoting an owner when another active owner remains", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "owner", active: true });
    firestore.seed("businessUsers/other-owner", { businessId: "biz-1", role: "owner", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    const res = await PATCH(patchRequest({ businessId: "biz-1", role: "staff" }), {
      params: Promise.resolve({ uid: "target" }),
    });
    expect(res.status).toBe(200);
    expect(firestore.documents.get("businessUsers/target")?.role).toBe("staff");
  });

  it("allows a role change for a non-owner", async () => {
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "viewer", active: true });
    const { PATCH } = await import("@/app/api/company/team/[uid]/route");
    const res = await PATCH(patchRequest({ businessId: "biz-1", role: "staff" }), {
      params: Promise.resolve({ uid: "target" }),
    });
    expect(res.status).toBe(200);
    expect(firestore.documents.get("businessUsers/target")?.role).toBe("staff");
  });
});

describe("Team follow-up actions", () => {
  beforeEach(() => {
    vi.resetModules();
    firestore = new FakeFirestore();
    firestore.seed("businesses/biz-1", { businessName: "Biz One", fieldKey: "old-field-key-0123456789" });
    firestore.seed("businessUsers/target", { businessId: "biz-1", role: "staff", email: "target@example.com", active: true });
    mockVerifyAuthAndRole.mockReset().mockResolvedValue(OWNER_GATE);
    mockGeneratePasswordResetLink.mockReset().mockResolvedValue("https://example.test/reset");
    mockSendTeamInviteEmail.mockReset().mockResolvedValue({ status: "delivered" });
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => createFakeAuth()),
      getAdminFirestore: vi.fn(() => firestore),
    }));
  });

  it("resends an invite only to an active member of this business", async () => {
    const { POST } = await import("@/app/api/company/team/[uid]/resend/route");
    const context = { params: Promise.resolve({ uid: "target" }) };
    expect((await POST(postRequest({ businessId: "biz-1" }), context)).status).toBe(200);
    expect(mockSendTeamInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "target@example.com" }));
    firestore.seed("businessUsers/target", { businessId: "other", role: "staff", email: "target@example.com", active: true });
    expect((await POST(postRequest({ businessId: "biz-1" }), context)).status).toBe(404);
  });

  it("rotates the business field key only for an owner", async () => {
    const { POST } = await import("@/app/api/company/team/revoke-field-links/route");
    mockVerifyAuthAndRole.mockResolvedValueOnce({ error: new Response("Forbidden", { status: 403 }) });
    expect((await POST(postRequest({ businessId: "biz-1" }))).status).toBe(403);
    expect(firestore.documents.get("businesses/biz-1")?.fieldKey).toBe("old-field-key-0123456789");
    expect((await POST(postRequest({ businessId: "biz-1" }))).status).toBe(200);
    expect(firestore.documents.get("businesses/biz-1")?.fieldKey).not.toBe("old-field-key-0123456789");
  });
});
