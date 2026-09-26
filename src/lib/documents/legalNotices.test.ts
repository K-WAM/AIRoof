import { describe, expect, it } from "vitest";
import {
  FLORIDA_NOTICE_DEFAULTS,
  type LegalNoticeDefault,
  type NoticeDoc,
} from "./legalNotices";

const EXPECTED_IDS = [
  "fl-lien-713",
  "fl-recovery-fund-489",
  "fl-defect-558",
  "quote-validity",
  "hidden-damage",
  "price-escalation",
  "permits",
  "weather-delays",
  "payment-terms",
];

// The defaults are DRAFT legal wording. These tests only pin the data shape and
// the placeholders E5 depends on — never that a statute's text is exact.
describe("FLORIDA_NOTICE_DEFAULTS", () => {
  it("has unique ids", () => {
    const ids = FLORIDA_NOTICE_DEFAULTS.map((notice) => notice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes exactly the contracted id set", () => {
    expect(FLORIDA_NOTICE_DEFAULTS.map((notice) => notice.id)).toEqual(EXPECTED_IDS);
  });

  it("gives every statutory notice a positive thresholdUsd", () => {
    const statutory = FLORIDA_NOTICE_DEFAULTS.filter((notice) => notice.statutory);
    expect(statutory.length).toBeGreaterThan(0);
    for (const notice of statutory) {
      expect(typeof notice.thresholdUsd, notice.id).toBe("number");
      expect(notice.thresholdUsd, notice.id).toBeGreaterThan(0);
    }
  });

  it("never gives a non-statutory notice a thresholdUsd", () => {
    for (const notice of FLORIDA_NOTICE_DEFAULTS.filter((n) => !n.statutory)) {
      expect(notice.thresholdUsd, notice.id).toBeUndefined();
    }
  });

  it("has a non-empty title and text on every notice", () => {
    for (const notice of FLORIDA_NOTICE_DEFAULTS) {
      expect(notice.title.trim().length, notice.id).toBeGreaterThan(0);
      expect(notice.text.trim().length, notice.id).toBeGreaterThan(0);
    }
  });

  it("targets only the known documents and at least one each", () => {
    const allowed: NoticeDoc[] = ["quote", "invoice"];
    for (const notice of FLORIDA_NOTICE_DEFAULTS) {
      expect(notice.appliesTo.length, notice.id).toBeGreaterThan(0);
      for (const doc of notice.appliesTo) {
        expect(allowed, `${notice.id}:${doc}`).toContain(doc);
      }
    }
  });

  it("uses only the {businessName} / {licenseNumber} placeholders and no HTML", () => {
    for (const notice of FLORIDA_NOTICE_DEFAULTS) {
      const placeholders = notice.text.match(/\{[^}]*\}/g) ?? [];
      for (const token of placeholders) {
        expect(["{businessName}", "{licenseNumber}"], notice.id).toContain(token);
      }
      expect(notice.text, notice.id).not.toMatch(/[<>]/);
    }
  });
});

// A compile-time check that the exported type is exactly the contracted shape.
const _typeCheck: LegalNoticeDefault[] = FLORIDA_NOTICE_DEFAULTS;
void _typeCheck;
