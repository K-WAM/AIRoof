import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// T-170 — Firestore security rules, tested against the emulator loaded with firestore.rules (npm run test:rules).
// Talks to the emulator's REST API directly: "Bearer owner" bypasses rules for seeding, and an unsigned JWT carries the
// test user's uid/claims (the emulator does not verify signatures). No extra dependency needed.

const PROJECT = process.env.GCLOUD_PROJECT || "demo-rules-test";
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8385";
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

type Claims = Record<string, unknown>;
type Auth = { uid: string; claims?: Claims } | null | "owner";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function tokenFor(uid: string, claims: Claims = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: "custom", identities: {} },
    ...claims,
  };
  return `${b64url({ alg: "none", kid: "fakekid", typ: "JWT" })}.${b64url(payload)}.`;
}

function headers(auth: Auth): Record<string, string> {
  const base = { "Content-Type": "application/json" };
  if (auth === null) return base;
  if (auth === "owner") return { ...base, Authorization: "Bearer owner" };
  return { ...base, Authorization: `Bearer ${tokenFor(auth.uid, auth.claims)}` };
}

function encode(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function fields(data: Record<string, unknown>) {
  return { fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) };
}

async function read(path: string, auth: Auth): Promise<number> {
  const res = await fetch(`${BASE}/${path}`, { headers: headers(auth) });
  return res.status;
}

async function write(path: string, data: Record<string, unknown>, auth: Auth): Promise<number> {
  const res = await fetch(`${BASE}/${path}`, { method: "PATCH", headers: headers(auth), body: JSON.stringify(fields(data)) });
  return res.status;
}

async function remove(path: string, auth: Auth): Promise<number> {
  const res = await fetch(`${BASE}/${path}`, { method: "DELETE", headers: headers(auth) });
  return res.status;
}

const ALLOWED = 200;
const DENIED = 403;

const ownerA = { uid: "owner-a" };
const staleFlag = { uid: "stale-flag" }; // a real member of biz-a whose doc still says superadmin: true (NH-28's shape)
const docOnlyAdmin = { uid: "doc-only-admin" }; // what the old provisioning script wrote, without the claim
const disabledA = { uid: "disabled-a" };
const realAdmin = { uid: "real-admin", claims: { superadmin: true } };

async function seed() {
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  expect(res.ok).toBe(true);
  const docs: Array<[string, Record<string, unknown>]> = [
    ["businesses/biz-a", { businessName: "A Roofing" }],
    ["businesses/biz-b", { businessName: "B Dental" }],
    ["businesses/biz-a/jobs/j-a", { title: "A job" }],
    ["businesses/biz-b/jobs/j-b", { title: "B job" }],
    ["businesses/biz-b/customers/c-b", { name: "B customer" }],
    ["businesses/biz-b/invoices/inv-b", { total: 100 }],
    ["businessUsers/owner-a", { businessId: "biz-a", role: "owner", active: true }],
    ["businessUsers/stale-flag", { businessId: "biz-a", role: "owner", active: true, superadmin: true }],
    ["businessUsers/doc-only-admin", { businessId: "demo-roofing", role: "superadmin", superadmin: true }],
    ["businessUsers/disabled-a", { businessId: "biz-a", role: "staff", active: false }],
    ["businessPhoneNumbers/biz-b-main", { businessId: "biz-b", phoneNumber: "+15555550100" }],
    ["adminAuditEvents/audit-1", { action: "business.created" }],
    // 2026-10-08 additions — server-only data, never readable from a browser:
    ["fieldJobLinks/link-a", { businessId: "biz-a", jobId: "j-a" }], // a reusable field link is a credential
    ["fieldJobLinkIndex/biz-a__j-a", { linkId: "link-a" }],
    ["businesses/biz-a/customerKeys/k1", { customerId: "C-1000" }],
    ["businesses/biz-a/usageMonths/2026-10", { voiceNotes: 3 }],
  ];
  for (const [path, data] of docs) expect(await write(path, data, "owner")).toBe(ALLOWED);
}

beforeAll(async () => {
  const res = await fetch(`http://${HOST}/`).catch(() => null);
  if (!res) throw new Error(`Firestore emulator not reachable at ${HOST} — run this with npm run test:rules`);
});

beforeEach(seed);

describe("a businessUsers `superadmin` flag confers nothing (T-170)", () => {
  it("a member with a stale doc flag cannot read or write another tenant", async () => {
    expect(await read("businesses/biz-b", staleFlag)).toBe(DENIED);
    expect(await read("businesses/biz-b/jobs/j-b", staleFlag)).toBe(DENIED);
    expect(await read("businesses/biz-b/customers/c-b", staleFlag)).toBe(DENIED);
    expect(await read("businesses/biz-b/invoices/inv-b", staleFlag)).toBe(DENIED);
    expect(await write("businesses/biz-b", { businessName: "hijacked" }, staleFlag)).toBe(DENIED);
    expect(await write("businesses/biz-new", { businessName: "new" }, staleFlag)).toBe(DENIED);
  });

  it("a member with a stale doc flag cannot reach platform-only collections", async () => {
    expect(await read("businessPhoneNumbers/biz-b-main", staleFlag)).toBe(DENIED);
    expect(await read("adminAuditEvents/audit-1", staleFlag)).toBe(DENIED);
    expect(await read("businessUsers/owner-a", staleFlag)).toBe(DENIED);
  });

  it("a doc-only superadmin (no claim) is not a superadmin anywhere", async () => {
    expect(await read("businesses/biz-b", docOnlyAdmin)).toBe(DENIED);
    expect(await read("businesses/biz-a", docOnlyAdmin)).toBe(DENIED);
    expect(await write("businesses/biz-c", { businessName: "C" }, docOnlyAdmin)).toBe(DENIED);
    expect(await write("businessUsers/owner-a", { role: "viewer" }, docOnlyAdmin)).toBe(DENIED);
  });

  it("the verified custom claim is platform authority", async () => {
    expect(await read("businesses/biz-b", realAdmin)).toBe(ALLOWED);
    expect(await read("businessPhoneNumbers/biz-b-main", realAdmin)).toBe(ALLOWED);
    expect(await write("businesses/biz-c", { businessName: "C" }, realAdmin)).toBe(ALLOWED);
  });
});

describe("tenant isolation for ordinary members", () => {
  it("a member reads their own tenant only", async () => {
    expect(await read("businesses/biz-a", ownerA)).toBe(ALLOWED);
    expect(await read("businesses/biz-a/jobs/j-a", ownerA)).toBe(ALLOWED);
    expect(await read("businesses/biz-b", ownerA)).toBe(DENIED);
    expect(await read("businesses/biz-b/jobs/j-b", ownerA)).toBe(DENIED);
  });

  it("a member cannot write any membership doc — not even their own (no self-promotion)", async () => {
    expect(await write("businessUsers/owner-a", { businessId: "biz-a", role: "owner", superadmin: true }, ownerA)).toBe(DENIED);
    expect(await write("businessUsers/owner-a", { businessId: "biz-b", role: "owner" }, ownerA)).toBe(DENIED);
    expect(await write("businessUsers/someone-new", { businessId: "biz-b", role: "owner" }, ownerA)).toBe(DENIED);
    expect(await remove("businessUsers/stale-flag", ownerA)).toBe(DENIED);
  });

  it("a member cannot read or write phone-number routing", async () => {
    expect(await read("businessPhoneNumbers/biz-b-main", ownerA)).toBe(DENIED);
    expect(await write("businessPhoneNumbers/biz-a-main", { businessId: "biz-a", phoneNumber: "+15555550100" }, ownerA)).toBe(DENIED);
  });

  it("a disabled member loses access to their former tenant", async () => {
    expect(await read("businesses/biz-a", disabledA)).toBe(DENIED);
    expect(await read("businesses/biz-a/jobs/j-a", disabledA)).toBe(DENIED);
  });

  it("an unauthenticated caller reads nothing", async () => {
    expect(await read("businesses/biz-a", null)).toBe(DENIED);
    expect(await read("businessUsers/owner-a", null)).toBe(DENIED);
  });
});

describe("server-only data added 2026-10-08 (field links, customer identity keys, usage, products)", () => {
  it("a field link and its index are never readable or writable from a browser — not even by the job's own owner", async () => {
    expect(await read("fieldJobLinks/link-a", ownerA)).toBe(DENIED);
    expect(await read("fieldJobLinkIndex/biz-a__j-a", ownerA)).toBe(DENIED);
    expect(await write("fieldJobLinks/link-new", { businessId: "biz-a", jobId: "j-a" }, ownerA)).toBe(DENIED);
    expect(await read("fieldJobLinks/link-a", null)).toBe(DENIED);
  });

  it("customer identity keys and usage counters stay server-side", async () => {
    expect(await read("businesses/biz-a/customerKeys/k1", ownerA)).toBe(DENIED);
    expect(await write("businesses/biz-a/customerKeys/k2", { customerId: "C-1" }, ownerA)).toBe(DENIED);
    expect(await write("businesses/biz-a/usageMonths/2026-10", { voiceNotes: 0 }, ownerA)).toBe(DENIED);
  });

  it("an owner cannot switch on products, change payment details or invoices directly — only through the guarded API", async () => {
    expect(await write("businesses/biz-a", { "products.calls": true }, ownerA)).toBe(DENIED);
    expect(await write("businesses/biz-a/invoices/inv-a", { status: "paid" }, ownerA)).toBe(DENIED);
    expect(await write("businesses/biz-a/customers/c-a", { name: "x" }, ownerA)).toBe(DENIED);
  });
});
