type StoredDocument = Record<string, unknown>;
type QueryOperator = "==" | "<" | "<=" | ">" | ">=";
type QueryFilter = [field: string, operator: QueryOperator, expected: unknown];

export class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined,
  ) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): StoredDocument | undefined {
    return this.value ? { ...this.value } : undefined;
  }
}

export class FakeQuery {
  private readonly filters: QueryFilter[] = [];

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string,
  ) {}

  where(field: string, operator: QueryOperator, expected: unknown): this {
    this.filters.push([field, operator, expected]);
    return this;
  }

  async get(): Promise<{ docs: FakeDocumentSnapshot[]; empty: boolean }> {
    const directChildSegments = this.path.split("/").length + 1;
    const docs = [...this.firestore.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${this.path}/`) &&
          path.split("/").length === directChildSegments,
      )
      .filter(([, value]) =>
        this.filters.every(([field, operator, expected]) =>
          matches(value[field], operator, expected),
        ),
      )
      .map(
        ([path, value]) =>
          new FakeDocumentSnapshot(
            new FakeDocumentReference(this.firestore, path),
            value,
          ),
      );
    return { docs, empty: docs.length === 0 };
  }
}

export class FakeCollectionReference extends FakeQuery {
  doc(id?: string): FakeDocumentReference {
    return new FakeDocumentReference(
      this.firestore,
      `${this.path}/${id ?? `auto-${this.firestore.nextId++}`}`,
    );
  }
}

export class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get(): Promise<FakeDocumentSnapshot> {
    return new FakeDocumentSnapshot(
      this,
      this.firestore.documents.get(this.path),
    );
  }

  async set(value: StoredDocument): Promise<void> {
    this.firestore.documents.set(this.path, { ...value });
  }

  async update(value: StoredDocument): Promise<void> {
    const current = this.firestore.documents.get(this.path);
    if (!current) throw new Error(`Document does not exist: ${this.path}`);
    this.firestore.documents.set(this.path, { ...current, ...value });
  }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];
  private readonly pendingCreates = new Set<string>();

  constructor(private readonly firestore: FakeFirestore) {}

  get(
    reference: FakeDocumentReference | FakeQuery,
  ): ReturnType<FakeDocumentReference["get"]> | ReturnType<FakeQuery["get"]> {
    return reference.get();
  }

  create(reference: FakeDocumentReference, value: StoredDocument): void {
    if (this.firestore.shouldFailCreate(reference.path)) {
      throw new Error(`Injected transaction write failure: ${reference.path}`);
    }
    if (
      this.firestore.documents.has(reference.path) ||
      this.pendingCreates.has(reference.path)
    ) {
      throw new Error(`Document already exists: ${reference.path}`);
    }
    this.pendingCreates.add(reference.path);
    this.writes.push(() =>
      this.firestore.documents.set(reference.path, { ...value }),
    );
  }

  set(reference: FakeDocumentReference, value: StoredDocument): void {
    this.writes.push(() =>
      this.firestore.documents.set(reference.path, { ...value }),
    );
  }

  update(reference: FakeDocumentReference, value: StoredDocument): void {
    if (
      !this.firestore.documents.has(reference.path) &&
      !this.pendingCreates.has(reference.path)
    ) {
      throw new Error(`Document does not exist: ${reference.path}`);
    }
    this.writes.push(() => {
      const current = this.firestore.documents.get(reference.path) ?? {};
      this.firestore.documents.set(reference.path, { ...current, ...value });
    });
  }

  commit(): void {
    this.writes.forEach((write) => write());
  }
}

export class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly failCreate: (path: string) => boolean = () => false,
  ) {}

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this, name);
  }

  shouldFailCreate(path: string): boolean {
    return this.failCreate(path);
  }

  runTransaction<T>(
    callback: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T> {
    const run = this.transactionQueue.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function matches(
  actual: unknown,
  operator: QueryOperator,
  expected: unknown,
): boolean {
  if (operator === "==") return actual === expected;
  if (typeof actual === "number" && typeof expected === "number") {
    if (operator === "<") return actual < expected;
    if (operator === "<=") return actual <= expected;
    if (operator === ">") return actual > expected;
    return actual >= expected;
  }
  if (typeof actual === "string" && typeof expected === "string") {
    if (operator === "<") return actual < expected;
    if (operator === "<=") return actual <= expected;
    if (operator === ">") return actual > expected;
    return actual >= expected;
  }
  return false;
}
