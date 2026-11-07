// Client onboarding portal (T-355..T-360, owner 2026-11-06).
//
// One portal per client business. The superadmin sees and edits it at /admin/businesses/[businessId]/onboarding; the
// client sees a read-mostly copy through ONE private link (/o/<token>, then /onboarding) and fills in short forms there.
//
// Storage (all server-only: no Firestore rule matches these collections, so the catch-all deny applies):
//   clientOnboarding/{businessId}                      OnboardingPortal (steps, checklist, form status, data review)
//   clientOnboardingForms/{businessId}__{formId}       OnboardingSubmission (the client's answers, one doc per form)
//   clientOnboardingLinks/{sha256(token) hex}          OnboardingLinkRecord (lookup by hash; the doc id is never the token)
//
// The client link: /o/<token> (a route handler, like /f/[grant]) swaps the token for an HttpOnly cookie and redirects to
// /onboarding, so the token never stays in the address bar, history or a Referer header. The plain token is kept ONLY on
// the server-only portal doc (link.token) so the superadmin can copy the link again; only superadmin APIs return it.
//
// Never store a form's answers on the portal doc: the portal doc is read on every superadmin list render, and some
// answers (an EIN) belong only on the submission doc.

/** The forms a client can be sent. Content lives in src/lib/onboarding/forms.ts (one definition per id). */
export type OnboardingFormId = "texting" | "payments" | "team" | "company" | "documents";
export const ONBOARDING_FORM_IDS: readonly OnboardingFormId[] = ["texting", "payments", "team", "company", "documents"];

// ── Progress tracker (the row of step cards at the top) ──────────────────────────────────────────────────────────

export type OnboardingStepStatus = "done" | "current" | "upcoming";

export interface OnboardingStep {
  /** Stable id, e.g. "rfi-sent". Lowercase letters, digits and dashes. */
  id: string;
  /** Short title, e.g. "Information request sent". */
  title: string;
  /** One sentence the client reads under the title. */
  detail: string;
  /** Calendar date, YYYY-MM-DD (shown as "NOV 4"). Optional for steps not yet scheduled. */
  date?: string;
  /** Optional time label shown after the date, e.g. "10 a.m." (free text, ≤ 20 chars). */
  timeLabel?: string;
  status: OnboardingStepStatus;
  /** ms; set by the server when status becomes "done". */
  completedAt?: number;
}

// ── Checklist (what we asked for, grouped; "Received / Waiting") ─────────────────────────────────────────────────

export type ChecklistStatus = "received" | "partial" | "waiting" | "not_needed";

export interface OnboardingChecklistItem {
  /** Stable id, e.g. "staff-list". */
  id: string;
  /** Group heading, e.g. "Staff and permissions". Items render grouped in first-seen order. */
  group: string;
  title: string;
  /** One line under the title: what it is or what's still missing. */
  detail?: string;
  status: ChecklistStatus;
  /** When the client answers this item through a form, the form's id: the client page links to it. */
  formId?: OnboardingFormId;
  /** True when the client sends this as a file (by email). The client page shows how to send it. */
  sendByEmail?: boolean;
  /** ms; set by the server when status becomes "received". */
  receivedAt?: number;
  /** Superadmin-only note. NEVER returned by the public link API. */
  internalNote?: string;
}

// ── Forms ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type OnboardingFormStatus = "not_sent" | "sent" | "in_progress" | "submitted" | "reviewed";

export interface OnboardingFormState {
  id: OnboardingFormId;
  /** Off = not shown to the client at all. */
  enabled: boolean;
  status: OnboardingFormStatus;
  /** ms timestamps, set by the server. */
  sentAt?: number;
  firstOpenedAt?: number;
  submittedAt?: number;
  reviewedAt?: number;
  /** Name the client typed in the form's "Your name" field when submitting. */
  submittedBy?: string;
}

/** Field types the one form renderer supports. Add a type only together with its renderer + validator. */
export type OnboardingFieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "ein" // US Employer Identification Number, NN-NNNNNNN; masked to the last 4 digits on every read after saving
  | "number"
  | "money" // whole US dollars
  | "select"
  | "radio"
  | "checkboxes"
  | "checkbox" // one yes/no tick, e.g. an attestation
  | "address" // street, city, state (2 letters), ZIP
  | "people" // a table of people: see OnboardingPersonRow
  | "matrix"; // rows × fixed choices, e.g. "Who can send invoices?" × Owner / Office / Supervisor

export interface OnboardingOption {
  value: string;
  label: string;
}

/** Values the server fills in before the client starts, from what Luxor already holds. Resolved in src/lib/onboarding/prefill.ts. */
export type OnboardingPrefillKey =
  | "business.legalName"
  | "business.displayName"
  | "business.phone"
  | "business.website"
  | "business.address"
  | "business.serviceArea"
  | "business.hours"
  | "business.notificationEmail"
  | "companies.options" // multi-company clients: one option per company (RDSF, RCU)
  | "team.people" // staff directory + logins, as OnboardingPersonRow[]
  | "crews.options"; // one option per active crew

export interface OnboardingField {
  /** Unique within the form. Lowercase camelCase. */
  id: string;
  type: OnboardingFieldType;
  label: string;
  /** One short line under the label. */
  help?: string;
  required?: boolean;
  placeholder?: string;
  /** select / radio / checkboxes: fixed options. matrix: the COLUMN choices. */
  options?: OnboardingOption[];
  /** select / radio / checkboxes whose options come from data (companies, crews). */
  optionsFrom?: OnboardingPrefillKey;
  /** matrix: the ROW questions. */
  rows?: OnboardingOption[];
  /** Max characters (text-like) or max rows (people). */
  max?: number;
  /** Prefilled value (the client can change it). */
  prefill?: OnboardingPrefillKey;
  /** Default value when there is no prefill and no saved answer (checkboxes: string[]; checkbox: boolean). */
  defaultValue?: string | string[] | boolean;
  /** Only shown (and only validated) when another field in the SAME form has this value (checkbox: true/false). */
  showIf?: { field: string; equals: string | boolean };
}

export interface OnboardingFormSection {
  id: string;
  title: string;
  /** One or two plain sentences above the fields. */
  intro?: string;
  fields: OnboardingField[];
}

/** Read-only content blocks (the Payments page is mostly these). Rendered as plain text: never as HTML. */
export interface OnboardingInfoBlock {
  kind: "paragraph" | "bullets" | "steps" | "callout" | "links";
  title?: string;
  text?: string;
  items?: string[];
  /** Absolute https links only (or a path starting with "/legal/"). Rendered with rel="noopener noreferrer". */
  links?: Array<{ label: string; href: string }>;
}

export interface OnboardingFormDefinition {
  id: OnboardingFormId;
  /** Card title, e.g. "Turn on text messages". */
  title: string;
  /** One line on the card. */
  summary: string;
  /** Honest estimate shown on the card, e.g. 5 ("About 5 minutes"). 0 = reading only. */
  minutes: number;
  /** Shown at the top of the form page. */
  intro: string;
  /** Read-only blocks shown before the sections. */
  info?: OnboardingInfoBlock[];
  /** Empty for a reading-only page. */
  sections: OnboardingFormSection[];
  /** "How we use this information": shown at the bottom of every form, above the submit button. */
  dataUse: string[];
  /** Links shown with dataUse (privacy policies). */
  dataUseLinks?: Array<{ label: string; href: string }>;
  submitLabel: string;
  /** Shown after a successful submit. */
  thankYou: string;
}

/** One row of a "people" field. */
export interface OnboardingPersonRow {
  name: string;
  /** Job title as the client calls it, e.g. "Service Supervisor". */
  position?: string;
  /** One of OnboardingPeopleRoleOptions' values. */
  appRole?: string;
  email?: string;
  mobile?: string;
  language?: "en" | "es" | "both";
  /** Crew id from crews.options, or "" for none. */
  crewId?: string;
  /** True when the row came from data Luxor already held (shown with a small "From your Jobba data" note). */
  prefilled?: boolean;
}

/** Saved answers for one form. Field id → value. A people field holds OnboardingPersonRow[]; an address holds OnboardingAddress. */
export type OnboardingAnswers = Record<string, unknown>;

export interface OnboardingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface OnboardingSubmission {
  businessId: string;
  formId: OnboardingFormId;
  answers: OnboardingAnswers;
  /** "draft" while the client saves progress; "submitted" after they press the submit button. */
  state: "draft" | "submitted";
  updatedAt: number;
  submittedAt?: number;
  submittedBy?: string;
  /** Every save bumps this; a save carrying an older revision is refused (two tabs, one form). */
  revision: number;
}

// ── Data review ("What we found in your data") ──────────────────────────────────────────────────────────────────

export interface OnboardingDataReview {
  title: string;
  /** One paragraph. */
  intro: string;
  sections: Array<{
    heading: string;
    /** Plain text. Lines starting with "- " render as bullets; blank lines split paragraphs. Never HTML. */
    body: string;
  }>;
  updatedAt: number;
}

// ── The portal doc ───────────────────────────────────────────────────────────────────────────────────────────────

export interface OnboardingPortal {
  businessId: string;
  /** Heading on the client page, e.g. the business display name. Defaults to BusinessConfig.businessName. */
  clientName: string;
  steps: OnboardingStep[];
  checklist: OnboardingChecklistItem[];
  forms: Record<OnboardingFormId, OnboardingFormState>;
  dataReview?: OnboardingDataReview;
  settings: {
    /** One-time Stripe setup fee Luxor charges per company (whole dollars). Missing = the page says the fee is confirmed first. */
    paymentsSetupFeePerCompany?: number;
    /** Who the client contacts, shown on the client page. */
    contactName?: string;
    contactEmail?: string;
    /** Free text line under the tracker, e.g. "Next review: Friday, November 13 at 10 a.m." */
    nextMeetingLabel?: string;
  };
  /** The client's private link. Returned ONLY by superadmin APIs; never by the public view. */
  link?: {
    /** 32 random bytes, base64url. Rotating the link replaces it and deletes the old hash record. */
    token: string;
    createdAt: number;
    expiresAt: number;
    lastOpenedAt?: number;
    revokedAt?: number;
    /** Last 4 characters of the token, so the superadmin can tell links apart. */
    hint: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface OnboardingLinkRecord {
  businessId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
}

/** What the public link API returns: the portal minus every superadmin-only field. */
export interface PublicOnboardingView {
  clientName: string;
  /** The client's logo (default company logo) as a data/https URL, or null. */
  logoUrl: string | null;
  steps: OnboardingStep[];
  checklist: Array<Omit<OnboardingChecklistItem, "internalNote">>;
  forms: Array<{ id: OnboardingFormId; status: OnboardingFormStatus; title: string; summary: string; minutes: number }>;
  dataReview?: OnboardingDataReview;
  settings: { contactName?: string; contactEmail?: string; nextMeetingLabel?: string };
  expiresAt: number;
}
