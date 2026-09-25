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
    this.filters.push([_field, _operator, _value]);
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
      .filter(([, data]) => this.filters.every(([field, op, value]) => op === "==" && data[field] === value))
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

  async recursiveDelete(ref: FakeDocumentReference) {
    for (const path of [...this.documents.keys()]) {
      if (path === ref.path || path.startsWith(`${ref.path}/`)) this.documents.delete(path);
    }
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

    it("includes all cleared collections in backup", async () => {
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
      expect(Object.keys(data).sort()).toEqual([
        "agentActions", "appointments", "calls", "crews", "customers", "elevenlabsConversations",
        "invoices", "jobs", "leads", "library", "punches", "quotes", "schedulingLocks",
      ]);
    });

    it("removes orphan job children, old customer data and occupied scheduling slots", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", { businessName: "Old", isDemo: true,
        fieldKey: "abcd1234abcd1234abcd1234abcd1234" });
      for (const path of [
        "businesses/demo-roofing/jobs/J-1001", "businesses/demo-roofing/jobs/J-1001/updates/u1",
        "businesses/demo-roofing/jobs/J-1001/photos/p1", "businesses/demo-roofing/jobs/J-1001/photoBlobs/b1",
        "businesses/demo-roofing/customers/c1", "businesses/demo-roofing/quotes/q1",
        "businesses/demo-roofing/invoices/i1", "businesses/demo-roofing/punches/p1",
        "businesses/demo-roofing/agentActions/a1", "businesses/demo-roofing/schedulingLocks/slot1",
      ]) fs.documents.set(path, { old: true });
      fs.documents.set("elevenlabsConversations/own", { businessId: "demo-roofing" });
      fs.documents.set("elevenlabsConversations/other", { businessId: "another-tenant" });
      mocks.firestoreInstance = fs;
      vi.resetModules();
      const { DELETE } = await import("@/app/api/admin/demo-customize/route");
      const response = await DELETE(makeRequest("DELETE", { confirm: "RESET" }));
      expect((await response.json()).ok).toBe(true);
      for (const path of [...fs.documents.keys()]) {
        expect(path).not.toMatch(/jobs\/J-1001\/(updates|photos|photoBlobs)\//);
        expect(path).not.toMatch(/(customers|quotes|invoices|punches|agentActions|schedulingLocks)\/[^/]+$/);
      }
      expect(fs.documents.has("elevenlabsConversations/own")).toBe(false);
      expect(fs.documents.has("elevenlabsConversations/other")).toBe(true);
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

  describe("optional launch fields (no-friction demos)", () => {
    async function launch(body: Record<string, unknown>) {
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
      const res = await POST(makeRequest("POST", body));
      return { res, fs };
    }

    it("launches with ONLY an industry: blank name becomes '<Industry> Demo' and blank email uses the default inbox", async () => {
      const { res, fs } = await launch({ verticalId: "hvac" });
      expect(res.status).toBe(200);
      const biz = fs.documents.get("businesses/demo-roofing") as Record<string, unknown>;
      expect(biz.businessName).toBe("HVAC Demo");
      expect(biz.notificationEmail).toBe("kwamwad@gmail.com");
    });

    it("treats whitespace-only fields as blank", async () => {
      const { res, fs } = await launch({ verticalId: "hvac", companyName: "   ", email: "  " });
      expect(res.status).toBe(200);
      expect((fs.documents.get("businesses/demo-roofing") as Record<string, unknown>).businessName).toBe("HVAC Demo");
    });

    it("still rejects an email that IS provided but malformed", async () => {
      const { res } = await launch({ verticalId: "hvac", companyName: "Acme", email: "not-an-email" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid email format" });
    });

    it("keeps a provided company name and email", async () => {
      const { res, fs } = await launch({ verticalId: "hvac", companyName: "Acme Air", email: "boss@acme.com" });
      expect(res.status).toBe(200);
      const biz = fs.documents.get("businesses/demo-roofing") as Record<string, unknown>;
      expect(biz.businessName).toBe("Acme Air");
      expect(biz.notificationEmail).toBe("boss@acme.com");
    });
  });

  describe("ElevenLabs line preview", () => {
    it("renders the next greeting without a provider network call", async () => {
      mocks.verifySuperadmin.mockResolvedValue(superadminUser);
      vi.stubEnv("ELEVENLABS_API_KEY", "test-only-key");
      const fs = createFirestore();
      fs.documents.set("businesses/demo-roofing", {
        businessName: "Old Name",
        fieldKey: "abcd1234abcd1234abcd1234abcd1234",
        isDemo: true,
        voiceProvider: "elevenlabs",
        elevenlabs: { agentId: "agent-test", phoneNumberId: "phone-test", phoneNumber: "+16892042643" },
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
      expect(body.lineReady).toBe(true);
      expect(body.greetingPreview).toContain("Test Corp");
      expect(body.phone).toBe("+1 (689) 204-2643");
      expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it("reports that the line needs migration", async () => {
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
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.firestoreUpdated).toBe(true);
      expect(body.lineReady).toBe(false);
      expect(body.lineError).toContain("move-demo-line-to-elevenlabs.mjs");
      expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
    });
  });
});
