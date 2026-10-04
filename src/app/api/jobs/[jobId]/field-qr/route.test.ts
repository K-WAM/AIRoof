import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verifyAuthAndRole: vi.fn(), fingerprint: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
  fieldKeyFingerprint: mocks.fingerprint,
  FIELD_JOB_LINK_MAX_AGE_MS: 90 * 24 * 60 * 60 * 1000,
}));
const comms = vi.hoisted(() => ({ sendEmail: vi.fn(), sendSms: vi.fn() }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: comms.sendEmail }));
vi.mock("@/lib/comms/sms", () => ({ sendSms: comms.sendSms }));
let db: ReturnType<typeof makeFakeDb> | null = makeFakeDb();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { DELETE, POST } from "./route";

const params = { params: Promise.resolve({ jobId: "J-1" }) };
const call = (fn: typeof POST, body: unknown) => fn(new NextRequest("http://localhost/api/jobs/J-1/field-qr", {
  method: fn === POST ? "POST" : "DELETE", body: typeof body === "string" ? body : JSON.stringify(body),
}), params);

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "biz-1", { businessName: "Apex", fieldKey: "a".repeat(32) });
  db.__seed("businesses/biz-1/jobs", "J-1", { title: "Reroof" });
  mocks.verifyAuthAndRole.mockReset().mockResolvedValue({ user: { uid: "staff-1", role: "staff" } });
  comms.sendEmail.mockReset().mockResolvedValue({ status: "delivered", providerId: "m1" });
  comms.sendSms.mockReset().mockResolvedValue("unconfigured");
  mocks.fingerprint.mockReset().mockImplementation((key: string) => `tag-${key.slice(0, 4)}`);
});

describe("POST/DELETE /api/jobs/[jobId]/field-qr — the job's reusable field link", () => {
  it("makes one link and hands back the SAME link next time (an old text keeps working)", async () => {
    const first = await (await call(POST, { businessId: "biz-1" })).json();
    const second = await (await call(POST, { businessId: "biz-1" })).json();
    expect(first.fieldUrl).toMatch(/^http:\/\/localhost\/f\/[A-Za-z0-9_-]{20,}$/);
    expect(second.fieldUrl).toBe(first.fieldUrl);
    expect(first.reusable).toBe(true);
    const links = db!.__list("fieldJobLinks");
    expect(links).toHaveLength(1);
    expect(links[0].data).toMatchObject({ businessId: "biz-1", jobId: "J-1", fieldKeyTag: "tag-aaaa", revokedAt: null });
  });

  it("never writes the link onto the job doc (View-only users can read jobs; the link is a credential)", async () => {
    await call(POST, { businessId: "biz-1" });
    const [job] = db!.__list("businesses/biz-1/jobs");
    expect(job.data.fieldLinkId).toBeUndefined();
  });

  it("Stop link: the old one is marked stopped and the next send makes a new one", async () => {
    const first = await (await call(POST, { businessId: "biz-1" })).json();
    expect((await call(DELETE, { businessId: "biz-1" })).status).toBe(200);
    const oldId = first.fieldUrl.split("/f/")[1];
    expect(db!.__list("fieldJobLinks").find((l) => l.id === oldId)?.data.revokedAt).toEqual(expect.any(Number));
    const next = await (await call(POST, { businessId: "biz-1" })).json();
    expect(next.fieldUrl).not.toBe(first.fieldUrl);
  });

  it("a rotated field key retires the old link", async () => {
    const first = await (await call(POST, { businessId: "biz-1" })).json();
    db!.__seed("businesses", "biz-1", { businessName: "Apex", fieldKey: "b".repeat(32) });
    const next = await (await call(POST, { businessId: "biz-1" })).json();
    expect(next.fieldUrl).not.toBe(first.fieldUrl);
  });

  it("lazily provisions a field key", async () => {
    db!.__seed("businesses", "biz-1", { businessName: "New" });
    expect((await call(POST, { businessId: "biz-1" })).status).toBe(200);
    expect(String(db!.__list("businesses")[0].data.fieldKey).length).toBeGreaterThanOrEqual(16);
  });

  it("sendTo an email: the app emails the link with the job's name and address", async () => {
    db!.__seed("businesses/biz-1/jobs", "J-1", { title: "Gym roof leak", address: "1 School Rd" });
    const res = await (await call(POST, { businessId: "biz-1", sendTo: "ana@sub.test" })).json();
    expect(res.sent).toBe("email");
    const mail = comms.sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "ana@sub.test", fromName: "Apex" });
    expect(mail.html).toContain(res.fieldUrl);
    expect(mail.html).toContain("Gym roof leak");
    expect(mail.subject).toBe("Log your work: Gym roof leak");
  });

  it("sendTo a phone: texts from the business line when texting is on, else hands the message back for the office phone", async () => {
    let res = await (await call(POST, { businessId: "biz-1", sendTo: "(305) 555-0101" })).json();
    expect(res.sent).toBe("use_phone");
    expect(res.message).toContain(res.fieldUrl);
    expect(comms.sendSms.mock.calls[0][0]).toMatchObject({ purpose: "field_link", messageType: "field_link" });
    comms.sendSms.mockResolvedValueOnce("delivered");
    res = await (await call(POST, { businessId: "biz-1", sendTo: "+13055550101" })).json();
    expect(res.sent).toBe("sms");
  });

  it("a mistyped recipient is a 400 and nothing is sent", async () => {
    expect((await call(POST, { businessId: "biz-1", sendTo: "ana@" })).status).toBe(400);
    expect((await call(POST, { businessId: "biz-1", sendTo: "555" })).status).toBe(400);
    expect(comms.sendEmail).not.toHaveBeenCalled();
    expect(comms.sendSms).not.toHaveBeenCalled();
  });

  it("guards: 400 without businessId or with bad JSON, the role gate's error, 404 unknown job, 503 not configured", async () => {
    expect((await call(POST, {})).status).toBe(400);
    expect((await call(POST, "not json")).status).toBe(400);
    mocks.verifyAuthAndRole.mockResolvedValueOnce({ error: NextResponse.json({ error: "no" }, { status: 403 }) });
    expect((await call(POST, { businessId: "biz-1" })).status).toBe(403);
    const missing = await POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ businessId: "biz-1" }) }), { params: Promise.resolve({ jobId: "J-404" }) });
    expect(missing.status).toBe(404);
    mocks.fingerprint.mockImplementationOnce(() => { throw new Error("not configured"); });
    expect((await call(POST, { businessId: "biz-1" })).status).toBe(503);
    db = null;
    expect((await call(POST, { businessId: "biz-1" })).status).toBe(503);
  });
});
