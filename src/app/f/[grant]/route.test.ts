import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  openJobLink: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  consumeFieldExchangeToken: mocks.consume,
  openFieldJobLink: mocks.openJobLink,
  FIELD_ACCESS_COOKIE: "__field_access",
  FIELD_SESSION_TTL_MS: 43_200_000,
}));

let currentDb: unknown = null;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => currentDb,
}));

function makeGrantDb(grant: Record<string, unknown> | undefined, jobLink?: Record<string, unknown>) {
  const deletes: string[] = [];
  const ref = {
    get: async () => ({ exists: grant !== undefined, data: () => grant }),
    delete: async () => { deletes.push("deleted"); },
  };
  const db = {
    collection: (name: string) => {
      if (name === "fieldJobLinks") return { doc: () => ({ get: async () => ({ exists: jobLink !== undefined, data: () => jobLink }) }) };
      if (name !== "fieldAccessGrants") throw new Error(`unexpected collection ${name}`);
      return { doc: () => ref };
    },
  };
  return { db, deletes };
}

function requestFor(grant: string) {
  return new NextRequest(`http://localhost/f/${grant}`);
}

import { GET } from "@/app/f/[grant]/route";

describe("GET /f/[grant] — reusable job link", () => {
  beforeEach(() => { mocks.consume.mockReset(); mocks.openJobLink.mockReset(); _resetRateLimitState(); });

  it("opens on any number of phones: each open gets a session, the link is never deleted", async () => {
    const { db, deletes } = makeGrantDb(undefined, { businessId: "biz-1", jobId: "J-1", fieldKeyTag: "t", createdAt: Date.now() });
    currentDb = db;
    mocks.openJobLink.mockResolvedValue({ ok: true, token: "session-a", businessId: "biz-1", jobId: "J-1", expiresAt: Date.now() + 43_200_000 });
    for (let i = 0; i < 3; i++) {
      const response = await GET(requestFor("link1"), { params: Promise.resolve({ grant: "link1" }) });
      expect(response.headers.get("location")).toBe("http://localhost/field");
      expect(response.headers.get("set-cookie")).toContain("__field_access=session-a");
    }
    expect(mocks.openJobLink).toHaveBeenCalledTimes(3);
    expect(deletes).toHaveLength(0);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("a stopped link is denied and clears any old session cookie", async () => {
    const { db } = makeGrantDb(undefined, { businessId: "biz-1", jobId: "J-1", revokedAt: 1 });
    currentDb = db;
    mocks.openJobLink.mockResolvedValue({ ok: false, status: 401, error: "Field link stopped" });
    const response = await GET(requestFor("link1"), { params: Promise.resolve({ grant: "link1" }) });
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
  });
});

describe("GET /f/[grant]", () => {
  beforeEach(() => {
    mocks.consume.mockReset();
    _resetRateLimitState();
  });

  it("resolves a valid short grant, consumes the real token, and redirects to a bare /field", async () => {
    const { db, deletes } = makeGrantDb({
      token: "signed-grant-token",
      businessId: "biz-1",
      jobId: "J-1",
      expiresAt: Date.now() + 600_000,
    });
    currentDb = db;
    mocks.consume.mockResolvedValue({
      ok: true,
      token: "signed-session-token",
      businessId: "biz-1",
      jobId: "J-1",
      expiresAt: Date.now() + 43_200_000,
    });

    const response = await GET(requestFor("short123"), { params: Promise.resolve({ grant: "short123" }) });

    expect(mocks.consume).toHaveBeenCalledWith("signed-grant-token", expect.anything());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field");
    expect(response.headers.get("set-cookie")).toContain("__field_access=signed-session-token");
    expect(deletes).toHaveLength(1); // the short-id alias is deleted on lookup either way
  });

  it("redirects to a denied URL for an unknown short grant, without calling consume", async () => {
    const { db } = makeGrantDb(undefined);
    currentDb = db;

    const response = await GET(requestFor("does-not-exist"), { params: Promise.resolve({ grant: "does-not-exist" }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("redirects to denied for an expired short grant without calling consume", async () => {
    const { db } = makeGrantDb({
      token: "signed-grant-token",
      businessId: "biz-1",
      expiresAt: Date.now() - 1,
    });
    currentDb = db;

    const response = await GET(requestFor("stale"), { params: Promise.resolve({ grant: "stale" }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("redirects to denied when the underlying signed token is rejected", async () => {
    const { db } = makeGrantDb({
      token: "signed-grant-token",
      businessId: "biz-1",
      expiresAt: Date.now() + 600_000,
    });
    currentDb = db;
    mocks.consume.mockResolvedValue({ ok: false, status: 401, error: "already used" });

    const response = await GET(requestFor("used-already"), { params: Promise.resolve({ grant: "used-already" }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
  });

  it("never leaks the underlying signed token into the redirect location", async () => {
    const { db } = makeGrantDb({
      token: "super-secret-300-char-token",
      businessId: "biz-1",
      expiresAt: Date.now() + 600_000,
    });
    currentDb = db;
    mocks.consume.mockResolvedValue({
      ok: true, token: "session-token", businessId: "biz-1", expiresAt: Date.now() + 1000,
    });

    const response = await GET(requestFor("g1"), { params: Promise.resolve({ grant: "g1" }) });
    expect(response.headers.get("location")).not.toContain("super-secret-300-char-token");
  });

  it("redirects to denied when Firestore is unavailable", async () => {
    currentDb = null;
    const response = await GET(requestFor("g1"), { params: Promise.resolve({ grant: "g1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/field?access=denied");
  });
});
