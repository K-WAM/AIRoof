// What a client bought (owner, 2026-10-08): "some will buy the AI call and booking, some the field input, some a
// payments feature — I should be able to toggle which customers can use what based on the contract they sign."
//
// The ONE place a product is defined: its name, what it includes, and which API paths belong to it. The server
// refuses those paths when the product is off (verifyRole.ts → enforceProduct); the screens hide them (bootstrap →
// useBusinessModules). Missing = ON: every client that existed before products keeps everything it had.

export type ProductId = "calls" | "field" | "billing";

export interface ProductDef {
  id: ProductId;
  label: string;
  /** The company-screen module this product switches (useBusinessModules). */
  module: "calls" | "jobs" | "billing";
  /** The locked tab's upgrade page: one line on what it does for the client, then what they get. */
  pitch: string;
  gets: string[];
  /** One line for the superadmin toggle: what turning it on gives the client. */
  includes: string;
  /** A product that only makes sense with another one on. */
  requires?: ProductId;
}

export const PRODUCTS: ProductDef[] = [
  {
    id: "calls", module: "calls", label: "AI calls & booking", includes: "The AI phone line, Calls, Pipeline requests and bookings on the Calendar.",
    pitch: "An AI receptionist answers every call, day and night, in English and Spanish — and books the work.",
    gets: ["Every call answered, recorded and summarized", "Bookings straight onto your Calendar", "Urgent calls sent to your phone"],
  },
  {
    id: "field", module: "jobs", label: "Jobs & field input", includes: "Jobs, the Field screen (voice notes, photos, time clock), findings, quotes and reports.",
    pitch: "Your crew talks, the job writes itself — materials, hours, photos and the report.",
    gets: ["Voice notes from the job site, in English or Spanish", "Photos, time clock and findings on every job", "Quotes and reports built from the work"],
  },
  {
    id: "billing", module: "billing", label: "Billing & payments", includes: "Invoices, recording payments, receipts, reminders and the Billing screen.", requires: "field",
    pitch: "Invoices from the finished job in one tap, and you see who still owes you.",
    gets: ["Invoices with your logo and how to pay you", "Receipts and late-payment reminders sent for you", "One screen for what you're owed"],
  },
];

export type ProductSet = Record<ProductId, boolean>;

/** Missing or partial = ON. Only an explicit `false` turns a product off. Billing needs Jobs (invoices belong to jobs). */
export function productsOf(config: { products?: Partial<Record<ProductId, unknown>> } | null | undefined): ProductSet {
  const stored = config?.products ?? {};
  const on = (id: ProductId) => stored[id] !== false;
  const field = on("field");
  return { calls: on("calls"), field, billing: field && on("billing") };
}

// Longest/most specific first: an invoice path under /api/jobs belongs to billing, not field.
const PATH_RULES: Array<{ pattern: RegExp; product: ProductId }> = [
  { pattern: /^\/api\/jobs\/[^/]+\/invoice(\/|$)/, product: "billing" },
  { pattern: /^\/api\/company\/billing(\/|$)/, product: "billing" },
  { pattern: /^\/api\/company\/settings\/billing(\/|$)/, product: "billing" },
  { pattern: /^\/api\/jobs\/from-request(\/|$)/, product: "calls" },
  { pattern: /^\/api\/jobs(\/|$)/, product: "field" },
  { pattern: /^\/api\/timeclock(\/|$)/, product: "field" },
  { pattern: /^\/api\/transcribe(\/|$)/, product: "field" },
  { pattern: /^\/api\/field(\/|$)/, product: "field" },
  { pattern: /^\/api\/calls(\/|$)/, product: "calls" },
  { pattern: /^\/api\/appointments(\/|$)/, product: "calls" },
  { pattern: /^\/api\/businesses\/[^/]+\/(calls|leads|appointments|agent-actions|faq-suggestions)(\/|$)/, product: "calls" },
];

/** Which product an API path belongs to, or null for shared paths (settings, team, customers, library, calendar…). */
export function productForApiPath(pathname: string): ProductId | null {
  for (const rule of PATH_RULES) if (rule.pattern.test(pathname)) return rule.product;
  return null;
}

export function productLabel(id: ProductId): string {
  return PRODUCTS.find((p) => p.id === id)?.label ?? id;
}

const SHORT: Record<ProductId, string> = { calls: "Calls", field: "Jobs", billing: "Billing" };

/** "Calls · Jobs · Billing" — the client list's one-line summary of what a client has, plus what they asked to add. */
export function productSummary(config: Parameters<typeof productsOf>[0] & { upgradeRequests?: Partial<Record<ProductId, unknown>> }): string {
  const on = productsOf(config);
  const names = PRODUCTS.filter((p) => on[p.id]).map((p) => SHORT[p.id]);
  const wants = PRODUCTS.filter((p) => !on[p.id] && config?.upgradeRequests?.[p.id]).map((p) => SHORT[p.id]);
  return (names.length ? names.join(" · ") : "No products") + (wants.length ? ` — wants ${wants.join(", ")}` : "");
}

/** The product behind a company-screen module, or null for modules that come from the industry only. */
export function productForModule(module: string): ProductDef | null {
  return PRODUCTS.find((p) => p.module === module) ?? null;
}
