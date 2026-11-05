import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { verifyIdToken } from "@/lib/firebase/admin";
import { resolveViewAs, evictViewAs, VIEW_AS_READ_ONLY, type ViewAsSession } from "@/lib/auth/viewAs";
import { verifyAuthAndRole, verifyOwnBusinessRole, verifyFieldAccess, verifySuperadmin } from "@/lib/auth/verifyRole";
import { invalidateProducts } from "@/lib/products/productCache";
import { GET as choices, POST, DELETE } from "@/app/api/admin/view-as/route";
import { GET as profile } from "@/app/api/auth/profile/route";
import { DELETE as signOut } from "@/app/api/auth/session/route";

let db: FakeDb;
let liveClaim = true;
const ids = new Set<string>();
const ID = "a".repeat(43);
const users: Record<string, { uid: string; superadmin?: boolean; email?: string; auth_time: number }> = {
  root: { uid: "root", superadmin: true, email: "root@test.invalid", auth_time: 1 },
  otherRoot: { uid: "other-root", superadmin: true, auth_time: 1 },
  staff: { uid: "staff", auth_time: 1 },
};
let platformUid: string | null = null;
let disabledUid: string | null = null;
let authFails = false;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => db,
  verifyIdToken: vi.fn(async (token: string) => users[token] ?? null),
  confirmSuperadminClaim: vi.fn(async (user: { superadmin?: boolean }) => liveClaim && user.superadmin === true),
  getAdminAuth: () => ({ getUser: async (uid: string) => {
    if (authFails) throw new Error("Auth unavailable");
    return { uid, disabled: uid === disabledUid, customClaims: { superadmin: uid === platformUid } };
  } }),
}));

function req(method = "GET", path = "/api/company/library", token = "root", id: string | null = ID, body?: unknown, extraHeaders = {}) {
  return new NextRequest(`http://localhost${path}`, { method,
    headers: { cookie: `__session=${token}${id ? `; __viewas=${id}` : ""}`, "Content-Type": "application/json", ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function seedSession(patch: Partial<ViewAsSession> = {}, id = ID) {
  evictViewAs(id); ids.add(id);
  db.__seed("viewAsSessions", id, { uid: "root", businessId: "a", role: "staff", trade: "office", label: "Office staff",
    createdAt: Date.now(), expiresAt: Date.now() + 3600_000, endedAt: null, ...patch });
}
async function resolve(request = req(), token = "root") { return resolveViewAs(request, (await verifyIdToken(token))!); }
async function denied(result: Awaited<ReturnType<typeof verifyAuthAndRole>>, message?: string) {
  expect(result).toHaveProperty("error");
  if ("error" in result) { expect(result.error.status).toBe(403); if (message) expect(await result.error.json()).toMatchObject({ error: message, code: "view_as_read_only" }); }
}
async function start(body: unknown = { businessId: "a", userType: "office" }, token = "root") {
  const res = await POST(req("POST", "/api/admin/view-as", token, null, body));
  const cookie = res.cookies.get("__viewas")?.value;
  if (cookie) ids.add(cookie);
  return res;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  for (const id of ids) evictViewAs(id);
  ids.clear(); liveClaim = true; platformUid = null; disabledUid = null; authFails = false;
  db = makeFakeDb(); invalidateProducts("a"); invalidateProducts("b");
  db.__seed("businesses", "a", { businessName: "Roof Pros", industry: "roofing" });
  db.__seed("businesses", "b", { businessName: "Other business", industry: "roofing" });
  db.__seed("businessUsers", "staff", { businessId: "a", role: "staff", trade: "office", active: true, displayName: "Carlita", email: "private@test.invalid" });
  seedSession();
});
afterEach(() => { vi.useRealTimers(); });

describe("resolveViewAs: bearer cookie is insufficient", () => {
  it("rejects another confirmed superadmin's uid", async () => { expect(await resolve(req("GET", "/api/jobs", "otherRoot"), "otherRoot")).toBeNull(); });
  it("rejects an expired session, including exact expiry", async () => { seedSession({ expiresAt: Date.now() }); expect(await resolve()).toBeNull(); });
  it("rejects an ended session", async () => { seedSession({ endedAt: Date.now() }); expect(await resolve()).toBeNull(); });
  it("rejects a non-superadmin with a valid cookie, even if the doc names them", async () => { seedSession({ uid: "staff" }); expect(await resolve(req("GET", "/api/jobs", "staff"), "staff")).toBeNull(); });
  it("rejects a removed live claim even after a cache hit", async () => { expect(await resolve()).not.toBeNull(); liveClaim = false; expect(await resolve()).toBeNull(); });
  it("rejects a missing document", async () => { expect(await resolve(req("GET", "/api/jobs", "root", "z".repeat(43)))).toBeNull(); });
  it("rejects absent or malformed cookie ids", async () => { expect(await resolve(req("GET", "/api/jobs", "root", null))).toBeNull(); expect(await resolve(req("GET", "/api/jobs", "root", "../x"))).toBeNull(); });
  it("accepts the bound live identity and caches for no more than 30 seconds", async () => {
    expect(await resolve()).toMatchObject({ uid: "root", businessId: "a", role: "staff" });
    db.__seed("viewAsSessions", ID, { endedAt: Date.now() });
    vi.advanceTimersByTime(29_999); expect(await resolve()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(await resolve()).toBeNull();
  });
  it("checks expiry on a cache hit", async () => { seedSession({ expiresAt: Date.now() + 100 }); await resolve(); vi.advanceTimersByTime(100); expect(await resolve()).toBeNull(); });
});

describe("real central guards under view-as", () => {
  it("office staff cannot reach owner-only routes", async () => { await denied(await verifyAuthAndRole(req(), "a", ["owner"])); });
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "PROPFIND"]) {
    it(`refuses ${method} before role checks in role, own-business and field guards`, async () => {
      const request = req(method);
      await denied(await verifyAuthAndRole(request, "a", ["owner"]), VIEW_AS_READ_ONLY);
      await denied(await verifyOwnBusinessRole(request, ["owner"]), VIEW_AS_READ_ONLY);
      await denied(await verifyFieldAccess(request, "a", { write: true }), VIEW_AS_READ_ONLY);
    });
  }
  it("does not fall through to a field cookie or offline field identity", async () => {
    await denied(await verifyFieldAccess(req("POST", "/api/jobs/J-1/updates", "root", ID, undefined,
      { cookie: `__session=root; __viewas=${ID}; __field_access=some-grant`, "x-offline-owner": "field:a:token" }), "a", { write: true }), VIEW_AS_READ_ONLY);
  });
  it("crew is refused on office routes and carries its crew scope on field reads", async () => {
    seedSession({ role: "crew", trade: "inspector", crewId: "crew-1" });
    await denied(await verifyAuthAndRole(req(), "a", ["owner", "staff", "viewer"]));
    expect(await verifyFieldAccess(req("GET", "/api/jobs"), "a")).toMatchObject({ user: { uid: "root", superadmin: false, viewAs: true, role: "crew", trade: "inspector", crewId: "crew-1" } });
  });
  it("enforces purchased products through both role and field guards", async () => {
    db.__seed("businesses", "a", { products: { field: false } });
    await denied(await verifyAuthAndRole(req("GET", "/api/jobs"), "a", ["staff"]));
    await denied(await verifyFieldAccess(req("GET", "/api/jobs"), "a"));
  });
  it("retains the real uid, never grants a superadmin bypass, and accepts GET/HEAD", async () => {
    for (const method of ["GET", "HEAD"]) expect(await verifyAuthAndRole(req(method), "a", ["staff"])).toMatchObject({ user: { uid: "root", superadmin: false, role: "staff", viewAs: true } });
    expect(await verifyOwnBusinessRole(req(), ["staff"])).toMatchObject({ user: { businessId: "a", uid: "root", viewAs: true } });
  });
  it("keeps existing superadmin behavior for a different business and admin routes", async () => {
    expect(await verifyAuthAndRole(req("POST"), "b", ["owner"])).toMatchObject({ user: { superadmin: true, uid: "root" } });
    expect(await verifyAuthAndRole(req("POST", "/api/admin/businesses/a/products"), "a", ["owner"])).toMatchObject({ user: { superadmin: true } });
    expect(await verifySuperadmin(req("POST", "/api/admin/view-as"))).toMatchObject({ user: { superadmin: true } });
  });
  it("refuses writes on platform-only superadmin routes (tools/agent can contact a customer)", async () => {
    for (const path of ["/api/tools/execute", "/api/agent/respond", "/api/agent/classify"]) {
      await denied(await verifySuperadmin(req("POST", path)), VIEW_AS_READ_ONLY);
    }
    expect(await verifySuperadmin(req("GET", "/api/tools/execute"))).toMatchObject({ user: { superadmin: true } });
  });
});

describe("start, end, menu and sign-out routes", () => {
  it("refuses non-superadmin start, end and choices", async () => {
    expect((await start(undefined, "staff")).status).toBe(403);
    expect((await DELETE(req("DELETE", "/api/admin/view-as", "staff"))).status).toBe(403);
    expect((await choices(req("GET", "/api/admin/view-as?businessId=a", "staff"))).status).toBe(403);
  });
  it("refuses a removed live claim", async () => { liveClaim = false; expect((await start()).status).toBe(403); });
  it("refuses foreign, inactive and missing members", async () => {
    for (const patch of [{ businessId: "b" }, { businessId: "a", active: false }, { businessId: "a", role: "superadmin" }]) {
      db.__seed("businessUsers", "foreign", { role: "staff", ...patch });
      expect((await start({ businessId: "a", memberUid: "foreign" })).status).toBe(403);
    }
    expect((await start({ businessId: "a", memberUid: "missing" })).status).toBe(403);
  });
  it("refuses platform accounts from claim or doc flag, and fails closed if Auth is unavailable", async () => {
    platformUid = "staff"; expect((await start({ businessId: "a", memberUid: "staff" })).status).toBe(403);
    platformUid = null; db.__seed("businessUsers", "staff", { businessId: "a", role: "staff", superadmin: true });
    expect((await start({ businessId: "a", memberUid: "staff" })).status).toBe(403);
    authFails = true; expect((await start({ businessId: "a", memberUid: "staff" })).status).toBe(403);
  });
  it("requires an existing tenant and exactly one known selector", async () => {
    expect((await start({ businessId: "missing", userType: "office" })).status).toBe(404);
    for (const body of [null, { businessId: "a" }, { businessId: "a", userType: "superadmin" }, { businessId: "a", userType: "office", memberUid: "staff" }, { businessId: "a/b", userType: "office" }]) expect((await start(body)).status).toBe(400);
  });
  it("writes the audited 60-minute server session and correct cookie flags without returning its id", async () => {
    const res = await start(); expect(res.status).toBe(200);
    const id = res.cookies.get("__viewas")!.value; expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(db.__peek("viewAsSessions", id)).toMatchObject({ uid: "root", businessId: "a", role: "staff", trade: "office", endedAt: null, expiresAt: Date.now() + 3600_000 });
    const audit = await db.collection("adminAuditEvents").get();
    expect(audit.docs.map((d) => d.data())).toEqual([expect.objectContaining({ action: "view_as.started", actorUid: "root", businessId: "a" })]);
    expect(JSON.stringify(audit.docs.map((d) => d.data()))).not.toContain(id);
    expect(await res.json()).toEqual({ landingPath: "/company/dashboard" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "SameSite=strict", "Path=/", "Max-Age=3600", "Secure"]) expect(cookie).toContain(flag);
  });
  it("uses the member's own role/trade/crew and never their identity", async () => {
    db.__seed("businessUsers", "inspector", { businessId: "a", role: "crew", trade: "inspector", crewId: "c1", displayName: "Inez" });
    const res = await start({ businessId: "a", memberUid: "inspector" });
    expect(await res.json()).toEqual({ landingPath: "/company/field" });
    expect(db.__peek("viewAsSessions", res.cookies.get("__viewas")!.value)).toMatchObject({ uid: "root", memberUid: "inspector", role: "crew", trade: "inspector", crewId: "c1", label: "Inez — Inspector" });
  });
  it("filters choices and rejects field roles when products or industry exclude Jobs", async () => {
    for (const business of [{ industry: "dental" }, { industry: "roofing", products: { field: false } }]) {
      db.__seed("businesses", "a", business);
      const data = await (await choices(req("GET", "/api/admin/view-as?businessId=a"))).json();
      expect(data.types.map((t: { id: string }) => t.id)).toEqual(["owner", "office", "viewer"]);
      expect((await start({ businessId: "a", userType: "crew" })).status).toBe(403);
    }
  });
  it("lists six presets and active non-platform team members without email", async () => {
    db.__seed("businessUsers", "inactive", { businessId: "a", role: "staff", active: false });
    db.__seed("businessUsers", "platform", { businessId: "a", role: "owner" }); platformUid = "platform";
    const res = await choices(req("GET", "/api/admin/view-as?businessId=a")); const data = await res.json();
    expect(data.types).toHaveLength(6); expect(data.members).toEqual([{ uid: "staff", label: "Carlita — Office staff" }]);
    expect(JSON.stringify(data)).not.toContain("private@test.invalid");
  });
  it("ends even an expired session, evicts the cache, clears the cookie and is idempotent", async () => {
    await resolve();
    const res = await DELETE(req("DELETE", "/api/admin/view-as"));
    expect(res.status).toBe(200); expect(db.__peek("viewAsSessions", ID)).toHaveProperty("endedAt", Date.now());
    expect(await resolve()).toBeNull(); expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await DELETE(req("DELETE", "/api/admin/view-as"))).status).toBe(200);
    seedSession({ expiresAt: Date.now() - 1 }); expect((await DELETE(req("DELETE", "/api/admin/view-as"))).status).toBe(200);
    const audit = await db.collection("adminAuditEvents").get(); expect(audit.docs.some((d) => d.data()?.action === "view_as.ended")).toBe(true);
  });
  it("cannot end somebody else's session, and clears sign-out cookies even for an expired login", async () => {
    await DELETE(req("DELETE", "/api/admin/view-as", "otherRoot")); expect(db.__peek("viewAsSessions", ID)).toHaveProperty("endedAt", null);
    const res = await signOut(req("DELETE", "/api/auth/session", "invalid"));
    expect(res.status).toBe(200); expect(res.cookies.get("__viewas")?.value).toBe(""); expect(res.cookies.get("__session")?.value).toBe("");
    await signOut(req("DELETE", "/api/auth/session")); expect(await resolve()).toBeNull();
  });
});

describe("profile and Firestore boundary", () => {
  it("projects role, tenant, trade, crew and banner metadata without viewed email or uid", async () => {
    seedSession({ memberUid: "staff", crewId: "c1" });
    const res = await profile(req("GET", "/api/auth/profile")); const data = await res.json();
    expect(data.profile).toMatchObject({ uid: "root", email: null, superadmin: false, role: "staff", trade: "office", crewId: "c1", businessId: "a", viewAs: { label: "Office staff", businessName: "Roof Pros", businessId: "a", expiresAt: Date.now() + 3600_000 } });
    expect(JSON.stringify(data)).not.toContain(ID); expect(JSON.stringify(data)).not.toContain("private@test.invalid");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("keeps the real platform profile in Admin tabs and never projects for a copied cookie", async () => {
    const real = await (await profile(req("GET", "/api/auth/profile?context=admin"))).json();
    expect(real.profile.superadmin).toBe(true); expect(real.profile.viewAs).toBeUndefined();
    const copied = await (await profile(req("GET", "/api/auth/profile", "staff"))).json();
    expect(copied.profile.uid).toBe("staff"); expect(copied.profile.viewAs).toBeUndefined();
  });
  it("explicitly denies client reads and writes to sessions and keeps the default deny", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toMatch(/match \/viewAsSessions\/\{sessionId\}\s*\{\s*allow read, write: if false;\s*\}/);
    expect(rules).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  });
});
