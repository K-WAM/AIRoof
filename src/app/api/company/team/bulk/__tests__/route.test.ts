import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;
type QueryFilter = [field: string, operator: string, expected: unknown];

class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined
  ) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeQuery {
  readonly filters: QueryFilter[] = [];
  constructor(protected readonly firestore: FakeFirestore, readonly path: string) {}
  where(field: string, operator: string, expected: unknown) {
    this.filters.push([field, operator, expected]);
    return this;
  }
  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    const matches = [...this.firestore.documents.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments)
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          throw new Error(`Unsupported fake query operator: ${operator}`);
        })
      );
    return {
      docs: matches.map(([path, data]) => new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, path), data)),
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
  constructor(private readonly firestore: FakeFirestore, readonly path: string) {
    this.id = path.split("/").at(-1) ?? "";
  }
  async get() { return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path)); }
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
  collection(name: string) { return new FakeCollectionReference(this, name); }
  seed(path: string, value: StoredDocument) { this.documents.set(path, { ...value }); }
}

const mockVerifyAuthAndRole = vi.hoisted(() => vi.fn());
const mockSendTeamInviteEmail = vi.hoisted(() => vi.fn());
const mockGetUserByEmail = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());
const mockGeneratePasswordResetLink = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mockVerifyAuthAndRole }));
vi.mock("@/lib/notify", () => ({ sendTeamInviteEmail: mockSendTeamInviteEmail }));

let firestore: FakeFirestore;
let autoUid = 1;

function createFakeAuth() {
  return {
    getUserByEmail: mockGetUserByEmail,
    createUser: mockCreateUser,
    generatePasswordResetLink: mockGeneratePasswordResetLink,
  };
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/company/team/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const OWNER_GATE = { user: { uid: "owner-1", email: "owner@biz.com", superadmin: false, role: "owner" as const, businessId: "biz-1" } };

describe("/api/company/team/bulk", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifyAuthAndRole.mockReset();
    mockSendTeamInviteEmail.mockReset();
    mockGetUserByEmail.mockReset();
    mockCreateUser.mockReset();
    mockGeneratePasswordResetLink.mockReset();
    autoUid = 1;

    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({
      getAdminAuth: vi.fn(() => createFakeAuth()),
      getAdminFirestore: vi.fn(() => firestore),
    }));

    firestore.seed("businesses/biz-1", { businessName: "Biz One", seatLimit: 2 });
    mockVerifyAuthAndRole.mockResolvedValue(OWNER_GATE);

    // Every unseen email is a fresh Auth user; reset-link + email delivery always succeed.
    mockGetUserByEmail.mockRejectedValue(new Error("no such user"));
    mockCreateUser.mockImplementation(async ({ email }: { email: string }) => ({ uid: `uid-${autoUid++}-${email}` }));
    mockGeneratePasswordResetLink.mockResolvedValue("https://example.com/reset");
    mockSendTeamInviteEmail.mockResolvedValue({ status: "delivered" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires businessId and a non-empty rows array", async () => {
    const { POST } = await import("@/app/api/company/team/bulk/route");
    expect((await POST(postRequest({ rows: [{ email: "a@b.com" }] }))).status).toBe(400);
    expect((await POST(postRequest({ businessId: "biz-1", rows: [] }))).status).toBe(400);
  });

  it("invites every row up to the seat limit, then reports seat_limit for the rest", async () => {
    const { POST } = await import("@/app/api/company/team/bulk/route");
    const res = await POST(postRequest({
      businessId: "biz-1",
      rows: [
        { email: "a@biz.com", role: "staff" },
        { email: "b@biz.com", role: "staff" },
        { email: "c@biz.com", role: "staff" },
      ],
    }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.map((r: { status: string }) => r.status)).toEqual(["invited", "invited", "seat_limit"]);
    expect(mockCreateUser).toHaveBeenCalledTimes(2);
  });

  it("reports invalid rows without creating an Auth user", async () => {
    const { POST } = await import("@/app/api/company/team/bulk/route");
    const res = await POST(postRequest({
      businessId: "biz-1",
      rows: [{ email: "not-an-email" }, { email: "" }],
    }));
    const { results } = await res.json();
    expect(results.every((r: { status: string }) => r.status === "invalid")).toBe(true);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("defaults a blank role to staff", async () => {
    const { POST } = await import("@/app/api/company/team/bulk/route");
    const res = await POST(postRequest({ businessId: "biz-1", rows: [{ email: "new@biz.com", role: "" }] }));
    const { results } = await res.json();
    expect(results[0]).toMatchObject({ status: "invited", role: "staff" });
  });

  it("is gated to owner/superadmin", async () => {
    mockVerifyAuthAndRole.mockResolvedValue({ error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const { POST } = await import("@/app/api/company/team/bulk/route");
    const res = await POST(postRequest({ businessId: "biz-1", rows: [{ email: "a@biz.com" }] }));
    expect(res.status).toBe(403);
  });
});
