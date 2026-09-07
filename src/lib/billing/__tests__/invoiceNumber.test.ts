import { describe, expect, it } from "vitest";
import { nextLuxorInvoiceNumber } from "@/lib/billing/invoiceNumber";

type StoredDocument = Record<string, unknown>;

class FakeTransaction {
  constructor(private readonly firestore: FakeFirestore) {}
  async get(ref: FakeDocumentReference) {
    const value = this.firestore.documents.get(ref.path);
    return { data: () => (value ? { ...value } : undefined) };
  }
  set(ref: FakeDocumentReference, value: StoredDocument) {
    this.firestore.documents.set(ref.path, { ...value });
  }
}

class FakeDocumentReference {
  constructor(private readonly firestore: FakeFirestore, readonly path: string) {}
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  collection(name: string) {
    return { doc: (id: string) => new FakeDocumentReference(this, `${name}/${id}`) };
  }
  async runTransaction(fn: (tx: FakeTransaction) => Promise<void>) {
    await fn(new FakeTransaction(this));
  }
}

describe("nextLuxorInvoiceNumber", () => {
  it("starts at LX-1001 with no prior counter", async () => {
    const db = new FakeFirestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await nextLuxorInvoiceNumber(db as any)).toBe("LX-1001");
  });

  it("increments monotonically and shares state across calls (manual invoice + cron draw from one counter)", async () => {
    const db = new FakeFirestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const casted = db as any;
    expect(await nextLuxorInvoiceNumber(casted)).toBe("LX-1001");
    expect(await nextLuxorInvoiceNumber(casted)).toBe("LX-1002");
    expect(await nextLuxorInvoiceNumber(casted)).toBe("LX-1003");
  });
});
