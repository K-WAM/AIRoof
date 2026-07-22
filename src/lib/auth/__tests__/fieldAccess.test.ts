import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredDocument = Record<string, unknown>;

class FakeSnapshot {
  constructor(private readonly value: StoredDocument | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeDocumentReference {
  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string,
  ) {}

  async get() {
    return new FakeSnapshot(this.firestore.documents.get(this.path));
  }

  async set(value: StoredDocument) {
    this.firestore.documents.set(this.path, { ...value });
  }
}

class FakeCollectionReference {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly path: string,
  ) {}

  doc(id: string) {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`);
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  async runTransaction<T>(callback: (transaction: {
    get: (ref: FakeDocumentReference) => Promise<FakeSnapshot>;
    set: (ref: FakeDocumentReference, value: StoredDocument) => void;
  }) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const result = await callback({
      get: (ref) => ref.get(),
      set: (ref, value) => writes.push(() => { void ref.set(value); }),
    });
    for (const write of writes) write();
    return result;
  }
}

const mocks = vi.hoisted(() => ({
  firestore: null as FakeFirestore | null,
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => mocks.firestore,
  verifyIdToken: vi.fn(),
}));

import {
  consumeFieldExchangeToken,
  exchangeLegacyFieldKey,
  FIELD_ACCESS_COOKIE,
  FIELD_EXCHANGE_TTL_MS,
  FIELD_SESSION_TTL_MS,
  mintFieldExchangeToken,
  verifyFieldAccess,
} from "@/lib/auth/verifyRole";

const BUSINESS_ID = "biz-field-test";
const FIELD_KEY = "field-key-0123456789abcdef";
const NOW = new Date("2026-07-21T12:00:00.000Z");

function request(path: string, token?: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      ...headers,
      ...(token ? { cookie: `${FIELD_ACCESS_COOKIE}=${token}` } : {}),
    },
  });
}

function statusOf(result: Awaited<ReturnType<typeof verifyFieldAccess>>) {
  return "error" in result ? result.error.status : 200;
}

describe("scoped field access tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.CRON_SECRET = "test-server-secret-with-enough-entropy";
    process.env.ENABLE_LEGACY_FIELD_KEY_FALLBACK = "true";
    mocks.firestore = new FakeFirestore();
    mocks.firestore.documents.set(`businesses/${BUSINESS_ID}`, { fieldKey: FIELD_KEY });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
    delete process.env.ENABLE_LEGACY_FIELD_KEY_FALLBACK;
  });

  it("fails closed when the server signing secret is missing", () => {
    delete process.env.CRON_SECRET;
    expect(() => mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY)).toThrow(
      "Field access is not configured",
    );
  });

  it("rejects a missing or malformed field session", async () => {
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`),
      BUSINESS_ID,
    ))).toBe(401);
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`, "not-a-token"),
      BUSINESS_ID,
    ))).toBe(401);
  });

  it("rejects tampered and expired exchange grants", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    const tampered = `${grant.token.slice(0, -1)}${grant.token.endsWith("a") ? "b" : "a"}`;
    expect(await consumeFieldExchangeToken(tampered)).toMatchObject({ ok: false, status: 401 });

    vi.setSystemTime(NOW.getTime() + FIELD_EXCHANGE_TTL_MS + 1);
    expect(await consumeFieldExchangeToken(grant.token)).toMatchObject({
      ok: false,
      status: 401,
      error: "Field access token expired",
    });
  });

  it("rejects replay of a consumed one-time exchange grant", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    expect((await consumeFieldExchangeToken(grant.token)).ok).toBe(true);
    expect(await consumeFieldExchangeToken(grant.token)).toMatchObject({
      ok: false,
      status: 401,
      error: "Field exchange link already used",
    });
  });

  it("rejects grants and sessions after fieldKey rotation", async () => {
    const revokedGrant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    mocks.firestore!.documents.set(`businesses/${BUSINESS_ID}`, {
      fieldKey: "rotated-key-0123456789abcdef",
    });
    expect(await consumeFieldExchangeToken(revokedGrant.token)).toMatchObject({
      ok: false,
      status: 401,
      error: "Field access revoked",
    });

    mocks.firestore!.documents.set(`businesses/${BUSINESS_ID}`, { fieldKey: FIELD_KEY });
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    const session = await consumeFieldExchangeToken(grant.token);
    expect(session.ok).toBe(true);
    mocks.firestore!.documents.set(`businesses/${BUSINESS_ID}`, {
      fieldKey: "rotated-again-0123456789abcdef",
    });
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`, session.ok ? session.token : ""),
      BUSINESS_ID,
    ))).toBe(401);
  });

  it("rejects an expired field session", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    const session = await consumeFieldExchangeToken(grant.token);
    expect(session.ok).toBe(true);
    vi.setSystemTime(NOW.getTime() + FIELD_SESSION_TTL_MS + 1);
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`, session.ok ? session.token : ""),
      BUSINESS_ID,
    ))).toBe(401);
  });

  it("prevents a job-scoped session from listing or touching another job", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY, "J-100");
    const session = await consumeFieldExchangeToken(grant.token);
    expect(session.ok).toBe(true);
    const token = session.ok ? session.token : "";

    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`, token),
      BUSINESS_ID,
    ))).toBe(403);
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs/J-200/updates?businessId=${BUSINESS_ID}`, token),
      BUSINESS_ID,
    ))).toBe(403);
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs/J-100/updates?businessId=${BUSINESS_ID}`, token),
      BUSINESS_ID,
    ))).toBe(200);
  });

  it("prevents a field session from crossing business boundaries", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    const session = await consumeFieldExchangeToken(grant.token);
    expect(session.ok).toBe(true);
    expect(statusOf(await verifyFieldAccess(
      request("/api/jobs?businessId=other", session.ok ? session.token : ""),
      "other",
    ))).toBe(403);
  });

  it("accepts a valid business-scoped session and records exchange/access audits", async () => {
    const grant = mintFieldExchangeToken(BUSINESS_ID, FIELD_KEY);
    const session = await consumeFieldExchangeToken(grant.token);
    expect(session.ok).toBe(true);
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}`, session.ok ? session.token : ""),
      BUSINESS_ID,
    ))).toBe(200);

    const audits = [...mocks.firestore!.documents.entries()]
      .filter(([path]) => path.startsWith("fieldAccessAuditEvents/"))
      .map(([, value]) => value.action);
    expect(audits).toEqual(expect.arrayContaining(["exchange", "access"]));
  });

  it("keeps legacy keys behind the temporary feature flag", async () => {
    process.env.ENABLE_LEGACY_FIELD_KEY_FALLBACK = "false";
    expect(await exchangeLegacyFieldKey(BUSINESS_ID, FIELD_KEY)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(statusOf(await verifyFieldAccess(
      request(`/api/jobs?businessId=${BUSINESS_ID}&key=${FIELD_KEY}`),
      BUSINESS_ID,
    ))).toBe(401);

    process.env.ENABLE_LEGACY_FIELD_KEY_FALLBACK = "true";
    expect((await exchangeLegacyFieldKey(BUSINESS_ID, FIELD_KEY)).ok).toBe(true);
  });
});
