// Terms & notices on quotes and invoices — the ONE place that decides whether any legal wording reaches a customer.
//
// Safety model (owner decision 2026-09-25): the Florida wording in legalNotices.ts is DRAFT. It is editable per business, and
// NOTHING renders on any document until the OWNER ticks "I have had these reviewed". That approval is bound to the exact
// wording (a fingerprint), so editing or switching a notice on/off afterwards silently withdraws it until it is approved
// again. And approval itself is refused while an enabled notice still contains a "[DRAFT" placeholder, so a draft marker
// can never be printed on a customer's document.

import { FLORIDA_NOTICE_DEFAULTS, type LegalNoticeDefault, type NoticeDoc } from "./legalNotices";

export interface NoticeOverride {
  enabled?: boolean;
  text?: string;
  /** Non-statutory notices only: which documents show it. Statutory ones always follow their default. */
  showOn?: NoticeDoc[];
}

export interface DocumentNoticeSettings {
  notices?: Record<string, NoticeOverride>;
  approvedAt?: number;
  approvedBy?: string;
  /** Fingerprint of the enabled wording at the moment of approval. */
  approvedFingerprint?: string;
}

export interface EffectiveNotice {
  id: string;
  title: string;
  appliesTo: NoticeDoc[];
  statutory: boolean;
  thresholdUsd?: number;
  text: string;
  enabled: boolean;
  /** True when the business changed the default wording. */
  edited: boolean;
}

export interface RenderedNotice { id: string; title: string; text: string; statutory: boolean }

export const NOTICE_TEXT_MAX = 4000;
const DRAFT_MARKER = /\[\s*DRAFT/i;
const DOCS: NoticeDoc[] = ["quote", "invoice"];

/** The defaults merged with the business's own on/off, wording and placement. */
export function effectiveNotices(settings?: DocumentNoticeSettings | null, defaults: LegalNoticeDefault[] = FLORIDA_NOTICE_DEFAULTS): EffectiveNotice[] {
  return defaults.map((def) => {
    const override = settings?.notices?.[def.id];
    const text = typeof override?.text === "string" && override.text.trim() ? override.text.trim() : def.text;
    const showOn = !def.statutory && Array.isArray(override?.showOn)
      ? DOCS.filter((doc) => override!.showOn!.includes(doc))
      : def.appliesTo;
    return {
      id: def.id, title: def.title, statutory: def.statutory, thresholdUsd: def.thresholdUsd,
      appliesTo: showOn.length ? showOn : def.appliesTo,
      text, enabled: override?.enabled !== false, edited: text !== def.text,
    };
  });
}

/** 32-bit FNV-1a, twice with different seeds — change detection for the approved wording, not a security primitive. */
function hash(input: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/** Identifies the exact set of ENABLED wording (which notices, where they show, what they say). */
export function noticeFingerprint(notices: EffectiveNotice[]): string {
  return hash(JSON.stringify(notices.filter((n) => n.enabled).map((n) => [n.id, [...n.appliesTo].sort(), n.statutory, n.thresholdUsd ?? null, n.text])));
}

/** Enabled notices whose wording still carries a "[DRAFT" placeholder — these must be replaced or switched off before approval. */
export function draftMarkerNotices(notices: EffectiveNotice[]): EffectiveNotice[] {
  return notices.filter((n) => n.enabled && DRAFT_MARKER.test(n.text));
}

export type ApprovalStatus = "approved" | "never" | "changed" | "draft-markers";

export function noticeApproval(settings?: DocumentNoticeSettings | null): { approved: boolean; status: ApprovalStatus; blocking: EffectiveNotice[] } {
  const notices = effectiveNotices(settings);
  const blocking = draftMarkerNotices(notices);
  if (blocking.length) return { approved: false, status: "draft-markers", blocking };
  if (!settings?.approvedAt || !settings.approvedFingerprint) return { approved: false, status: "never", blocking: [] };
  if (settings.approvedFingerprint !== noticeFingerprint(notices)) return { approved: false, status: "changed", blocking: [] };
  return { approved: true, status: "approved", blocking: [] };
}

/** Fill {businessName} / {licenseNumber}. With no license on file the "License #…" phrase is dropped rather than printed blank. */
export function renderNoticeText(text: string, vars: { businessName?: string; licenseNumber?: string }): string {
  const license = vars.licenseNumber?.trim();
  const withLicense = license
    ? text.replaceAll("{licenseNumber}", license)
    : text.replace(/[,;]?\s*License\s*#\s*\{licenseNumber\}/gi, "").replaceAll("{licenseNumber}", "");
  return withLicense.replaceAll("{businessName}", vars.businessName?.trim() || "the contractor").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * The notices to print on one document. [] unless the wording is approved. Statutory notices (the residential-owner ones)
 * only apply when the property is not commercial AND the total is over their dollar threshold.
 */
export function noticesForDocument(input: {
  doc: NoticeDoc;
  total: number;
  commercial?: boolean;
  settings?: DocumentNoticeSettings | null;
  business?: { businessName?: string; licenseNumber?: string };
}): RenderedNotice[] {
  if (!noticeApproval(input.settings).approved) return [];
  return effectiveNotices(input.settings)
    .filter((n) => n.enabled && n.appliesTo.includes(input.doc))
    .filter((n) => !n.statutory || (input.commercial !== true && input.total > (n.thresholdUsd ?? 0)))
    .map((n) => ({ id: n.id, title: n.title, statutory: n.statutory, text: renderNoticeText(n.text, input.business ?? {}) }))
    .filter((n) => n.text.length > 0);
}
