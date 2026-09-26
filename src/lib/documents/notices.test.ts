import { describe, expect, it } from "vitest";
import { FLORIDA_NOTICE_DEFAULTS } from "./legalNotices";
import { draftMarkerNotices, effectiveNotices, noticeApproval, noticeFingerprint, noticesForDocument, renderNoticeText, type DocumentNoticeSettings } from "./notices";

const business = { businessName: "Roofdoctor South Florida", licenseNumber: "CCC1325784" };
/** What an owner (with their attorney) must do before approving: replace each "[DRAFT …]" placeholder with real wording. */
const withoutDrafts = (extra: DocumentNoticeSettings["notices"] = {}): DocumentNoticeSettings => ({
  notices: {
    ...Object.fromEntries(FLORIDA_NOTICE_DEFAULTS.filter((d) => /\[\s*DRAFT/i.test(d.text))
      .map((d) => [d.id, { enabled: true, text: d.text.replace(/\s*\[[^\]]*DRAFT[^\]]*\]/gi, "").trim() || `Reviewed wording for ${d.id}.` }])),
    ...extra,
  },
});
const approve = (settings: DocumentNoticeSettings): DocumentNoticeSettings => ({
  ...settings, approvedAt: 1, approvedBy: "owner", approvedFingerprint: noticeFingerprint(effectiveNotices(settings)),
});

describe("notices are OFF until the owner approves the wording", () => {
  it("prints nothing with no settings at all, and nothing before approval", () => {
    expect(noticesForDocument({ doc: "quote", total: 9000, business })).toEqual([]);
    expect(noticesForDocument({ doc: "quote", total: 9000, business, settings: withoutDrafts() })).toEqual([]);
    expect(noticeApproval(withoutDrafts()).status).toBe("never");
    // With nothing configured the shipped wording is still a draft, which is a stronger reason to print nothing.
    expect(noticeApproval(undefined).status).toBe("draft-markers");
  });

  it("the shipped statutory defaults still carry [DRAFT markers, so they can never be approved as-is", () => {
    const blocked = draftMarkerNotices(effectiveNotices());
    expect(blocked.map((n) => n.id)).toEqual(expect.arrayContaining(["fl-lien-713", "fl-recovery-fund-489", "fl-defect-558"]));
    // Even a stored approval can't switch them on while the placeholders are there.
    const forged: DocumentNoticeSettings = { approvedAt: 1, approvedBy: "owner", approvedFingerprint: noticeFingerprint(effectiveNotices()) };
    expect(noticeApproval(forged)).toMatchObject({ approved: false, status: "draft-markers" });
    expect(noticesForDocument({ doc: "quote", total: 9000, business, settings: forged })).toEqual([]);
  });

  it("replacing the placeholder wording (or switching the notice off) allows approval", () => {
    const replaced = withoutDrafts();
    replaced.notices!["fl-lien-713"] = { enabled: true, text: "Attorney-approved lien notice for {businessName}." };
    expect(noticeApproval(replaced).status).toBe("never");
    expect(noticeApproval(approve(replaced)).approved).toBe(true);
  });
});

describe("approved notices", () => {
  const approved = approve(withoutDrafts({ "fl-lien-713": { enabled: true, text: "Lien notice from {businessName}, License #{licenseNumber}." } }));

  it("show on the right document: quote-only notices stay off the invoice, shared ones show on both", () => {
    const quote = noticesForDocument({ doc: "quote", total: 9000, settings: approved, business }).map((n) => n.id);
    const invoice = noticesForDocument({ doc: "invoice", total: 9000, settings: approved, business }).map((n) => n.id);
    expect(quote).toEqual(expect.arrayContaining(["quote-validity", "hidden-damage", "price-escalation", "permits", "weather-delays", "payment-terms", "fl-lien-713"]));
    expect(invoice).toEqual(expect.arrayContaining(["hidden-damage", "permits", "payment-terms"]));
    expect(invoice).not.toContain("quote-validity");
    expect(invoice).not.toContain("fl-lien-713");
  });

  it("statutory notices need a residential job AND a total over the threshold", () => {
    const at = (total: number, commercial?: boolean) => noticesForDocument({ doc: "quote", total, commercial, settings: approved, business }).map((n) => n.id);
    expect(at(2500)).not.toContain("fl-lien-713"); // "over" $2,500, not "at"
    expect(at(2500.01)).toContain("fl-lien-713");
    expect(at(9000, true)).not.toContain("fl-lien-713"); // commercial property
    expect(at(9000, true)).toContain("payment-terms"); // general terms still apply
  });

  it("fills the business name and license, and drops the license phrase when there is none", () => {
    const text = noticesForDocument({ doc: "quote", total: 9000, settings: approved, business }).find((n) => n.id === "fl-lien-713")!.text;
    expect(text).toBe("Lien notice from Roofdoctor South Florida, License #CCC1325784.");
    const noLicense = noticesForDocument({ doc: "quote", total: 9000, settings: approved, business: { businessName: "Roofdoctor" } }).find((n) => n.id === "fl-lien-713")!.text;
    expect(noLicense).toBe("Lien notice from Roofdoctor.");
    expect(renderNoticeText("{businessName} — {licenseNumber}", {})).toBe("the contractor —");
  });

  it("a notice the owner switches off never prints", () => {
    const off = approve({ notices: { ...approved.notices, "weather-delays": { enabled: false } } });
    expect(noticesForDocument({ doc: "quote", total: 100, settings: off, business }).map((n) => n.id)).not.toContain("weather-delays");
  });
});

describe("approval is bound to the exact wording", () => {
  const approvedSettings = approve(withoutDrafts());

  it("editing an enabled notice after approval withdraws the approval until it is approved again", () => {
    expect(noticeApproval(approvedSettings).approved).toBe(true);
    const edited = { ...approvedSettings, notices: { ...approvedSettings.notices, "quote-validity": { enabled: true, text: "Valid for 10 days." } } };
    expect(noticeApproval(edited)).toMatchObject({ approved: false, status: "changed" });
    expect(noticesForDocument({ doc: "quote", total: 100, settings: edited, business })).toEqual([]);
    expect(noticeApproval(approve(edited)).approved).toBe(true);
  });

  it("switching an enabled notice off or on changes the fingerprint too; editing a disabled one does not", () => {
    const off = { ...approvedSettings, notices: { ...approvedSettings.notices, permits: { enabled: false } } };
    expect(noticeApproval(off).status).toBe("changed");
    // A notice that was ALREADY off when approved can be reworded without withdrawing the approval (it isn't on any document).
    const approvedWithOff = approve({ notices: { ...withoutDrafts().notices, "fl-defect-558": { enabled: false } } });
    expect(noticeApproval(approvedWithOff).approved).toBe(true);
    const rewordedWhileOff = { ...approvedWithOff, notices: { ...approvedWithOff.notices, "fl-defect-558": { enabled: false, text: "Something new" } } };
    expect(noticeApproval(rewordedWhileOff).approved).toBe(true);
  });

  it("only non-statutory notices can move between documents; statutory ones follow their default", () => {
    const moved = effectiveNotices({ notices: { "quote-validity": { showOn: ["quote", "invoice"] }, "fl-lien-713": { showOn: ["invoice"] } } });
    expect(moved.find((n) => n.id === "quote-validity")!.appliesTo).toEqual(["quote", "invoice"]);
    expect(moved.find((n) => n.id === "fl-lien-713")!.appliesTo).toEqual(["quote"]);
  });
});
