// A small in-memory Firestore-admin-SDK-shaped fake, purpose-built for the
// customers routes' tests (src/app/api/company/customers/**). Supports
// nested collections (businesses/{id}/customers/{id}), .where()/.orderBy()/
// .limit() chains, runTransaction, and batch — the exact surface those
// routes and src/lib/customers/resolve.ts actually call. Not a general
// Firestore emulator; extend deliberately if a new route needs more of the
// API surface, don't grow this into one by accident.

type DocData = Record<string, unknown>;
type WhereOp = "==" | "array-contains";

interface StoredDoc {
  id: string;
  data: DocData;
}

export class FakeQuery {
  constructor(
    private readonly store: FakeStore,
    private readonly path: string,
    private filters: Array<{ field: string; op: WhereOp; value: unknown }> = [],
    private order?: { field: string; dir: "asc" | "desc" },
    private limitN?: number
  ) {}

  where(field: string, op: WhereOp, value: unknown): FakeQuery {
    return new FakeQuery(this.store, this.path, [...this.filters, { field, op, value }], this.order, this.limitN);
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.store, this.path, this.filters, { field, dir }, this.limitN);
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(this.store, this.path, this.filters, this.order, n);
  }

  async get() {
    let docs = this.store.list(this.path);
    for (const f of this.filters) {
      docs = docs.filter((d) => {
        const v = d.data[f.field];
        if (f.op === "==") return v === f.value;
        if (f.op === "array-contains") return Array.isArray(v) && v.includes(f.value);
        return false;
      });
    }
    if (this.order) {
      const { field, dir } = this.order;
      docs = [...docs].sort((a, b) => {
        const av = a.data[field] as number | string | undefined;
        const bv = b.data[field] as number | string | undefined;
        if (av === bv) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return dir === "asc" ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
      });
    }
    if (this.limitN !== undefined) docs = docs.slice(0, this.limitN);
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map((d) => this.store.snapshotFor(this.path, d.id)),
    };
  }
}

class FakeDocRef {
  constructor(private readonly store: FakeStore, readonly path: string, readonly id: string) {}

  async get() {
    return this.store.snapshotFor(this.parentPath(), this.id);
  }
  async set(data: DocData) {
    this.store.set(this.parentPath(), this.id, data);
  }
  async update(data: DocData) {
    this.store.update(this.parentPath(), this.id, data);
  }
  collection(name: string) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }
  private parentPath() {
    return this.path.split("/").slice(0, -1).join("/");
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(private readonly storeRef: FakeStore, private readonly collPath: string) {
    super(storeRef, collPath);
  }
  doc(id?: string): FakeDocRef {
    const docId = id ?? `auto_${Math.random().toString(36).slice(2)}`;
    return new FakeDocRef(this.storeRef, `${this.collPath}/${docId}`, docId);
  }
}

class FakeStore {
  // path is the COLLECTION path, e.g. "businesses/biz-1/customers"
  private data = new Map<string, Map<string, DocData>>();

  private bucket(path: string): Map<string, DocData> {
    let b = this.data.get(path);
    if (!b) { b = new Map(); this.data.set(path, b); }
    return b;
  }

  list(path: string): StoredDoc[] {
    return [...this.bucket(path).entries()].map(([id, data]) => ({ id, data }));
  }

  set(path: string, id: string, data: DocData) {
    this.bucket(path).set(id, { ...data });
  }

  update(path: string, id: string, patch: DocData) {
    const b = this.bucket(path);
    const existing = b.get(id);
    if (!existing) throw new Error(`No document to update at ${path}/${id}`);
    b.set(id, { ...existing, ...patch });
  }

  snapshotFor(path: string, id: string) {
    const data = this.bucket(path).get(id);
    return {
      id,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      ref: new FakeDocRef(this, `${path}/${id}`, id),
    };
  }

  seed(path: string, id: string, data: DocData) {
    this.set(path, id, data);
  }
}

export function makeFakeDb() {
  const store = new FakeStore();
  const db = {
    collection(name: string) {
      return new FakeCollectionRef(store, name);
    },
    async runTransaction<T>(fn: (tx: {
      get: (ref: FakeDocRef) => Promise<ReturnType<FakeStore["snapshotFor"]>>;
      set: (ref: FakeDocRef, data: DocData) => void;
      update: (ref: FakeDocRef, data: DocData) => void;
    }) => Promise<T>): Promise<T> {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: (ref: FakeDocRef) => ref.get(),
        set: (ref: FakeDocRef, data: DocData) => { writes.push(() => store.set(ref.path.split("/").slice(0, -1).join("/"), ref.id, data)); },
        update: (ref: FakeDocRef, data: DocData) => { writes.push(() => store.update(ref.path.split("/").slice(0, -1).join("/"), ref.id, data)); },
      });
      writes.forEach((w) => w());
      return result;
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        update(ref: FakeDocRef, data: DocData) {
          ops.push(() => store.update(ref.path.split("/").slice(0, -1).join("/"), ref.id, data));
        },
        async commit() {
          ops.forEach((op) => op());
        },
      };
    },
    __seed(collectionPath: string, id: string, data: DocData) {
      store.seed(collectionPath, id, data);
    },
    __peek(collectionPath: string, id: string): DocData | undefined {
      return store.list(collectionPath).find((d) => d.id === id)?.data;
    },
  };
  return db;
}

export type FakeDb = ReturnType<typeof makeFakeDb>;
