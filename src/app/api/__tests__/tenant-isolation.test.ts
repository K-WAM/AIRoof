import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

// The first test in this file imports several route modules; under a full parallel `vitest run` that alone can pass 5 s.
vi.setConfig({ testTimeout: 30_000 });

// T-170 — negative-first tenant isolation through the REAL guard (verifyAuthAndRole / verifySuperadmin / verifyFieldAccess)
// and the REAL route handlers. Only the Firebase edge is faked: the session cookie names a test identity, and Firestore is
// the in-memory fake. Every case below must be refused, and no other tenant's data may appear in the response.

const SESSIONS: Record<string, { uid: string; email: string; superadmin?: boolean; auth_time: number }> = {
  "tok-owner-a": { uid: "owner-a", email: "owner@a.test", auth_time: 1 },
  "tok-staff-a": { uid: "staff-a", email: "staff@a.test", auth_time: 1 },
  "tok-viewer-a": { uid: "viewer-a", email: "viewer@a.test", auth_time: 1 },
  "tok-crew-a": { uid: "crew-a", email: "crew@a.test", auth_time: 1 },
  "tok-disabled-a": { uid: "disabled-a", email: "disabled@a.test", auth_time: 1 },
  "tok-stale-a": { uid: "stale-a", email: "stale@a.test", auth_time: 1 }, // NH-28's shape: owner doc with superadmin: true
};

let db: FakeDb;

vi.mock("@/lib/firebase/admin", () => ({
  verifyIdToken: vi.fn(async (token: string) => SESSIONS[token] ?? null),
  confirmSuperadminClaim: vi.fn(async (decoded: { superadmin?: boolean }) => decoded.superadmin === true),
  getAdminFirestore: vi.fn(() => db),
  getAdminAuth: vi.fn(() => ({
    getUser: vi.fn(async () => ({ customClaims: {} })),
    getUsers: vi.fn(async () => ({ users: [] })),
    updateUser: vi.fn(async () => ({})),
    revokeRefreshTokens: vi.fn(async () => undefined),
  })),
}));

const SECRET_B = "SECRET-TENANT-B-DATA";

function seed() {
  db = makeFakeDb();
  db.__seed("businesses", "biz-a", { businessName: "A Roofing", industry: "roofing", fieldKey: "field-key-a-0123456789" });
  db.__seed("businesses", "biz-b", { businessName: SECRET_B, industry: "roofing", fieldKey: "field-key-b-0123456789" });
  db.__seed("businesses/biz-b/jobs", "J-1000", { jobId: "J-1000", title: SECRET_B, clientName: SECRET_B, status: "scheduled", createdAt: 1 });
  db.__seed("businesses/biz-b/calls", "call-b", { callId: "call-b", summary: SECRET_B, createdAt: 1 });
  db.__seed("businesses/biz-b/customers", "cust-b", { name: SECRET_B, createdAt: 1 });
  db.__seed("businesses/biz-b/appointments", "appt-b", { callerName: SECRET_B, startTime: 2, createdAt: 1 });
  db.__seed("businessUsers", "owner-a", { uid: "owner-a", businessId: "biz-a", role: "owner", active: true, email: "owner@a.test" });
  db.__seed("businessUsers", "staff-a", { uid: "staff-a", businessId: "biz-a", role: "staff", active: true });
  db.__seed("businessUsers", "viewer-a", { uid: "viewer-a", businessId: "biz-a", role: "viewer", active: true });
  db.__seed("businessUsers", "crew-a", { uid: "crew-a", businessId: "biz-a", role: "crew", active: true });
  db.__seed("businessUsers", "disabled-a", { uid: "disabled-a", businessId: "biz-a", role: "owner", active: false });
  db.__seed("businessUsers", "stale-a", { uid: "stale-a", businessId: "biz-a", role: "owner", active: true, superadmin: true });
  db.__seed("businessUsers", "member-b", { uid: "member-b", businessId: "biz-b", role: "staff", active: true, email: SECRET_B });
}

type Call = { query?: Record<string, string>; body?: Record<string, unknown>; params?: Record<string, string> };

function request(token: string, method: string, path: string, call: Call): NextRequest {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(call.query ?? {})) url.searchParams.set(key, value);
  return new NextRequest(url, {
    method,
    headers: { cookie: `__session=${token}`, "content-type": "application/json" },
    ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(call.body ?? {}) }),
  });
}

type Handler = (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function invoke(mod: Record<string, unknown>, method: string, token: string, path: string, call: Call) {
  const handler = mod[method] as Handler | undefined;
  if (!handler) throw new Error(`${path} has no ${method}`);
  const res = await handler(request(token, method, path, call), { params: Promise.resolve(call.params ?? {}) });
  return { status: res.status, text: await res.text() };
}

// Representative route families, each pointed at tenant B by a tenant-A session.
const FOREIGN: Array<[string, () => Promise<Record<string, unknown>>, string, string, Call]> = [
  ["jobs list", () => import("@/app/api/jobs/route"), "GET", "/api/jobs", { query: { businessId: "biz-b" } }],
  ["job create", () => import("@/app/api/jobs/route"), "POST", "/api/jobs", { body: { businessId: "biz-b", title: "x", clientName: "x" } }],
  ["job detail", () => import("@/app/api/jobs/[jobId]/route"), "GET", "/api/jobs/J-1000", { query: { businessId: "biz-b" }, params: { jobId: "J-1000" } }],
  ["jobs export", () => import("@/app/api/jobs/export/route"), "GET", "/api/jobs/export", { query: { businessId: "biz-b" } }],
  ["call detail", () => import("@/app/api/calls/[callId]/route"), "GET", "/api/calls/call-b", { query: { businessId: "biz-b" }, params: { callId: "call-b" } }],
  ["appointments", () => import("@/app/api/businesses/[businessId]/appointments/route"), "GET", "/api/businesses/biz-b/appointments", { params: { businessId: "biz-b" } }],
  ["library", () => import("@/app/api/company/library/route"), "GET", "/api/company/library", { query: { businessId: "biz-b" } }],
  ["customers", () => import("@/app/api/company/customers/route"), "GET", "/api/company/customers", { query: { businessId: "biz-b" } }],
  ["quote", () => import("@/app/api/jobs/[jobId]/quote/route"), "GET", "/api/jobs/J-1000/quote", { query: { businessId: "biz-b" }, params: { jobId: "J-1000" } }],
  ["invoice", () => import("@/app/api/jobs/[jobId]/invoice/route"), "GET", "/api/jobs/J-1000/invoice", { query: { businessId: "biz-b" }, params: { jobId: "J-1000" } }],
  ["report", () => import("@/app/api/jobs/[jobId]/report/route"), "POST", "/api/jobs/J-1000/report", { body: { businessId: "biz-b" }, params: { jobId: "J-1000" } }],
  ["team list", () => import("@/app/api/company/team/route"), "GET", "/api/company/team", { query: { businessId: "biz-b" } }],
  ["team member edit", () => import("@/app/api/company/team/[uid]/route"), "PATCH", "/api/company/team/member-b", { body: { businessId: "biz-b", role: "viewer" }, params: { uid: "member-b" } }],
];

const TENANT_A_ROLES = ["tok-owner-a", "tok-staff-a", "tok-viewer-a", "tok-crew-a", "tok-stale-a"];

describe("a tenant-A session can never reach tenant B (T-170)", () => {
  beforeEach(() => {
    seed();
  });

  for (const [name, load, method, path, call] of FOREIGN) {
    it(`${name}: refused for owner/staff/viewer/crew and a stale doc-flag owner, with no tenant-B data in the reply`, async () => {
      const mod = await load();
      for (const token of TENANT_A_ROLES) {
        const { status, text } = await invoke(mod, method, token, path, call);
        expect([401, 403], `${token} → ${status}`).toContain(status);
        expect(text).not.toContain(SECRET_B);
      }
      expect(db.__peek("businessUsers", "member-b")).toMatchObject({ role: "staff" });
    });
  }

  it("?preview= is not authority: an owner of A asking for B with preview=B is refused", async () => {
    const mod = await import("@/app/api/company/library/route");
    const { status, text } = await invoke(mod, "GET", "tok-owner-a", "/api/company/library", { query: { businessId: "biz-b", preview: "biz-b" } });
    expect(status).toBe(403);
    expect(text).not.toContain(SECRET_B);
  });

  it("a disabled member is refused on their own former tenant", async () => {
    const mod = await import("@/app/api/company/library/route");
    const { status } = await invoke(mod, "GET", "tok-disabled-a", "/api/company/library", { query: { businessId: "biz-a" } });
    expect(status).toBe(403);
  });

  it("a live member of A still reaches A (the guard is not simply closed)", async () => {
    const mod = await import("@/app/api/company/library/route");
    const { status } = await invoke(mod, "GET", "tok-owner-a", "/api/company/library", { query: { businessId: "biz-a" } });
    expect(status).toBe(200);
  });
});

describe("every /api/admin handler refuses tenant sessions, including a stale doc-flag superadmin (T-170)", () => {
  beforeEach(() => {
    seed();
  });

  const adminRoot = join(process.cwd(), "src", "app", "api", "admin");
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name !== "__tests__") walk(path); } else if (name === "route.ts") routes.push(path);
    }
  };
  walk(adminRoot);

  it("finds the admin routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of routes) {
    const rel = relative(join(process.cwd(), "src"), file).split(sep).join("/").replace(/\.ts$/, "");
    it(rel.replace("app/api/", "/api/").replace("/route", ""), async () => {
      const mod = (await import(/* @vite-ignore */ `@/${rel}`)) as Record<string, unknown>;
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((method) => typeof mod[method] === "function");
      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        for (const token of ["tok-owner-a", "tok-stale-a"]) {
          const { status, text } = await invoke(mod, method, token, "/api/admin/x", {
            query: { businessId: "biz-b" },
            body: { businessId: "biz-b" },
            params: { businessId: "biz-b", invoiceId: "inv-1" },
          });
          expect([401, 403], `${method} as ${token} → ${status}`).toContain(status);
          expect(text).not.toContain(SECRET_B);
        }
      }
    });
  }
});
