import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;

// Simulates FieldValue.delete()'s real semantics (actually removes the key) —
// distinct from a plain `undefined`, which ignoreUndefinedProperties strips
// from the write instead of clearing the stored field.
const DELETE_SENTINEL = vi.hoisted(() => Symbol("field-delete"));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { delete: () => DELETE_SENTINEL },
}));

class FakeDocumentSnapshot {
  constructor(readonly ref: FakeDocumentReference, private readonly value: StoredDocument | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeDocumentReference {
  readonly id: string;
  constructor(private readonly firestore: FakeFirestore, readonly path: string) {
    this.id = path.split("/").at(-1) ?? "";
  }
  async get() { return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path)); }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];
  constructor(private readonly firestore: FakeFirestore) {}
  async get(ref: FakeDocumentReference) { return ref.get(); }
  update(ref: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => {
      const current = this.firestore.documents.get(ref.path);
      if (!current) throw new Error(`Document does not exist: ${ref.path}`);
      const merged: StoredDocument = { ...current };
      for (const [key, val] of Object.entries(value)) {
        if (val === DELETE_SENTINEL) delete merged[key];
        else merged[key] = val;
      }
      this.firestore.documents.set(ref.path, merged);
    });
  }
  set(ref: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => this.firestore.documents.set(ref.path, { ...value }));
  }
  commit() { this.writes.forEach((w) => w()); }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;
  collection(name: string) {
    return { doc: (id?: string) => new FakeDocumentReference(this, `${name}/${id ?? `auto-${this.nextId++}`}`) };
  }
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }
  seed(path: string, value: StoredDocument) { this.documents.set(path, { ...value }); }
}

const mockVerifySuperadmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: mockVerifySuperadmin }));

let firestore: FakeFirestore;

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/businesses/biz-1/subscription", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/admin/businesses/[businessId]/subscription", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifySuperadmin.mockReset();
    firestore = new FakeFirestore();
    vi.doMock("@/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn(() => firestore) }));
    firestore.seed("businesses/biz-1", { businessName: "Biz One", subscriptionStatus: "active" });
    mockVerifySuperadmin.mockResolvedValue({ user: { uid: "admin-1", email: "connect@luxordev.com", superadmin: true } });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("is superadmin-gated", async () => {
    mockVerifySuperadmin.mockResolvedValue({ error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const { POST } = await import("@/app/api/admin/businesses/[businessId]/subscription/route");
    const res = await POST(postRequest({ action: "pause" }), { params: Promise.resolve({ businessId: "biz-1" }) });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid action", async () => {
    const { POST } = await import("@/app/api/admin/businesses/[businessId]/subscription/route");
    const res = await POST(postRequest({ action: "delete" }), { params: Promise.resolve({ businessId: "biz-1" }) });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown business", async () => {
    const { POST } = await import("@/app/api/admin/businesses/[businessId]/subscription/route");
    const res = await POST(postRequest({ action: "pause" }), { params: Promise.resolve({ businessId: "no-such-biz" }) });
    expect(res.status).toBe(404);
  });

  it("pauses a business and records pausedAt/pausedReason + an audit event", async () => {
    const { POST } = await import("@/app/api/admin/businesses/[businessId]/subscription/route");
    const res = await POST(
      postRequest({ action: "pause", reason: "Invoice LX-1001 overdue", actorEmail: "connect@luxordev.com" }),
      { params: Promise.resolve({ businessId: "biz-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptionStatus).toBe("paused");

    const stored = firestore.documents.get("businesses/biz-1");
    expect(stored?.subscriptionStatus).toBe("paused");
    expect(stored?.pausedReason).toBe("Invoice LX-1001 overdue");
    expect(typeof stored?.pausedAt).toBe("number");

    const audit = [...firestore.documents.entries()].find(([path]) => path.startsWith("adminAuditEvents/"));
    expect(audit?.[1]).toMatchObject({ action: "subscription.paused", businessId: "biz-1" });
  });

  it("resumes a paused business and clears pausedAt/pausedReason", async () => {
    firestore.seed("businesses/biz-1", {
      businessName: "Biz One",
      subscriptionStatus: "paused",
      pausedAt: 12345,
      pausedReason: "non-payment",
    });
    const { POST } = await import("@/app/api/admin/businesses/[businessId]/subscription/route");
    const res = await POST(postRequest({ action: "resume" }), { params: Promise.resolve({ businessId: "biz-1" }) });
    expect(res.status).toBe(200);

    const stored = firestore.documents.get("businesses/biz-1");
    expect(stored?.subscriptionStatus).toBe("active");
    expect(stored?.pausedAt).toBeUndefined();
    expect(stored?.pausedReason).toBeUndefined();
  });
});
