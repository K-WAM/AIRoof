import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";
import { portalDefaults } from "@/lib/onboarding/defaults";
import type { OnboardingPortal, OnboardingSubmission } from "@/types/onboarding";
import { hashToken, newToken } from "@/lib/onboarding/link";
import { GET as portalGET } from "../route";
import { GET as formGET, PUT as formPUT } from "../forms/[formId]/route";
import { POST as submitPOST } from "../forms/[formId]/submit/route";
import { GET as hopGET } from "@/app/o/[token]/route";
const state = vi.hoisted(() => ({ db: null as unknown, send: vi.fn(async () => ({ status: "delivered" })) }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: state.send }));
let fake: ReturnType<typeof makeFakeDb>; let token: string;
const context = (formId = "texting") => ({ params: Promise.resolve({ formId }) });
function req(path = "", method = "GET", body?: unknown, credential: string | null = token) {
  return new NextRequest(`https://local.test/api/onboarding${path}`, { method, headers: { ...(credential ? { cookie: `onb=${credential}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const texting = { legalName: "Example LLC", ein: "123456789", businessType: "llc", address: { street: "123 Example St", city: "Town", state: "FL", zip: "33333" }, website: "https://example.test", repName: "Taylor Example", repTitle: "Owner", repEmail: "taylor@example.test", repPhone: "9545550123", messageTypes: ["confirmations"], volume: "under1k", consentMethods: ["phone"], attest: true, submittedBy: "Taylor Example" };
beforeEach(() => {
  fake = makeFakeDb(); state.db = fake; state.send.mockClear(); _resetRateLimitState(); token = newToken();
  const portal = portalDefaults("a", "Example A"); portal.checklist[0].internalNote = "Never public";
  portal.link = { token, createdAt: Date.now(), expiresAt: Date.now() + 86400000, hint: token.slice(-4) };
  fake.__seed("clientOnboarding", "a", { ...portal }); fake.__seed("clientOnboarding", "b", { ...portalDefaults("b", "Other private tenant") });
  fake.__seed("clientOnboardingLinks", hashToken(token), { businessId: "a", createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
  fake.__seed("businesses", "a", { businessId: "a", businessName: "Example A", businessHours: "Mon-Fri", serviceArea: "Town" });
});
describe("public onboarding routes", () => {
  it("GET portal requires the cookie; URL credentials never grant access", async () => {
    expect((await portalGET(req(`?token=${token}&businessId=a`, "GET", undefined, null))).status).toBe(401);
    const response = await portalGET(req("?businessId=b"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text(); expect(body).toContain("Example A");
    for (const secret of [token, "Never public", "Other private tenant", "internalNote", "businessId"]) expect(body).not.toContain(secret);
  });
  it("GET form refuses disabled and unknown forms and marks the first open", async () => {
    expect((await formGET(req("/forms/texting", "GET", undefined, null), context())).status).toBe(401);
    expect((await formGET(req(), context("unknown"))).status).toBe(400);
    const response = await formGET(req(), context()); expect(response.status).toBe(200);
    expect((fake.__peek("clientOnboarding", "a") as unknown as OnboardingPortal).forms.texting.status).toBe("in_progress");
    const portal = fake.__peek("clientOnboarding", "a") as unknown as OnboardingPortal;
    portal.forms.texting.enabled = false;
    fake.__seed("clientOnboarding", "a", { ...portal });
    expect((await formGET(req(), context())).status).toBe(404);
  });
  it("PUT drafts checks cookie, body, revision and preserves masked EIN", async () => {
    expect((await formPUT(req("", "PUT", { revision: 0, answers: {} }, null), context())).status).toBe(401);
    expect((await formPUT(req("", "PUT", { businessId: "b", revision: 0, answers: {} }), context())).status).toBe(400);
    const saved = await formPUT(req("", "PUT", { revision: 0, answers: { ein: "123456789", legalName: "Example" } }), context());
    const data = await saved.json(); expect(data.answers.ein).toBe("••-•••6789"); expect(data.revision).toBe(1);
    expect((await formPUT(req("", "PUT", { revision: 0, answers: {} }), context())).status).toBe(409);
    expect((await formPUT(req("", "PUT", { revision: 1, answers: { ein: data.answers.ein, legalName: "Changed" } }), context())).status).toBe(200);
    expect((fake.__list("clientOnboardingForms")[0].data as unknown as OnboardingSubmission).answers.ein).toBe("12-3456789");
    const read = await (await formGET(req(), context())).json(); expect(read.answers.ein).toBe("••-•••6789"); expect(JSON.stringify(read.answers)).not.toContain("12-3456789");
    expect(fake.__list("clientOnboardingForms").every(d => d.id.startsWith("a__"))).toBe(true);
  });
  it("POST submit validates, permits corrections and sends one answer-free notification", async () => {
    expect((await submitPOST(req("", "POST", { revision: 0, answers: {} }, null), context())).status).toBe(401);
    const missing = await submitPOST(req("", "POST", { revision: 0, answers: {} }), context());
    expect(missing.status).toBe(400); expect((await missing.json()).errors.legalName).toBeDefined(); expect(state.send).not.toHaveBeenCalled();
    const response = await submitPOST(req("", "POST", { revision: 0, answers: texting }), context());
    expect(response.status).toBe(200); expect(state.send).toHaveBeenCalledTimes(1);
    const email = state.send.mock.calls[0] as unknown as [{ businessId: string; to: string; html: string }];
    expect(email[0].businessId).toBe("a"); expect(email[0].to).toBe("connect@luxordev.com");
    for (const secret of [token, "123456789", "Taylor Example", "taylor@example.test"]) expect(email[0].html).not.toContain(secret);
    const draft = await formPUT(req("", "PUT", { revision: 1, answers: { ...texting, ein: "••-•••6789", repTitle: "Manager" } }), context()); expect(draft.status).toBe(200);
    const again = await submitPOST(req("", "POST", { revision: 2, answers: { ...texting, ein: "••-•••6789" } }), context()); expect(again.status).toBe(200); expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("a failed notification never rolls back submission", async () => {
    state.send.mockRejectedValueOnce(new Error("provider down"));
    expect((await submitPOST(req("", "POST", { revision: 0, answers: texting }), context())).status).toBe(200);
    expect(fake.__list("clientOnboardingForms")[0].data.state).toBe("submitted");
  });
  it("refuses cross-site writes and real bodies larger than 64KB", async () => {
    const cross = req("", "PUT", { revision: 0, answers: {} }); cross.headers.set("origin", "https://elsewhere.test");
    expect((await formPUT(cross, context())).status).toBe(403);
    const huge = req("", "PUT", { revision: 0, answers: { legalName: "x".repeat(66000) } });
    expect((await formPUT(huge, context())).status).toBe(413);
  });
  it("revocation and expiry affect every route at once", async () => {
    await fake.collection("clientOnboardingLinks").doc(hashToken(token)).delete();
    expect((await portalGET(req())).status).toBe(401);
    expect((await formGET(req(), context())).status).toBe(401);
    expect((await formPUT(req("", "PUT", { revision: 0, answers: {} }), context())).status).toBe(401);
    expect((await submitPOST(req("", "POST", { revision: 0, answers: texting }), context())).status).toBe(401);
  });
  it("/o exchanges only valid tokens for a secure HttpOnly cookie and bare 303 redirect", async () => {
    const request = new NextRequest(`https://local.test/o/${token}`);
    const response = await hopGET(request, { params: Promise.resolve({ token }) });
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://local.test/onboarding");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.cookies.get("onb"); expect(cookie?.value).toBe(token); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("lax");
    expect((fake.__peek("clientOnboarding", "a") as unknown as OnboardingPortal).link?.lastOpenedAt).toBeTypeOf("number");
    const denied = await hopGET(request, { params: Promise.resolve({ token: newToken() }) }); expect(denied.status).toBe(401); expect(await denied.text()).toContain("This link has expired or was turned off");
    for (let i = 0; i < 28; i++) await hopGET(request, { params: Promise.resolve({ token: "bad" }) });
    expect((await hopGET(request, { params: Promise.resolve({ token }) })).status).toBe(429);
  });
  it("all five definitions accept their draft and submit contracts", async () => {
    const answers = { texting, payments: { wantOnline: "later", submittedBy: "Example" }, team: { people: [{ name: "Example", appRole: "none" }], permissions: { approveQuotes: ["owner"] }, submittedBy: "Example" }, company: { displayName: "Example", phone: "9545550123", alertsEmail: "office@example.test", submittedBy: "Example" }, documents: { prepares: { quote: ["office"] }, submittedBy: "Example" } };
    for (const [formId, value] of Object.entries(answers)) {
      expect((await formPUT(req("", "PUT", { revision: 0, answers: value }), context(formId))).status).toBe(200);
      expect((await formGET(req(), context(formId))).status).toBe(200);
      expect((await submitPOST(req("", "POST", { revision: 1, answers: value }), context(formId))).status).toBe(200);
    }
  });
});
