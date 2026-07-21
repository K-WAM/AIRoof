import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import {
  InvalidOperationLedgerInputError,
  OperationNotRetryableError,
  claimOperation,
  completeOperationAttempt,
  createEmailOperationId,
  createVapiOperationId,
  getOperation,
  listOperationAttempts,
  listOrphanedPendingOperations,
  startOperationAttempt,
} from "@/lib/ops/ledger";

type StoredDocument = Record<string, unknown>;

function clone<T>(value: T): T {
  if (value instanceof Timestamp) return value as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)])
    ) as T;
  }
  return value;
}

class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: StoredDocument | undefined
  ) {}

  get exists() {
    return this.value !== undefined;
  }

  data() {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

class FakeQuery {
  private readonly filters: Array<[string, "==" | "<=", unknown]> = [];
  private order: [string, "asc" | "desc"] | undefined;
  private max = Number.POSITIVE_INFINITY;

  constructor(
    private readonly firestore: FakeFirestore,
    private readonly path: string
  ) {}

  where(field: string, operator: "==" | "<=", value: unknown) {
    this.filters.push([field, operator, value]);
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc") {
    this.order = [field, direction];
    return this;
  }

  limit(value: number) {
    this.max = value;
    return this;
  }

  async get() {
    const prefix = `${this.path}/`;
    const expectedSegments = this.path.split("/").length + 1;
    let entries = [...this.firestore.documents.entries()]
      .filter(
        ([documentPath]) =>
          documentPath.startsWith(prefix) &&
          documentPath.split("/").length === expectedSegments
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          return comparable(actual) <= comparable(expected);
        })
      );

    if (this.order) {
      const [field, direction] = this.order;
      entries = entries.sort(([, left], [, right]) => {
        const difference = comparable(left[field]) - comparable(right[field]);
        return direction === "asc" ? difference : -difference;
      });
    }

    const docs = entries.slice(0, this.max).map(
      ([documentPath, data]) =>
        new FakeDocumentSnapshot(documentPath.split("/").at(-1) ?? "", data)
    );
    return { docs, empty: docs.length === 0 };
  }
}

function comparable(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return String(value).localeCompare("");
}

class FakeCollectionReference extends FakeQuery {
  constructor(
    private readonly firestoreInstance: FakeFirestore,
    readonly collectionPath: string
  ) {
    super(firestoreInstance, collectionPath);
  }

  doc(id: string) {
    return new FakeDocumentReference(this.firestoreInstance, `${this.collectionPath}/${id}`);
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

  collection(name: string) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocumentSnapshot(this.id, this.firestore.documents.get(this.path));
  }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];

  constructor(private readonly firestore: FakeFirestore) {}

  async get(reference: FakeDocumentReference) {
    return reference.get();
  }

  create(reference: FakeDocumentReference, value: StoredDocument) {
    if (this.firestore.documents.has(reference.path)) {
      throw new Error(`Document already exists: ${reference.path}`);
    }
    this.writes.push(() => this.firestore.documents.set(reference.path, clone(value)));
  }

  update(reference: FakeDocumentReference, value: StoredDocument) {
    if (!this.firestore.documents.has(reference.path)) {
      throw new Error(`Document does not exist: ${reference.path}`);
    }
    this.writes.push(() => {
      const current = this.firestore.documents.get(reference.path) ?? {};
      this.firestore.documents.set(reference.path, { ...current, ...clone(value) });
    });
  }

  set(reference: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => this.firestore.documents.set(reference.path, clone(value)));
  }

  commit() {
    for (const write of this.writes) write();
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function firestoreOptions(firestore: FakeFirestore, now: string) {
  return {
    firestore: firestore as never,
    now: new Date(now),
  };
}

describe("operation ledger IDs", () => {
  it("builds stable, path-safe IDs for Vapi and email effects", () => {
    expect(createVapiOperationId("call/123", "bookAppointment", 2)).toBe(
      "vapi:call%2F123:bookAppointment:2"
    );
    expect(createEmailOperationId("confirmation", "job/42")).toBe(
      "email:confirmation:job%2F42"
    );
  });

  it("rejects invalid operation ID inputs", () => {
    expect(() => createVapiOperationId("call-1", "bookAppointment", 0)).toThrow(
      InvalidOperationLedgerInputError
    );
    expect(() => createEmailOperationId("\n", "job-42")).toThrow(
      InvalidOperationLedgerInputError
    );
  });
});

describe("claimOperation", () => {
  it("allows exactly one winner when concurrent callers claim the same operation", async () => {
    const firestore = new FakeFirestore();
    const options = firestoreOptions(firestore, "2026-07-20T18:00:00.000Z");
    const input = {
      businessId: "biz-1",
      opId: createVapiOperationId("call-1", "bookAppointment"),
      kind: "vapi-tool",
      entityRef: { collection: "calls", id: "call-1" },
    };

    const claims = await Promise.all(
      Array.from({ length: 8 }, () => claimOperation(input, options))
    );

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(7);
    expect(firestore.documents.has(
      "businesses/biz-1/operations/vapi:call-1:bookAppointment:1"
    )).toBe(true);
  });
});

describe("operation attempts", () => {
  it("lists retryable and successful attempts with the provider ID", async () => {
    const firestore = new FakeFirestore();
    const locator = { businessId: "biz-1", opId: "email:confirmation:job-42" };
    await claimOperation(
      { ...locator, kind: "email", entityRef: { collection: "jobs", id: "job-42" } },
      firestoreOptions(firestore, "2026-07-20T18:00:00.000Z")
    );

    const first = await startOperationAttempt(
      locator,
      firestoreOptions(firestore, "2026-07-20T18:01:00.000Z")
    );
    await completeOperationAttempt(
      {
        ...locator,
        attemptId: first.attemptId,
        state: "failed",
        failure: { classification: "retryable", code: "provider_unavailable" },
      },
      firestoreOptions(firestore, "2026-07-20T18:02:00.000Z")
    );

    const second = await startOperationAttempt(
      locator,
      firestoreOptions(firestore, "2026-07-20T18:03:00.000Z")
    );
    await completeOperationAttempt(
      {
        ...locator,
        attemptId: second.attemptId,
        state: "succeeded",
        providerId: "resend_123",
      },
      firestoreOptions(firestore, "2026-07-20T18:04:00.000Z")
    );

    const attempts = await listOperationAttempts(locator, { firestore: firestore as never });
    expect(attempts).toMatchObject([
      {
        attemptId: "000001",
        state: "failed",
        failure: { classification: "retryable", code: "provider_unavailable" },
      },
      { attemptId: "000002", state: "succeeded", providerId: "resend_123" },
    ]);
    await expect(getOperation(locator, { firestore: firestore as never })).resolves.toMatchObject({
      state: "succeeded",
      attemptCount: 2,
      lastProviderId: "resend_123",
    });
  });

  it("does not retry a terminal failure", async () => {
    const firestore = new FakeFirestore();
    const locator = { businessId: "biz-1", opId: "email:invoice:invoice-1" };
    await claimOperation(
      { ...locator, kind: "email" },
      firestoreOptions(firestore, "2026-07-20T18:00:00.000Z")
    );
    const attempt = await startOperationAttempt(
      locator,
      firestoreOptions(firestore, "2026-07-20T18:01:00.000Z")
    );
    await completeOperationAttempt(
      {
        ...locator,
        attemptId: attempt.attemptId,
        state: "failed",
        failure: { classification: "terminal", code: "invalid_recipient" },
      },
      firestoreOptions(firestore, "2026-07-20T18:02:00.000Z")
    );

    await expect(
      startOperationAttempt(locator, firestoreOptions(firestore, "2026-07-20T18:03:00.000Z"))
    ).rejects.toBeInstanceOf(OperationNotRetryableError);
  });

  it("rejects free-form failure details that could persist PII", async () => {
    const firestore = new FakeFirestore();
    const locator = { businessId: "biz-1", opId: "email:report:report-1" };
    await claimOperation(
      { ...locator, kind: "email" },
      firestoreOptions(firestore, "2026-07-20T18:00:00.000Z")
    );
    const attempt = await startOperationAttempt(
      locator,
      firestoreOptions(firestore, "2026-07-20T18:01:00.000Z")
    );

    await expect(
      completeOperationAttempt(
        {
          ...locator,
          attemptId: attempt.attemptId,
          state: "failed",
          failure: { classification: "terminal", code: "user@example.com rejected" },
        },
        firestoreOptions(firestore, "2026-07-20T18:02:00.000Z")
      )
    ).rejects.toBeInstanceOf(InvalidOperationLedgerInputError);
  });
});

describe("listOrphanedPendingOperations", () => {
  it("returns only pending operations older than the TTL", async () => {
    const firestore = new FakeFirestore();
    await claimOperation(
      { businessId: "biz-1", opId: "old-op", kind: "vapi-tool" },
      firestoreOptions(firestore, "2026-07-20T16:00:00.000Z")
    );
    await claimOperation(
      { businessId: "biz-1", opId: "fresh-op", kind: "vapi-tool" },
      firestoreOptions(firestore, "2026-07-20T17:50:00.000Z")
    );
    await claimOperation(
      { businessId: "biz-2", opId: "other-tenant-op", kind: "vapi-tool" },
      firestoreOptions(firestore, "2026-07-20T16:00:00.000Z")
    );

    const orphaned = await listOrphanedPendingOperations(
      { businessId: "biz-1", pendingTtlMs: 30 * 60 * 1000 },
      firestoreOptions(firestore, "2026-07-20T18:00:00.000Z")
    );

    expect(orphaned.map((operation) => operation.opId)).toEqual(["old-op"]);
  });
});
