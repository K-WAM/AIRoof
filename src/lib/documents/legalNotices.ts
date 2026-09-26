// DRAFT Florida document notices — the default, editable legal wording for quotes
// and invoices. Source of truth for the wording: docs/FLORIDA-DOCUMENT-NOTICES.md.
//
// NOT LEGAL ADVICE. Every statutory citation and every quoted snippet in the memo
// must be verified verbatim against the current Florida Statutes by a
// Florida-licensed construction attorney before use. Nothing in this file renders
// on a customer document until the owner's "reviewed" approval flag is set (E5).

export type NoticeDoc = "quote" | "invoice";

export interface LegalNoticeDefault {
  /** Stable id persisted for the tenant's on/off + edited text. */
  id: string; // "fl-lien-713", "fl-recovery-fund-489", "fl-defect-558", "quote-validity", "hidden-damage", "price-escalation", "permits", "weather-delays", "payment-terms"
  title: string;
  appliesTo: NoticeDoc[];
  /** true = only when residential and total > thresholdUsd. */
  statutory: boolean; // true = only when residential and total > thresholdUsd
  /** 2500 for the statutory ones. */
  thresholdUsd?: number;
  /** DRAFT wording from the memo; {businessName} / {licenseNumber} placeholders allowed. */
  text: string;
}

export const FLORIDA_NOTICE_DEFAULTS: LegalNoticeDefault[] = [
  {
    id: "fl-lien-713",
    title: "Construction Lien Law notice",
    appliesTo: ["quote"],
    statutory: true,
    thresholdUsd: 2500,
    text:
      "FLORIDA LAW REQUIRES THAT WE GIVE YOU THIS NOTICE ABOUT YOUR RIGHTS UNDER THE CONSTRUCTION LIEN LAW BEFORE WE BEGIN WORK. [DRAFT — the contractor must replace this with the current statutory wording. Verify verbatim against the current Florida Statutes.] Contractor: {businessName}, License #{licenseNumber}.",
  },
  {
    id: "fl-recovery-fund-489",
    title: "Homeowners' Construction Recovery Fund notice",
    appliesTo: ["quote"],
    statutory: true,
    thresholdUsd: 2500,
    text:
      "IF YOUR CONTRACTOR FAILS TO PERFORM, YOU MAY HAVE A CLAIM AGAINST THE HOMEOWNERS' CONSTRUCTION RECOVERY FUND. [DRAFT — replace with the current statutory wording. Verify verbatim against the current Florida Statutes.]",
  },
  {
    id: "fl-defect-558",
    title: "Notice of construction defect and opportunity to repair",
    appliesTo: ["quote"],
    statutory: true,
    thresholdUsd: 2500,
    text:
      "NOTICE OF CONSTRUCTION DEFECT AND OPPORTUNITY TO REPAIR: the parties must give notice and an opportunity to inspect and repair as required by Florida law. [DRAFT — verify the current statutory wording and required time periods against the current Florida Statutes.]",
  },
  {
    id: "quote-validity",
    title: "Quote validity",
    appliesTo: ["quote"],
    statutory: false,
    text:
      "This quote is valid for 30 days from the date above. After that, pricing may change and the work may need to be re-inspected.",
  },
  {
    id: "hidden-damage",
    title: "Concealed damage and change orders",
    appliesTo: ["quote", "invoice"],
    statutory: false,
    text:
      "This quote covers the work described above. If we find concealed or additional damage once work begins, we will stop, explain it, and give you a written change order to approve before doing the extra work. Added work is billed at our stated unit prices.",
  },
  {
    id: "price-escalation",
    title: "Material price increases",
    appliesTo: ["quote"],
    statutory: false,
    text:
      "Material prices can change without notice, especially after a storm. If a material price rises before your work is scheduled or before materials are ordered, we will tell you and confirm the change with you before proceeding.",
  },
  {
    id: "permits",
    title: "Permit and inspection fees",
    appliesTo: ["quote", "invoice"],
    statutory: false,
    text:
      "Permit and inspection fees are not included in this price unless stated above. If a permit is required, the fee is passed through at cost with the municipality's receipt. We will confirm before pulling it.",
  },
  {
    id: "weather-delays",
    title: "Weather and hurricane-season delays",
    appliesTo: ["quote"],
    statutory: false,
    text:
      "Outdoor work depends on the weather. Rain, storms, or hurricane-season conditions may delay the start or completion of the work. We will reschedule as soon as it is safe and keep you informed.",
  },
  {
    id: "payment-terms",
    title: "Payment, deposits and late payment",
    appliesTo: ["quote", "invoice"],
    statutory: false,
    text:
      "Payment is due upon completion unless a deposit is agreed in writing above. A deposit, if any, may not exceed the amount allowed by Florida law (see section 489.126, Florida Statutes — verify verbatim against the current Florida Statutes). Late payments may be subject to a late charge. [DRAFT — attorney to confirm the deposit cap, due terms and late-charge wording.]",
  },
];
