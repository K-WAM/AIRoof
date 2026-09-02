import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;

const superadminUser = { user: { uid: "sa-test", superadmin: true } };

const mocks = vi.hoisted(() => ({
  verifySuperadmin: vi.fn(),
  mintFieldExchangeToken: vi.fn(),
  updateAssistantPersona: vi.fn(),
  firestoreInstance: null as FakeFirestore | null,
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifySuperadmin: mocks.verifySuperadmin,
  mintFieldExchangeToken: mocks.mintFieldExchangeToken,
}));

vi.mock("@/lib/vapi/vapiClient", () => ({
  updateAssistantPersona: mocks.updateAssistantPersona,
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => mocks.firestoreInstance,
}));

class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined,
  ) {}

  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  collection(name: string) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path));
  }

  async update(data: StoredDocument) {
    const current = this.firestore.documents.get(this.path) ?? {};
    this.firestore.documents.set(this.path, { ...current, ...data });
  }

  async set(data: StoredDocument, _options?: { merge?: boolean }) {
    if (_options?.merge) {
      const current = this.firestore.documents.get(this.path) ?? {};
      this.firestore.documents.set(this.path, { ...current, ...data });
    } else {
      this.firestore.documents.set(this.path, { ...data });
    }
  }

  delete() {
    this.firestore.documents.delete(this.path);
  }
}

class FakeQuery {
  protected filters: Array<[string, string, unknown]> = [];

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string,
  ) {}

  where(_field: string, _operator: string, _value: unknown) {
    void _field; void _operator; void _value;
    return this;
  }

  async get() {
    const prefix = `${this.path}/`;
    const expectedSegments = this.path.split("/").length + 1;
    const docs = [...this.firestore.documents.entries()]
      .filter(
        ([docPath]) =>
          docPath.startsWith(prefix) && docPath.split("/").length === expectedSegments,
      )
      .map(
        ([docPath, data]) =>
          new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, docPath), data),
      );
    return { docs, empty: docs.length === 0 };
  }
}

class FakeCollectionReference extends FakeQuery {
  constructor(
    firestore: FakeFirestore,
    readonly collectionPath: string,
  ) {
    super(firestore, collectionPath);
  }

  doc(id: string) {
    return new FakeDocumentReference(this.firestore, `${this.collectionPath}/${id}`);
  }

  async add(_data: StoredDocument) {
    void _data;
    return new FakeDocumentReference(this.firestore, `${this.collectionPath}/auto-generated`);
  }
}

class FakeBatch {
  private writes: Array<() => void> = [];

  delete(ref: FakeDocumentReference) {
    this.writes.push(() => ref.delete());
  }

  set(ref: FakeDocumentReference, data: StoredDocument) {
    this.writes.push(() => ref.set(data));
  }

  update(ref: FakeDocumentReference, data: StoredDocument) {
    this.writes.push(() => ref.update(data));
  }

  async commit() {
    for (const write of this.writes) write();
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  batch() {
    return new FakeBatch();
  }

  runTransaction<T>(callback: (transaction: {
    get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
    set: (ref: FakeDocumentReference, data: StoredDocument, options?: { merge?: boolean }) => void;
  }) => Promise<T>): Promise<T> {
    const committed: Array<() => void> = [];
    const tx = {
      get: async (ref: FakeDocumentReference) => ref.get(),
      set: (ref: FakeDocumentReference, data: StoredDocument, options?: { merge?: boolean }) => {
        committed.push(() => ref.set(data, options));
      },
    };
    return callback(tx).then((result) => {
      for (const write of committed) write();
      return result;
    });
  }
}

function createFirestore() {
  return new FakeFirestore();
}

function makeRequest(method: "POST" | "DELETE", body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/demo-customize", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("demo-customize route", () => {
  beforeEach(() => {
    mocks.verifySuperadmin.mockReset();
    mocks.mintFieldExchangeToken.mockReset();
    mocks.updateAssistantPersona.mockReset();
    mocks.mintFieldExchangeToken.mockReturnValue({
      ok: true,
      token: "short-lived-exchange-grant",
      businessId: "demo-roofing",
      expiresAt: Date.now() + 600_000,
    });
  });

  describe("DELETE confirm field (e)", () => {
    it("returns 400 when confirm field is missing", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", {});

      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("confirm");
    });

    it("returns 400 when confirm value is wrong", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "wrong-value" });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("RESET");
    });

    it("returns 400 when body is not valid JSON", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = new NextRequest("http://localhost/api/admin/demo-customize", {
        method: "DELETE",
        body: "not-json",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });
  });

  describe("isDemo marker check (b)", () => {
    it("rejects when business doc is missing isDemo marker", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("isDemo");
    });

    it("rejects when isDemo is explicitly false", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: false,
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("isDemo");
    });
  });

  describe("transactional lock (d)", () => {
    it("rejects when lock is already held by another reset", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      fs.documents.set("businesses/demo-roofing/backups/lock", {
        locked: true,
        startedAt: Date.now() - 5000,
        operation: "reset",
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("already in progress");
    });

    it("claims stale lock and proceeds", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      fs.documents.set("businesses/demo-roofing/backups/lock", {
        locked: true,
        startedAt: Date.now() - 200_000,
        operation: "reset",
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const lockDoc = fs.documents.get("businesses/demo-roofing/backups/lock");
      expect(lockDoc?.locked).toBe(false);
    });
  });

  describe("backup export (c)", () => {
    it("creates backup doc before deleting collections", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const backupKeys = [...fs.documents.keys()].filter((k) =>
        k.startsWith("businesses/demo-roofing/backups/") && k !== "businesses/demo-roofing/backups/lock",
      );
      expect(backupKeys.length).toBe(1);
      const backupDoc = fs.documents.get(backupKeys[0]);
      expect(backupDoc?.operation).toBe("reset");
      expect(backupDoc?.businessId).toBe("demo-roofing");
      expect(backupDoc?.data).toBeDefined();
    });

    it("includes all five subcollections in backup", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const backupKeys = [...fs.documents.keys()].filter((k) =>
        k.startsWith("businesses/demo-roofing/backups/") && k !== "businesses/demo-roofing/backups/lock",
      );
      const backupDoc = fs.documents.get(backupKeys[0]) as StoredDocument;
      const data = backupDoc.data as Record<string, unknown[]>;
      expect(Object.keys(data).sort()).toEqual(["appointments", "calls", "crews", "jobs", "leads"]);
    });

    it("releases lock after completion", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Apex Roofing",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      await DELETE(req);

      const lockDoc = fs.documents.get("businesses/demo-roofing/backups/lock");
      expect(lockDoc?.locked).toBe(false);
      expect(lockDoc?.completedAt).toBeDefined();
    });
  });

  describe("superadmin gate retained", () => {
    it("returns 401 when caller is not superadmin", async () => {
      mocks.verifySuperadmin.mockResolvedValue({
        error: new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401 }),
      });
      const fs = createFirestore();
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("DELETE", { confirm: "RESET" });

      const res = await DELETE(req);
      expect(res.status).toBe(401);
    });
  });

  describe("full valid POST", () => {
    it("succeeds with valid email, companyName, and all guards passed", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Old Name",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { POST } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("POST", {
        email: "test@example.com",
        companyName: "Test Corp",
        verticalId: "hvac",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.verticalId).toBe("hvac");
      expect(body.fieldUrl).toBe(
        "https://ai-roof.vercel.app/api/field/exchange?grant=short-lived-exchange-grant",
      );
      expect(body.fieldUrl).not.toContain("key=");
      expect(mocks.mintFieldExchangeToken).toHaveBeenCalledWith(
        "demo-roofing",
        "abcd1234abcd1234abcd1234abcd1234",
      );

      const lockDoc = fs.documents.get("businesses/demo-roofing/backups/lock");
      expect(lockDoc?.locked).toBe(false);
    });
  });

  describe("live Vapi persona push", () => {
    it("pushes the rendered persona to Vapi and reports success when vapiAssistantId is set", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      mocks.updateAssistantPersona.mockResolvedValue(undefined);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Old Name",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
        vapiAssistantId: "assistant-123",
        approvedServices: [],
        approvedFaqs: [],
        emergencyRules: [],
        bookingRules: [],
        disallowedTopics: [],
        businessHours: "Mon-Fri 8-5",
        serviceArea: "Test Area",
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { POST } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("POST", {
        email: "test@example.com",
        companyName: "Test Corp",
        verticalId: "hvac",
      });

      const res = await POST(req);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.vapiUpdated).toBe(true);
      expect(body.vapiError).toBeUndefined();

      expect(mocks.updateAssistantPersona).toHaveBeenCalledTimes(1);
      const call = mocks.updateAssistantPersona.mock.calls[0][0];
      expect(call.assistantId).toBe("assistant-123");
      expect(call.firstMessage).toContain("Test Corp");
      expect(call.systemPrompt).toContain("Test Corp");
    });

    it("reports vapiError without failing the request when no vapiAssistantId is on the business doc", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Old Name",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
        // no vapiAssistantId
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { POST } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("POST", {
        email: "test@example.com",
        companyName: "Test Corp",
        verticalId: "hvac",
      });

      const res = await POST(req);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.firestoreUpdated).toBe(true);
      expect(body.vapiUpdated).toBe(false);
      expect(body.vapiError).toContain("vapiAssistantId");
      expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
    });

    it("reports vapiError without failing the request when the Vapi API call throws", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      mocks.updateAssistantPersona.mockRejectedValue(new Error("Vapi PATCH /assistant failed (500): boom"));
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Old Name",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
        vapiAssistantId: "assistant-123",
        approvedServices: [],
        approvedFaqs: [],
        emergencyRules: [],
        bookingRules: [],
        disallowedTopics: [],
        businessHours: "Mon-Fri 8-5",
        serviceArea: "Test Area",
      });
      mocks.firestoreInstance = fs;

      vi.resetModules();
      const { POST } = await import("@/app/api/admin/demo-customize/route");
      const req = makeRequest("POST", {
        email: "test@example.com",
        companyName: "Test Corp",
        verticalId: "hvac",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      // The reset itself must still fully succeed — a Vapi outage is surfaced,
      // not fatal to the Firestore reconfiguration/reseed.
      expect(body.ok).toBe(true);
      expect(body.firestoreUpdated).toBe(true);
      expect(body.vapiUpdated).toBe(false);
      expect(body.vapiError).toContain("boom");

      const lockDoc = fs.documents.get("businesses/demo-roofing/backups/lock");
      expect(lockDoc?.locked).toBe(false);
    });
  });
});
