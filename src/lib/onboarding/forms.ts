// The client onboarding forms (T-357..T-359, owner 2026-11-06): WHAT we ask and the data-use wording, as data.
// One renderer (src/components/onboarding/OnboardingForm.tsx) and one validator (src/lib/onboarding/validate.ts) read
// these definitions; neither hardcodes a question. Keep every form short (owner: "nothing too long") and the words plain
// (docs/ZERO-TRAINING-UX-STANDARD.md). Industry-neutral: no client names, no trade-specific nouns.
//
// Renderer rules the definitions rely on:
// - Every form ends with a required "Your name" field (stored as submittedBy); definitions don't declare it.
// - A field with `optionsFrom` that resolves to fewer than 2 options is hidden (single-company clients never see
//   "Which company?").
// - `showIf` against a checkboxes field means "that field's value includes `equals`".
// - Info text may contain {{setupFee}}: replaced by "$<fee> per company" when settings.paymentsSetupFeePerCompany is
//   set, else by "confirmed with you before anything starts". Plain-text substitution, never HTML.

import type { OnboardingFormDefinition, OnboardingFormId, OnboardingOption } from "@/types/onboarding";

const NEVER_SOLD = "We never sell your information or use it for marketing.";
const PRIVACY_LINKS = [
  { label: "Luxor Privacy Policy", href: "/legal/privacy" },
];

/** App access choices for one person (values are the Team page's user types, plus "none"). */
export const PEOPLE_ROLE_OPTIONS: OnboardingOption[] = [
  { value: "admin", label: "Admin (everything)" },
  { value: "manager", label: "Management" },
  { value: "office", label: "Office staff" },
  { value: "supervisor", label: "Supervisor" },
  { value: "office_admin", label: "Office admin" },
  { value: "front_desk", label: "Front desk" },
  { value: "inspector", label: "Inspector" },
  { value: "foreman", label: "Foreman" },
  { value: "technician", label: "Technician" },
  { value: "viewer", label: "View only" },
  { value: "none", label: "No login needed" },
];

const WHO: OnboardingOption[] = [
  { value: "owner", label: "Owner" },
  { value: "office", label: "Office" },
  { value: "supervisor", label: "Supervisors" },
  { value: "field", label: "Field crew" },
];

const DOCUMENT_ROWS: OnboardingOption[] = [
  { value: "quote", label: "Quote or proposal" },
  { value: "workAuthorization", label: "Work authorization" },
  { value: "depositInvoice", label: "Deposit invoice" },
  { value: "finalInvoice", label: "Final invoice" },
  { value: "tmInvoice", label: "Time-and-materials invoice" },
  { value: "completionNotice", label: "Completion notice or report" },
];

const TEXTING: OnboardingFormDefinition = {
  id: "texting",
  title: "Turn on text messages",
  summary: "Register your business so customers can get confirmation and reminder texts.",
  minutes: 5,
  intro:
    "US mobile carriers require every business that texts its customers to be registered. Luxor's own registration is done. "
    + "Now we register your business as the sender through Twilio, our texting provider. Carrier review usually takes one to three weeks.",
  sections: [
    {
      id: "business",
      title: "Your business",
      intro: "Use the details exactly as they appear on your IRS records. Carriers compare them.",
      fields: [
        { id: "companyId", type: "radio", label: "Which company sends the texts?", optionsFrom: "companies.options", required: true,
          help: "Texts show one company name. Most businesses pick their main company." },
        { id: "legalName", type: "text", label: "Legal business name", required: true, max: 120, prefill: "business.legalName",
          help: "As written on your IRS EIN letter (CP 575)." },
        { id: "ein", type: "ein", label: "EIN (Employer Identification Number)", required: true, placeholder: "12-3456789",
          help: "9 digits. After you save, we only ever show the last 4." },
        { id: "businessType", type: "select", label: "Type of business", required: true, options: [
          { value: "llc", label: "LLC" },
          { value: "corporation", label: "Corporation" },
          { value: "partnership", label: "Partnership" },
          { value: "sole_proprietor", label: "Sole proprietor" },
          { value: "non_profit", label: "Non-profit" },
        ] },
        { id: "address", type: "address", label: "Business address", required: true, prefill: "business.address",
          help: "The address on your IRS records. No PO boxes." },
        { id: "website", type: "url", label: "Website", required: true, max: 200, prefill: "business.website",
          help: "It must open and show your business name. Carriers check it." },
        { id: "privacyUrl", type: "url", label: "Privacy policy page (if you have one)", max: 300,
          help: "No page yet? Leave this blank and we'll send you short wording to add to your website." },
      ],
    },
    {
      id: "representative",
      title: "Who can confirm the registration",
      intro: "Carriers may email or call this person to confirm the business. Pick someone who can speak for the company, like the owner or a manager.",
      fields: [
        { id: "repName", type: "text", label: "Full name", required: true, max: 100 },
        { id: "repTitle", type: "text", label: "Job title", required: true, max: 80, placeholder: "President" },
        { id: "repEmail", type: "email", label: "Work email", required: true, max: 200 },
        { id: "repPhone", type: "tel", label: "Mobile phone", required: true },
      ],
    },
    {
      id: "messages",
      title: "What you'll send",
      fields: [
        { id: "messageTypes", type: "checkboxes", label: "Which texts do you want to send?", required: true,
          defaultValue: ["confirmations", "reminders", "onTheWay"],
          help: "Offers and promotions need separate written permission from each customer. Most businesses start without them.",
          options: [
            { value: "confirmations", label: "Appointment confirmations" },
            { value: "reminders", label: "Appointment reminders" },
            { value: "onTheWay", label: "\"We're on the way\" updates" },
            { value: "invoices", label: "Invoice and payment reminders" },
            { value: "marketing", label: "Offers or promotions" },
          ] },
        { id: "volume", type: "radio", label: "About how many texts a month?", required: true, options: [
          { value: "under1k", label: "Fewer than 1,000" },
          { value: "1kTo10k", label: "1,000 to 10,000" },
          { value: "over10k", label: "More than 10,000" },
        ] },
      ],
    },
    {
      id: "consent",
      title: "How customers agree to get texts",
      intro: "Carriers want to know how people agree to receive your texts.",
      fields: [
        { id: "consentMethods", type: "checkboxes", label: "How do customers agree today?", required: true, options: [
          { value: "phone", label: "They agree on a phone call (with your office or the AI receptionist)" },
          { value: "webForm", label: "A form on your website with a texting checkbox" },
          { value: "paperwork", label: "Your signed paperwork (a contract or work authorization)" },
          { value: "other", label: "Another way" },
        ] },
        { id: "consentOther", type: "text", label: "Describe the other way", max: 300, required: true,
          showIf: { field: "consentMethods", equals: "other" } },
        { id: "attest", type: "checkbox", required: true,
          label: "We only text people who gave us their number and agreed to get texts about their service. Anyone can reply STOP to stop or HELP for help." },
      ],
    },
  ],
  dataUse: [
    "We use these details only to register your business with US mobile carriers through Twilio, our texting provider.",
    "Twilio and The Campaign Registry (the registry US carriers use) receive the business details and the contact person's name, email and phone. No one else does.",
    NEVER_SOLD,
    "Only Luxor's account team can see your answers. They travel over an encrypted connection and are stored encrypted.",
    "Ask us to delete them any time after the registration is approved.",
  ],
  dataUseLinks: [
    ...PRIVACY_LINKS,
    { label: "Text Message Terms", href: "/legal/sms" },
    { label: "Twilio Privacy Notice", href: "https://www.twilio.com/en-us/legal/privacy" },
  ],
  submitLabel: "Send for registration",
  thankYou: "Thank you. We'll start the registration and tell you when the carriers approve it.",
};

const PAYMENTS: OnboardingFormDefinition = {
  id: "payments",
  title: "Online payments",
  summary: "How customers will pay by card or bank transfer, and what to have ready.",
  minutes: 3,
  intro:
    "Your customers will be able to pay invoices online by card or bank transfer (ACH). Here's how it works and what to have ready. "
    + "Nothing on this page asks for bank or tax numbers: you enter those on Stripe's own website.",
  info: [
    { kind: "paragraph", title: "Stripe handles the money",
      text: "Payments are processed by Stripe, a payment company used by millions of businesses. Card and bank numbers go straight to Stripe. Luxor never sees or stores them." },
    { kind: "paragraph", title: "You own the account",
      text: "Each company gets its own Stripe account (Stripe calls it a Standard account). You sign in to Stripe yourself, see every payment, and Stripe pays out to your bank. Luxor's platform connects to it only to put a Pay button on your invoices. You can disconnect it from your Stripe dashboard at any time." },
    { kind: "callout", title: "One Stripe account per company",
      text: "Every company with its own bank account (for example, each LLC) needs its own Stripe account. Each one is set up separately." },
    { kind: "paragraph", title: "Fees",
      text: "Stripe charges its processing fee on each payment; the fees are listed on Stripe's pricing page. Luxor's one-time setup fee is {{setupFee}}." },
    { kind: "bullets", title: "What to have ready, for each company", items: [
      "Legal business name and EIN",
      "Business address and phone number",
      "Your website",
      "The person setting it up: name, date of birth, home address and the last 4 digits of their Social Security number. Stripe asks for these to confirm identity; they go only to Stripe.",
      "Anyone who owns 25% or more of the company: the same details",
      "The business bank account for payouts (routing and account number)",
      "How the charge should read on a customer's card statement, for example \"SMITH ROOFING\" (up to 22 characters)",
      "A phone number or email customers can use for payment questions",
    ] },
    { kind: "steps", title: "How setup works", items: [
      "You tell us you're ready.",
      "We send you a secure Stripe link for each company.",
      "You fill it in on Stripe's website. It takes about 15 minutes per company.",
      "Stripe checks the details, usually within one or two business days.",
      "We turn on the Pay button for that company's invoices.",
    ] },
    { kind: "links", title: "Learn more", links: [
      { label: "Stripe", href: "https://stripe.com" },
      { label: "Stripe pricing", href: "https://stripe.com/pricing" },
      { label: "About Standard accounts", href: "https://docs.stripe.com/connect/standard-accounts" },
      { label: "Stripe Privacy Policy", href: "https://stripe.com/privacy" },
    ] },
  ],
  sections: [
    {
      id: "today",
      title: "How you get paid today",
      intro: "A few quick answers help us set up your invoices, deposits and reminders.",
      fields: [
        { id: "monthlyInvoiced", type: "money", label: "About how much do you invoice in a month?" },
        { id: "paymentsPerMonth", type: "number", label: "About how many payments come in each month?" },
        { id: "typicalInvoice", type: "money", label: "A typical invoice amount" },
        { id: "methods", type: "checkboxes", label: "How do customers pay you today?", options: [
          { value: "ach", label: "Bank transfer (ACH)" },
          { value: "check", label: "Check" },
          { value: "card", label: "Card" },
          { value: "cash", label: "Cash" },
          { value: "other", label: "Other" },
        ] },
        { id: "split", type: "text", label: "Roughly, how is it split?", max: 200, placeholder: "e.g. half ACH, most of the rest by check" },
        { id: "processor", type: "text", label: "Do you use a card processor now? Which one?", max: 120 },
        { id: "accounting", type: "select", label: "Accounting software", options: [
          { value: "qbo", label: "QuickBooks Online" },
          { value: "qbd", label: "QuickBooks Desktop" },
          { value: "xero", label: "Xero" },
          { value: "other", label: "Other" },
          { value: "none", label: "None" },
        ] },
        { id: "deposits", type: "textarea", label: "How do you handle deposits or progress payments?", max: 600,
          placeholder: "e.g. 50% when the work is approved, the rest on completion" },
      ],
    },
    {
      id: "online",
      title: "Starting online payments",
      fields: [
        { id: "wantOnline", type: "radio", label: "Do you want customers to pay online?", required: true, options: [
          { value: "all", label: "Yes, for every company" },
          { value: "some", label: "Yes, for some companies" },
          { value: "later", label: "Not yet" },
        ] },
        { id: "onlineCompanies", type: "checkboxes", label: "Which companies?", optionsFrom: "companies.options", required: true,
          showIf: { field: "wantOnline", equals: "some" } },
      ],
    },
  ],
  dataUse: [
    "These answers help us set up your invoices, deposits and reminders.",
    "We don't collect bank, card or tax numbers here. Stripe collects those on its own secure website.",
    "Only Luxor's account team can see your answers.",
    NEVER_SOLD,
  ],
  dataUseLinks: PRIVACY_LINKS,
  submitLabel: "Send answers",
  thankYou: "Thank you. When you're ready for online payments, tell us and we'll send the Stripe links.",
};

const TEAM: OnboardingFormDefinition = {
  id: "team",
  title: "Your team and crews",
  summary: "Who works with you, what each person can do, and who is on each crew.",
  minutes: 8,
  intro: "Tell us who works with you and what each person should be able to do. Nobody gets an invite, email or text until you say so.",
  sections: [
    {
      id: "people",
      title: "Your team",
      intro: "We filled in what we already have. Fix anything that's wrong and add anyone who's missing.",
      fields: [
        { id: "people", type: "people", label: "People", required: true, max: 80, prefill: "team.people",
          help: "One row per person. Crew: who they usually work with in the field." },
      ],
    },
    {
      id: "access",
      title: "Who can do what",
      intro: "Tick everyone who should be able to do each thing.",
      fields: [
        { id: "permissions", type: "matrix", label: "Permissions", options: WHO, rows: [
          { value: "approveQuotes", label: "Approve quotes and proposals" },
          { value: "seePrices", label: "See prices and costs" },
          { value: "sendInvoices", label: "Send invoices" },
          { value: "recordPayments", label: "Record payments and refunds" },
          { value: "seeFinances", label: "See finances and payroll" },
          { value: "manageUsers", label: "Add or remove users" },
        ] },
        { id: "notes", type: "textarea", label: "Anything else about roles or access?", max: 800 },
      ],
    },
  ],
  dataUse: [
    "We use names, emails and phone numbers only to set up logins and crew lists when you're ready.",
    "No one on your team gets an invite, email or text until you tell us to send it.",
    "Only Luxor's account team and your account's admins can see this list.",
    NEVER_SOLD,
  ],
  dataUseLinks: PRIVACY_LINKS,
  submitLabel: "Send team details",
  thankYou: "Thank you. We'll set up the team in your account and check with you before anyone is invited.",
};

const COMPANY: OnboardingFormDefinition = {
  id: "company",
  title: "Company and booking details",
  summary: "Check your contact details, service area, hours and booking rules.",
  minutes: 3,
  intro: "Here's what we have on file. Correct anything that's wrong. Your documents and the AI receptionist use these details.",
  sections: [
    {
      id: "contact",
      title: "Contact details",
      fields: [
        { id: "displayName", type: "text", label: "Business name customers know", required: true, max: 120, prefill: "business.displayName" },
        { id: "phone", type: "tel", label: "Main phone number", required: true, prefill: "business.phone" },
        { id: "website", type: "url", label: "Website", max: 200, prefill: "business.website" },
        { id: "address", type: "address", label: "Office address", prefill: "business.address" },
        { id: "alertsEmail", type: "email", label: "Email for new requests and alerts", required: true, max: 200, prefill: "business.notificationEmail" },
      ],
    },
    {
      id: "area",
      title: "Where and when you work",
      fields: [
        { id: "serviceArea", type: "textarea", label: "Areas you serve", max: 600, prefill: "business.serviceArea",
          help: "Cities or counties, separated by commas." },
        { id: "hours", type: "textarea", label: "Office hours", max: 300, prefill: "business.hours",
          placeholder: "e.g. Mon–Fri 8 a.m.–5 p.m." },
        { id: "emergencies", type: "textarea", label: "What counts as an emergency, and who should be called?", max: 600 },
      ],
    },
    {
      id: "booking",
      title: "Booking",
      fields: [
        { id: "visitLength", type: "select", label: "How long is a typical first visit (estimate or inspection)?", options: [
          { value: "30", label: "30 minutes" },
          { value: "60", label: "1 hour" },
          { value: "90", label: "1½ hours" },
          { value: "120", label: "2 hours" },
        ] },
        { id: "leadTime", type: "select", label: "How soon can a new visit be booked?", options: [
          { value: "sameDay", label: "The same day" },
          { value: "nextDay", label: "The next business day" },
          { value: "twoDays", label: "Two or more business days out" },
        ] },
        { id: "bookingNotes", type: "textarea", label: "Anything the receptionist should always ask, or never promise?", max: 800 },
      ],
    },
  ],
  dataUse: [
    "We use these details to set up your account, your documents and what the AI receptionist tells callers.",
    "Only Luxor's account team sees your answers until we apply them to your account.",
    NEVER_SOLD,
  ],
  dataUseLinks: PRIVACY_LINKS,
  submitLabel: "Send details",
  thankYou: "Thank you. We'll update your account and let you know if anything needs a decision.",
};

const DOCUMENTS: OnboardingFormDefinition = {
  id: "documents",
  title: "Documents and workflow",
  summary: "Who prepares, approves and signs each document, and how a job flows today.",
  minutes: 5,
  intro: "Tell us how your paperwork and jobs flow today, so the app follows the way you already work.",
  sections: [
    {
      id: "who",
      title: "Who handles each document",
      fields: [
        { id: "prepares", type: "matrix", label: "Who prepares it?", rows: DOCUMENT_ROWS, options: WHO },
        { id: "approves", type: "matrix", label: "Who approves it before it goes out?", rows: DOCUMENT_ROWS, options: WHO },
        { id: "signature", type: "checkboxes", label: "Which ones does the customer sign?", options: DOCUMENT_ROWS },
      ],
    },
    {
      id: "flow",
      title: "How a job flows",
      intro: "A few sentences each is plenty. Skip any that don't apply.",
      fields: [
        { id: "firstCall", type: "textarea", label: "From the first call to the first visit", max: 1000 },
        { id: "approval", type: "textarea", label: "From the visit to approved work", max: 1000 },
        { id: "duringJob", type: "textarea", label: "While the work is under way", max: 1000 },
        { id: "finishing", type: "textarea", label: "Finishing up and invoicing", max: 1000 },
        { id: "gettingPaid", type: "textarea", label: "Getting paid", max: 1000 },
      ],
    },
    {
      id: "history",
      title: "Your history",
      fields: [
        { id: "historyYears", type: "select", label: "How many years of past jobs and invoices should we keep?", options: [
          { value: "1", label: "1 year" },
          { value: "2", label: "2 years" },
          { value: "3", label: "3 years" },
          { value: "5", label: "5 years" },
          { value: "all", label: "Everything you have" },
        ] },
      ],
    },
  ],
  dataUse: [
    "We use this to set up your documents and job steps in the app.",
    "Only Luxor's account team can see your answers.",
    NEVER_SOLD,
  ],
  dataUseLinks: PRIVACY_LINKS,
  submitLabel: "Send answers",
  thankYou: "Thank you. We'll match the app to how you work and show you the result.",
};

export const ONBOARDING_FORMS: Record<OnboardingFormId, OnboardingFormDefinition> = {
  texting: TEXTING,
  payments: PAYMENTS,
  team: TEAM,
  company: COMPANY,
  documents: DOCUMENTS,
};
