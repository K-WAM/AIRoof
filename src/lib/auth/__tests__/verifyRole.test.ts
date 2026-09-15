import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

function makeDb(member: Record<string, unknown> | undefined) {
  const getCalls: string[] = [];
  const docRef = {
    get: async () => {
      getCalls.push("get");
      return { exists: member !== undefined, data: () => member };
    },
  };
  const db = {
    collection: (name: string) => {
      if (name !== "businessUsers") throw new Error(`unexpected collection ${name}`);
      return { doc: () => docRef };
    },
  };
  return { db, getCalls };
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => currentDb,
  verifyIdToken: mocks.verifyIdToken,
}));

let currentDb: unknown = null;

function sessionRequest(path = "/api/x") {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: "__session=fake-token" },
  });
}

describe("verifyAuthAndRole", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyIdToken.mockReset();
  });

  it("uses a point read (doc(uid).get()), not a composite where() query", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    const { db, getCalls } = makeDb({ role: "staff", businessId: "biz-1", active: true });
    currentDb = db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["owner", "staff"]);

    expect("user" in result).toBe(true);
    expect(getCalls).toHaveLength(1); // exactly one point read, no query round trips
  });

  it("treats a legacy member doc with no `active` field as active (active !== false, not === true)", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "staff", businessId: "biz-1" /* no `active` field at all */ }).db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["staff"]);

    expect("user" in result).toBe(true);
  });

  it("rejects a member explicitly marked inactive", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "staff", businessId: "biz-1", active: false }).db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["staff"]);

    expect("error" in result && result.error.status).toBe(403);
  });

  it("rejects a member of a different business", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "staff", businessId: "biz-OTHER", active: true }).db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["staff"]);

    expect("error" in result && result.error.status).toBe(403);
  });

  it("rejects a role not in the allowed list", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "viewer", businessId: "biz-1", active: true }).db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["owner", "staff"]);

    expect("error" in result && result.error.status).toBe(403);
  });

  it("caches a member lookup across calls within the TTL", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    const { db, getCalls } = makeDb({ role: "staff", businessId: "biz-1", active: true });
    currentDb = db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    await verifyAuthAndRole(sessionRequest(), "biz-1", ["staff"]);
    await verifyAuthAndRole(sessionRequest(), "biz-1", ["staff"]);

    expect(getCalls).toHaveLength(1); // second call served from the memo
  });

  it("bypasses the memo whenever the allowed-roles check includes owner", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    const { db, getCalls } = makeDb({ role: "owner", businessId: "biz-1", active: true });
    currentDb = db;

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    await verifyAuthAndRole(sessionRequest(), "biz-1", ["owner"]);
    await verifyAuthAndRole(sessionRequest(), "biz-1", ["owner"]);

    expect(getCalls).toHaveLength(2); // never served stale for an ownership-gated check
  });

  it("superadmin bypasses membership lookup entirely", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "root", email: "root@x.com", superadmin: true });
    const { getCalls } = makeDb(undefined);
    currentDb = null; // even with no DB at all, superadmin must short-circuit before any read

    const { verifyAuthAndRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyAuthAndRole(sessionRequest(), "biz-1", ["owner"]);

    expect("user" in result && result.user.superadmin).toBe(true);
    expect(getCalls).toHaveLength(0);
  });
});

describe("verifyOwnBusinessRole", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyIdToken.mockReset();
  });

  it("resolves the caller's own business without a businessId input", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "staff", businessId: "biz-1", active: true }).db;

    const { verifyOwnBusinessRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyOwnBusinessRole(sessionRequest(), ["owner", "staff"]);

    expect("user" in result && result.user.businessId).toBe("biz-1");
  });

  it("rejects a superadmin (no 'own business' for a platform admin)", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "root", email: "root@x.com", superadmin: true });
    currentDb = makeDb(undefined).db;

    const { verifyOwnBusinessRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyOwnBusinessRole(sessionRequest(), ["owner", "staff"]);

    expect("error" in result && result.error.status).toBe(403);
  });

  it("rejects an inactive member", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "u1@x.com" });
    currentDb = makeDb({ role: "staff", businessId: "biz-1", active: false }).db;

    const { verifyOwnBusinessRole } = await import("@/lib/auth/verifyRole");
    const result = await verifyOwnBusinessRole(sessionRequest(), ["owner", "staff"]);

    expect("error" in result && result.error.status).toBe(403);
  });
});
