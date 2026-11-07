import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { GET, PATCH } from "../route";
import { POST, DELETE } from "../link/route";
import { GET as answersGET, PATCH as reviewedPATCH } from "../forms/[formId]/route";
import { GET as previewGET } from "../preview/[formId]/route";
const state = vi.hoisted(() => ({ db: null as unknown, allowed: false }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: vi.fn(async () => state.allowed ? { user: { uid: "admin", email: "admin@example.test" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }) }));
let fake: ReturnType<typeof makeFakeDb>;
const ctx = () => ({ params: Promise.resolve({ businessId: "a", formId: "texting" }) });
const req = (method = "GET", body?: unknown, query = "") => new NextRequest(`https://local.test/api/admin/businesses/a/onboarding${query}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
beforeEach(() => { fake = makeFakeDb(); state.db = fake; state.allowed = false; fake.__seed("businesses", "a", { businessName: "Example" }); });
it("every handler guards before reading Firestore or bodies", async () => {
  for (const handler of [GET, PATCH, POST, DELETE, answersGET, reviewedPATCH, previewGET]) expect((await handler(req(), ctx())).status).toBe(403);
  expect(fake.__reads()).toEqual([]);
});
it("creates generic defaults only for an existing business and validates bounded patches", async () => {
  state.allowed = true;
  const response = await GET(req(), ctx()); expect(response.status).toBe(200);
  const { portal } = await response.json(); expect(portal.clientName).toBe("Example"); expect(portal.steps).toHaveLength(6); expect(portal.checklist).toHaveLength(16);
  expect((await PATCH(req("PATCH", { steps: [{ ...portal.steps[0], id: "BAD" }] }), ctx())).status).toBe(400);
  expect((await PATCH(req("PATCH", { link: { token: "injected" } }), ctx())).status).toBe(400);
  const steps = portal.steps.map((s: { status: string }, i: number) => ({ ...s, status: i === 0 ? "done" : "upcoming" }));
  const patched = await PATCH(req("PATCH", { steps }), ctx()); const changed = (await patched.json()).portal;
  expect(changed.steps[0].completedAt).toBeTypeOf("number"); expect(changed.steps[1].status).toBe("current");
  expect((await GET(req(), { params: Promise.resolve({ businessId: "missing" }) })).status).toBe(404);
});
it("previews are inert and EIN reveal is audited before returning a full answer", async () => {
  state.allowed = true; await GET(req(), ctx());
  fake.__seed("clientOnboardingForms", "a__texting", { businessId: "a", formId: "texting", answers: { ein: "12-3456789" }, state: "submitted", updatedAt: 1, revision: 1 });
  const normal = await answersGET(req(), ctx()); expect((await normal.json()).submission.answers.ein).toBe("••-•••6789");
  const preview = await previewGET(req(), ctx()); expect(preview.status).toBe(200); expect(fake.__list("adminAuditEvents")).toHaveLength(0);
  const reveal = await answersGET(req("GET", undefined, "?reveal=ein"), ctx()); expect((await reveal.json()).submission.answers.ein).toBe("12-3456789");
  expect(fake.__list("adminAuditEvents")[0].data.action).toBe("onboarding.reveal_ein");
  expect((await reviewedPATCH(req("PATCH", { status: "reviewed" }), ctx())).status).toBe(200);
});
