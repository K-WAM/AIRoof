import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { GET as jobGet } from "../[jobId]/route";
import { POST as createJob } from "../route";
import { POST as fromRequest } from "../from-request/route";
import { GET as quoteResponse } from "@/app/api/quote-response/route";
import { quoteResponseTokenHash, quoteResponseUrl } from "@/lib/billing/quoteResponse";

let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => ({ user: { uid: "u", role: "owner", businessId: "biz", superadmin: false } }),
  verifyFieldAccess: async () => ({ user: { uid: "u", role: "owner", businessId: "biz", superadmin: false } }),
}));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: () => {} }));

const businessDocReads = () => db.__reads().filter(path => /^businesses\/[^/]+$/.test(path));
const single = { billingCompanies: [{ id: "only", name: "Only Company", shortName: "ONLY", isDefault: true }] };
const json = (url: string, body: unknown, method = "POST") => new NextRequest(url, { method, body: JSON.stringify(body) });

beforeEach(() => { db = makeFakeDb(); db.__seed("businesses", "biz", { businessName: "Main", industry: "roofing", ...single }); });

it("job GET for a single-company business reads no business document", async () => {
  db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", businessId: "biz", title: "Work" });
  db.__clearReads();
  const res = await jobGet(new NextRequest("http://localhost/api/jobs/J-1?businessId=biz"), { params: Promise.resolve({ jobId: "J-1" }) });
  expect(res.status).toBe(200);
  expect(businessDocReads()).toEqual([]);
});

it("jobs POST for a single-company business reuses the counter's one business read and stores no company", async () => {
  db.__clearReads();
  const res = await createJob(json("http://localhost/api/jobs", { businessId: "biz", title: "Work" }));
  expect(res.status).toBe(201);
  expect((await res.json()).job).not.toHaveProperty("companyId");
  expect(businessDocReads()).toHaveLength(1);
});

it("jobs/from-request for a single-company business reuses the counter's one business read", async () => {
  db.__seed("businesses/biz/leads", "L-1", { serviceType: "Repair", address: "1 Main St" });
  db.__clearReads();
  const res = await fromRequest(json("http://localhost/api/jobs/from-request", { businessId: "biz", leadId: "L-1" }));
  expect(res.status).toBe(201);
  expect((await res.json()).job).not.toHaveProperty("companyId");
  expect(businessDocReads()).toHaveLength(1);
});

it("a public quote response for a single-company business reads no business document", async () => {
  const token = "a".repeat(64);
  db.__seed("businesses/biz/jobs", "job", { jobId: "job", businessId: "biz", quoteId: "Q-1", status: "quoted" });
  db.__seed("businesses/biz/quotes", "Q-1", { quoteId: "Q-1", businessId: "biz", jobId: "job", status: "sent", validUntil: Date.now() + 86400000, responseTokenHash: quoteResponseTokenHash(token) });
  db.__clearReads();
  const res = await quoteResponse(new NextRequest(quoteResponseUrl("http://localhost", "biz", "job", token, "accepted")));
  expect(res.status).toBe(200);
  expect(businessDocReads()).toEqual([]);
});
