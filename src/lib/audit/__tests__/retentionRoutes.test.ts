import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  verifyAuthAndRole: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: routeMocks.getAdminFirestore,
}));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: routeMocks.verifyAuthAndRole,
}));

import { DELETE as deleteCall } from "@/app/api/calls/[callId]/route";
import { POST as runRetention } from "@/app/api/cron/retention/route";

type StoredDocument = Record<string, unknown>;
type QueryFilter = [field: string, operator: string, expected: unknown];

const DELETE_FIELDS = new Set([
  "messages",
  "transcript",
  "summary",
  "outcomeReason",
  "recordingUrl",
  "callerPhone",
  "callerName",
  "targetPhone",
  "extractedLead",
  "appointmentId",
  "appointmentRef",
  "leadId",
  "input",
  "output",
]);

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
  private readonly filters: QueryFilter[] = [];
  private readonly orderFields: string[] = [];
  private startValues?: unknown[];
  private queryLimit?: number;

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string
  ) {}

  where(field: string, operator: string, expected: unknown) {
    this.filters.push([field, operator, expected]);
    return this;
  }

  orderBy(field: unknown) {
    this.orderFields.push(typeof field === "string" ? field : "__name__");
    return this;
  }

  startAfter(...values: unknown[]) {
    this.startValues = values;
    return this;
  }

  limit(value: number) {
    this.queryLimit = value;
    return this;
  }

  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    let matches = [...this.firestore.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "<=") {
            return typeof actual === "number" &&
              typeof expected === "number" &&
              actual <= expected;
          }
          throw new Error(`Unsupported operator ${operator}`);
        })
      );

    const queryValue = (path: string, data: StoredDocument, field: string) =>
      field === "__name__" ? path.split("/").at(-1)! : data[field];
    matches.sort(([leftPath, left], [rightPath, right]) => {
      for (const field of this.orderFields) {
        const a = queryValue(leftPath, left, field);
        const b = queryValue(rightPath, right, field);
        if (a === b) continue;
        return a! < b! ? -1 : 1;
      }
      return 0;
    });

    if (this.startValues) {
      const cursorValues = this.startValues;
      matches = matches.filter(([path, data]) => {
        for (let index = 0; index < this.orderFields.length; index += 1) {
          const actual = queryValue(path, data, this.orderFields[index]);
          const cursor = cursorValues[index];
          if (actual === cursor) continue;
          return actual! > cursor!;
        }
        return false;
      });
    }
    if (this.queryLimit !== undefined) matches = matches.slice(0, this.queryLimit);

    return {
      docs: matches.map(
        ([path, data]) =>
          new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, path), data)
      ),
      empty: matches.length === 0,
    };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id: string) {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`);
  }
}

class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string
  ) {
    this.id = path.split("/").at(-1)!;
  }

  collection(name: string) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path));
  }
}

function applyUpdate(current: StoredDocument, update: StoredDocument): StoredDocument {
  const next = { ...current };
  for (const [field, value] of Object.entries(update)) {
    if (DELETE_FIELDS.has(field)) delete next[field];
    else next[field] = value;
  }
  return next;
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: {
    get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
    update: (ref: FakeDocumentReference, value: StoredDocument) => void;
    create: (ref: FakeDocumentReference, value: StoredDocument) => void;
  }) => Promise<T>): Promise<T> {
    const updates: Array<[FakeDocumentReference, StoredDocument]> = [];
    const creates: Array<[FakeDocumentReference, StoredDocument]> = [];
    const result = await callback({
      get: (ref) => ref.get(),
      update: (ref, value) => updates.push([ref, value]),
      create: (ref, value) => {
        if (this.documents.has(ref.path) || creates.some(([queued]) => queued.path === ref.path)) {
          throw new Error(`Document already exists: ${ref.path}`);
        }
        creates.push([ref, value]);
      },
    });
    for (const [ref, value] of updates) {
      const current = this.documents.get(ref.path);
      if (!current) throw new Error(`Document missing: ${ref.path}`);
      this.documents.set(ref.path, applyUpdate(current, value));
    }
    for (const [ref, value] of creates) this.documents.set(ref.path, { ...value });
    return result;
  }
}

function cronRequest(body: StoredDocument, token?: string) {
  return new NextRequest("http://localhost/api/cron/retention", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function callDeleteRequest(callId: string) {
  return new NextRequest(
    `http://localhost/api/calls/${callId}?businessId=biz_a`,
    { method: "DELETE" }
  );
}

describe("retention cron authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns 401 before any Firestore read or write", async () => {
    const response = await runRetention(cronRequest({ businessId: "biz_a" }));

    expect(response.status).toBe(401);
    expect(routeMocks.getAdminFirestore).not.toHaveBeenCalled();
  });
});

describe("retention redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("RETENTION_TRANSCRIPTS_DAYS", "90");
    vi.stubEnv("RETENTION_RECORDINGS_DAYS", "90");
    vi.stubEnv("RETENTION_TOOL_IO_DAYS", "90");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("redacts eligible data, skips active calls, preserves invoices, and is idempotent", async () => {
    const db = new FakeFirestore();
    const old = Date.now() - 100 * 24 * 60 * 60 * 1000;
    db.documents.set("businesses/biz_a", { businessName: "Tenant" });
    db.documents.set("businesses/biz_a/calls/call_old", {
      status: "ended",
      endedAt: old,
      messages: [{ role: "caller", text: "My address is 123 Secret Lane" }],
      summary: "Alice needs service",
      recordingUrl: "https://recordings.example/private-token",
      vapiCallId: "vapi_old",
    });
    db.documents.set("businesses/biz_a/calls/call_active", {
      status: "active",
      endedAt: old,
      messages: [{ role: "caller", text: "Keep while active" }],
      recordingUrl: "https://recordings.example/active",
    });
    db.documents.set("businesses/biz_a/agentActions/action_old", {
      type: "createLead",
      status: "success",
      createdAt: old,
      input: { phone: "+16045551234" },
      output: { address: "123 Secret Lane" },
    });
    db.documents.set("businesses/biz_a/invoices/invoice_1", {
      clientName: "Alice",
      amount: 1000,
    });
    routeMocks.getAdminFirestore.mockReturnValue(db);

    const first = await runRetention(
      cronRequest({ businessId: "biz_a", batchSize: 10 }, "cron-secret")
    );
    const firstBody = await first.json() as Record<string, unknown>;

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({ redactedCalls: 1, redactedToolActions: 1, nextCursor: null });
    const call = db.documents.get("businesses/biz_a/calls/call_old")!;
    expect(call).not.toHaveProperty("messages");
    expect(call).not.toHaveProperty("summary");
    expect(call).not.toHaveProperty("recordingUrl");
    expect(JSON.stringify(call.retention)).not.toContain("Alice");
    expect(JSON.stringify(call.retention)).not.toContain("Secret Lane");
    expect(JSON.stringify(call.retention)).not.toContain("recordings.example");
    expect(db.documents.get("businesses/biz_a/calls/call_active")).toHaveProperty(
      "recordingUrl",
      "https://recordings.example/active"
    );
    expect(db.documents.get("businesses/biz_a/agentActions/action_old")).not.toHaveProperty("input");
    expect(db.documents.get("businesses/biz_a/agentActions/action_old")).not.toHaveProperty("output");
    expect(db.documents.get("businesses/biz_a/invoices/invoice_1")).toEqual({
      clientName: "Alice",
      amount: 1000,
    });

    const auditCount = [...db.documents.keys()].filter((path) => path.includes("/auditEvents/")).length;
    expect(auditCount).toBe(2);

    const rerun = await runRetention(
      cronRequest({ businessId: "biz_a", batchSize: 10 }, "cron-secret")
    );
    expect(await rerun.json()).toMatchObject({ redactedCalls: 0, redactedToolActions: 0 });
    expect([...db.documents.keys()].filter((path) => path.includes("/auditEvents/")).length).toBe(
      auditCount
    );
  });

  it("resumes one-record batches from returned cursors", async () => {
    const db = new FakeFirestore();
    const old = Date.now() - 100 * 24 * 60 * 60 * 1000;
    db.documents.set("businesses/biz_a", { businessName: "Tenant" });
    for (const id of ["call_a", "call_b"]) {
      db.documents.set(`businesses/biz_a/calls/${id}`, {
        status: "ended",
        endedAt: old,
        messages: [{ role: "caller", text: id }],
      });
    }
    routeMocks.getAdminFirestore.mockReturnValue(db);

    let cursor: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await runRetention(
        cronRequest({ businessId: "biz_a", batchSize: 1, ...(cursor ? { cursor } : {}) }, "cron-secret")
      );
      expect(response.status).toBe(200);
      const body = await response.json() as { nextCursor: string | null };
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(db.documents.get("businesses/biz_a/calls/call_a")).not.toHaveProperty("messages");
    expect(db.documents.get("businesses/biz_a/calls/call_b")).not.toHaveProperty("messages");
  });
});

describe("call DELETE redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.verifyAuthAndRole.mockResolvedValue({
      user: { uid: "user_1", role: "owner", businessId: "biz_a", superadmin: false },
    });
  });

  it("returns the auth error before accessing call storage", async () => {
    routeMocks.verifyAuthAndRole.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const response = await deleteCall(callDeleteRequest("call_1"), {
      params: Promise.resolve({ callId: "call_1" }),
    });

    expect(response.status).toBe(401);
    expect(routeMocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it("redacts call PII without relabelling the call as ended, and repeats idempotently", async () => {
    const db = new FakeFirestore();
    db.documents.set("businesses/biz_a/calls/call_1", {
      businessId: "biz_a",
      status: "failed",
      endedAt: Date.now(),
      messages: [{ role: "caller", text: "Private transcript" }],
      recordingUrl: "https://recordings.example/private",
      callerPhone: "+16045551234",
      callerName: "Alice",
      vapiCallId: "vapi_call_1",
    });
    routeMocks.getAdminFirestore.mockReturnValue(db);

    const first = await deleteCall(callDeleteRequest("call_1"), {
      params: Promise.resolve({ callId: "call_1" }),
    });
    expect(await first.json()).toEqual({ success: true, redacted: true });

    const call = db.documents.get("businesses/biz_a/calls/call_1")!;
    expect(call.status).toBe("failed");
    expect(call).not.toHaveProperty("messages");
    expect(call).not.toHaveProperty("recordingUrl");
    expect(call).not.toHaveProperty("callerPhone");
    expect(call).not.toHaveProperty("callerName");

    const second = await deleteCall(callDeleteRequest("call_1"), {
      params: Promise.resolve({ callId: "call_1" }),
    });
    expect(await second.json()).toEqual({ success: true, redacted: false });

    const events = [...db.documents.values()].filter((value) => value.action === "call.delete");
    expect(events.map((event) => event.result)).toEqual(["success", "skipped"]);
    expect(events[0]).toMatchObject({
      actor: { type: "user", id: "user_1" },
      providerIds: { vapiCallId: "vapi_call_1" },
    });
  });

  it("refuses to redact an active call", async () => {
    const db = new FakeFirestore();
    db.documents.set("businesses/biz_a/calls/call_active", {
      status: "active",
      messages: [{ role: "caller", text: "Still in progress" }],
      recordingUrl: "https://recordings.example/active",
    });
    routeMocks.getAdminFirestore.mockReturnValue(db);

    const response = await deleteCall(callDeleteRequest("call_active"), {
      params: Promise.resolve({ callId: "call_active" }),
    });

    expect(response.status).toBe(409);
    expect(db.documents.get("businesses/biz_a/calls/call_active")).toHaveProperty("messages");
    expect([...db.documents.values()].find((value) => value.action === "call.delete")).toMatchObject({
      result: "denied",
      details: { reason: "active_call" },
    });
  });
});
