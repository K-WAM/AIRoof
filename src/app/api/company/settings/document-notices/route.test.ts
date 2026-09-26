import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";
import { FLORIDA_NOTICE_DEFAULTS } from "@/lib/documents/legalNotices";
import { noticeApproval, type DocumentNoticeSettings } from "@/lib/documents/notices";

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verify }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/company/settings/document-notices", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = () => GET(new NextRequest("http://localhost/api/company/settings/document-notices?businessId=biz"));
const stored = () => (db.__peek("businesses", "biz") as { documentNotices?: DocumentNoticeSettings }).documentNotices;
/** The wording an attorney would put in place of each "[DRAFT …]" placeholder. */
const reviewed = () => Object.fromEntries(FLORIDA_NOTICE_DEFAULTS.filter((d) => /\[\s*DRAFT/i.test(d.text))
  .map((d) => [d.id, { enabled: true, text: `Attorney-reviewed wording for ${d.title}.` }]));

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses", "biz", { businessName: "Roofdoctor" });
  mocks.verify.mockReset().mockResolvedValue({ user: { uid: "owner-1", role: "owner" } });
});

describe("Terms & notices endpoint", () => {
  it("only the owner (or superadmin) may read or change legal wording", async () => {
    mocks.verify.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await get()).status).toBe(403);
    expect((await put({ businessId: "biz", approve: true })).status).toBe(403);
    expect(stored()).toBeUndefined();
    expect(mocks.verify.mock.calls.every((call) => JSON.stringify(call[2]) === JSON.stringify(["owner", "superadmin"]))).toBe(true);
  });

  it("refuses to approve the shipped DRAFT wording, says which notices block it, and stores nothing", async () => {
    const res = await put({ businessId: "biz", approve: true });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.blockingIds).toEqual(expect.arrayContaining(["fl-lien-713", "fl-recovery-fund-489", "fl-defect-558"]));
    expect(body.error).toMatch(/\[DRAFT/);
    expect(stored()).toBeUndefined();
  });

  it("approves once every enabled notice has real wording, records who and when, and the approval verifies", async () => {
    expect((await put({ businessId: "biz", notices: reviewed() })).status).toBe(200);
    expect(noticeApproval(stored()).status).toBe("never"); // saved wording alone approves nothing
    const res = await put({ businessId: "biz", approve: true });
    expect(res.status).toBe(200);
    expect(stored()).toMatchObject({ approvedBy: "owner-1", approvedAt: expect.any(Number), approvedFingerprint: expect.any(String) });
    expect(noticeApproval(stored()).approved).toBe(true);
    expect((await (await get()).json()).approval).toMatchObject({ approved: true, status: "approved", approvedBy: "owner-1" });
  });

  it("switching a placeholder notice OFF is the other way to make it approvable", async () => {
    const off = Object.fromEntries(FLORIDA_NOTICE_DEFAULTS.filter((d) => /\[\s*DRAFT/i.test(d.text)).map((d) => [d.id, { enabled: false }]));
    expect((await put({ businessId: "biz", notices: off, approve: true })).status).toBe(200);
    expect(noticeApproval(stored()).approved).toBe(true);
  });

  it("editing the wording after approval withdraws the approval until it is approved again", async () => {
    await put({ businessId: "biz", notices: reviewed(), approve: true });
    expect(noticeApproval(stored()).approved).toBe(true);
    await put({ businessId: "biz", notices: { ...reviewed(), "quote-validity": { enabled: true, text: "Valid for 10 days." } } });
    expect((await (await get()).json()).approval).toMatchObject({ approved: false, status: "changed" });
    expect((await put({ businessId: "biz", approve: true })).status).toBe(200);
    expect(noticeApproval(stored()).approved).toBe(true);
  });

  it("rejects unknown ids, markup, oversize wording, bad placement and a false approve flag before writing", async () => {
    for (const body of [
      { notices: { "not-a-notice": { enabled: true } } },
      { notices: { "quote-validity": { text: "<script>alert(1)</script>" } } },
      { notices: { "quote-validity": { text: "x".repeat(4001) } } },
      { notices: { "quote-validity": { showOn: ["receipt"] } } },
      { notices: { "quote-validity": { enabled: "yes" } } },
      { notices: ["quote-validity"] },
      { approve: false },
    ]) expect((await put({ businessId: "biz", ...body })).status).toBe(400);
    expect(stored()).toBeUndefined();
  });
});
