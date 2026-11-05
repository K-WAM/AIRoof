// The superadmin Overview (owner, 2026-10-31: "a superadmin dashboard where I can see clients, number of users,
// usage, monthly pricing and invoices"). Pure: the route reads Firestore + Firebase Auth and hands the rows here, so
// every number on the page — monthly revenue, unpaid, margin, "Needs you" — is decided in one tested place.
//
// Money words, in plain English on the page:
//   Monthly revenue = the sum of each paying client's plan price (Client → Plan), paused clients excluded.
//   Collected       = Luxor invoices marked paid this month.
//   Unpaid          = Luxor invoices sent and not yet paid (overdue is a part of it).
//   Margin          = plan price − our estimated cost this month (src/lib/billing/aiCostRates.ts).

import type { EffectiveAccountPurpose } from "@/lib/accounts/purpose";
import { daysOverdue } from "@/lib/billing/luxorNotices";
import { roundCents } from "@/lib/format/money";
import { companiesOf, defaultCompany, effectiveCompanyId } from "@/lib/companies/companies";
import { estimateMonthCost } from "@/lib/billing/aiCostRates";

const DAY = 24 * 60 * 60 * 1000;
/** No sign-in for this long = "nobody is using it" on the Needs-you list. */
export const QUIET_DAYS = 14;
/** "Active users" = signed in within this many days. */
export const ACTIVE_DAYS = 30;

export interface OverviewClientInput {
  businessId: string;
  businessName: string;
  industry: string;
  purpose: EffectiveAccountPurpose;
  paused: boolean;
  planName: string | null;
  monthlyAmount: number | null;
  autoInvoice: boolean;
  /** Team members (Luxor's own account excluded) and each one's last Firebase sign-in, ms or null = never. */
  members: Array<{ active: boolean; lastSignInAt: number | null }>;
  calls: number;
  phoneMinutes: number;
  notes: number;
  cost: number;
  phoneLineReady: boolean;
  bookingCheckFailed: boolean;
  createdAt: number | null;
  /** Multi-company clients only: the already-computed split (see splitByCompany). */
  companies?: CompanySplitLine[];
}

export interface OverviewInvoiceInput {
  invoiceId: string;
  businessId?: string;
  clientName?: string;
  total?: number;
  status: "draft" | "sent" | "paid";
  dueDate?: string;
  createdAt?: number;
  paidAt?: number;
}

export type BillingState =
  | { kind: "none" }
  | { kind: "paid"; invoiceId: string; at: number | null }
  | { kind: "due"; invoiceId: string; dueDate: string; amount: number }
  | { kind: "overdue"; invoiceId: string; days: number; amount: number }
  | { kind: "draft"; invoiceId: string; amount: number };

export interface OverviewClientRow {
  businessId: string;
  businessName: string;
  industry: string;
  paused: boolean;
  planName: string | null;
  monthlyAmount: number | null;
  users: number;
  activeUsers: number;
  lastSignInAt: number | null;
  calls: number;
  phoneMinutes: number;
  notes: number;
  cost: number;
  margin: number | null;
  unpaid: number;
  billing: BillingState;
  /** One compact line per company for a multi-company client; absent otherwise. */
  companies?: CompanySplitLine[];
}

export interface CompanySplitLine {
  companyId: string;
  shortName: string;
  isDefault: boolean;
  calls: number;
  /** ElevenLabs + Vapi phone minutes, rounded. */
  phoneMinutes: number;
  /** Voice + typed field notes. */
  notes: number;
  jobs: number;
  invoiced: number;
  collected: number;
  /** Estimated AI/phone cost for this company's slice (src/lib/billing/aiCostRates.ts). */
  cost: number;
}

export interface CompanyUsageSlice {
  calls?: number;
  phoneMinutes?: number;
  vapiMinutes?: number;
  voiceNotes?: number;
  voiceNoteMinutes?: number;
  typedNotes?: number;
  notesRead?: number;
}

export interface CompanySplitInput {
  business: { billingCompanies?: unknown } | null | undefined;
  /** Whole-client totals; anything not explicitly attributed goes to the default company. */
  totals: { calls: number; notes: number; phoneMinutes: number; vapiMinutes: number; voiceNoteMinutes: number; notesRead: number };
  /** Known non-default companies only (src/lib/usage/businessMonthUsage.ts). */
  byCompany?: Record<string, CompanyUsageSlice>;
  jobs: Array<{ companyId?: unknown }>;
  invoices: Array<{ companyId?: unknown; total: number; collected: number }>;
}

const splitField = (slice: CompanyUsageSlice | undefined, key: keyof CompanyUsageSlice) => {
  if (!slice) return 0;
  const value = slice[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

/**
 * One client's month split by company (T-317). Calls, minutes and notes with a known non-default company are theirs;
 * every other call/minute/note (unattributed or default) is the default company's. Jobs and invoices follow
 * Job.companyId and invoice.companyId ?? job.companyId. Returns [] for a single-/no-company business, so no caller
 * shows or stores anything new.
 */
export function splitByCompany(input: CompanySplitInput): CompanySplitLine[] {
  const companies = companiesOf(input.business);
  if (companies.length < 2) return [];
  const fallback = defaultCompany(input.business)!;
  const nonDefault = companies.filter((c) => c.id !== fallback.id);
  const slices = nonDefault.map((c) => ({ id: c.id, slice: input.byCompany?.[c.id] }));
  const notesOf = (slice: CompanyUsageSlice | undefined) => splitField(slice, "voiceNotes") + splitField(slice, "typedNotes");
  const attributed = slices.reduce((sum, { slice }) => ({
    calls: sum.calls + splitField(slice, "calls"),
    notes: sum.notes + notesOf(slice),
    phoneMinutes: sum.phoneMinutes + splitField(slice, "phoneMinutes"),
    vapiMinutes: sum.vapiMinutes + splitField(slice, "vapiMinutes"),
    voiceNoteMinutes: sum.voiceNoteMinutes + splitField(slice, "voiceNoteMinutes"),
    notesRead: sum.notesRead + splitField(slice, "notesRead"),
  }), { calls: 0, notes: 0, phoneMinutes: 0, vapiMinutes: 0, voiceNoteMinutes: 0, notesRead: 0 });
  const residual = (key: keyof typeof attributed) => Math.max(0, input.totals[key] - attributed[key]);

  const jobs = new Map<string, number>();
  for (const job of input.jobs) {
    const id = effectiveCompanyId(input.business, job.companyId) ?? fallback.id;
    jobs.set(id, (jobs.get(id) ?? 0) + 1);
  }
  const money = new Map<string, { invoiced: number; collected: number }>();
  for (const invoice of input.invoices) {
    const id = effectiveCompanyId(input.business, invoice.companyId) ?? fallback.id;
    const row = money.get(id) ?? { invoiced: 0, collected: 0 };
    row.invoiced += invoice.total;
    row.collected += invoice.collected;
    money.set(id, row);
  }

  return companies.map((company) => {
    const isDefault = company.id === fallback.id;
    const slice = input.byCompany?.[company.id];
    const calls = isDefault ? residual("calls") : splitField(slice, "calls");
    const phoneMinutes = isDefault ? residual("phoneMinutes") : splitField(slice, "phoneMinutes");
    const vapiMinutes = isDefault ? residual("vapiMinutes") : splitField(slice, "vapiMinutes");
    const voiceNoteMinutes = isDefault ? residual("voiceNoteMinutes") : splitField(slice, "voiceNoteMinutes");
    const notesRead = isDefault ? residual("notesRead") : splitField(slice, "notesRead");
    const notes = isDefault ? residual("notes") : notesOf(slice);
    const cost = estimateMonthCost({ calls, phoneMinutes, vapiMinutes, voiceNoteMinutes, notesRead });
    const cash = money.get(company.id) ?? { invoiced: 0, collected: 0 };
    return {
      companyId: company.id,
      shortName: company.shortName,
      isDefault,
      calls,
      phoneMinutes: Math.round(phoneMinutes + vapiMinutes),
      notes: Math.round(notes),
      jobs: jobs.get(company.id) ?? 0,
      invoiced: roundCents(cash.invoiced),
      collected: roundCents(cash.collected),
      cost: roundCents(cost.total),
    };
  });
}

export interface AttentionItem {
  tone: "urgent" | "warn";
  text: string;
  href: string;
  businessId?: string;
}

export interface OverviewSummary {
  month: string;
  metrics: {
    monthlyRevenue: number;
    payingClients: number;
    clients: number;
    pausedClients: number;
    collectedThisMonth: number;
    unpaid: number;
    overdue: number;
    overdueCount: number;
    costThisMonth: number;
    margin: number;
    users: number;
    activeUsers: number;
    demoCost: number;
  };
  clients: OverviewClientRow[];
  attention: AttentionItem[];
}

const isClient = (p: EffectiveAccountPurpose) => p === "client" || p === "unclassified";
const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
const configHref = (id: string) => `/admin/businesses/${id}/config`;
/** Opens one invoice on the Invoices page (?invoice=); ?businessId= starts a new one for that client. */
export const invoiceHref = (invoiceId: string) => `/admin/invoices?invoice=${encodeURIComponent(invoiceId)}`;
export const newInvoiceHref = (businessId: string) => `/admin/invoices?businessId=${encodeURIComponent(businessId)}`;

/**
 * One client's billing line: an overdue invoice wins (the worst one), then one sent and due, then a draft waiting to
 * be sent, then the latest paid one. Unpaid = everything sent and not paid.
 */
export function billingStateFor(invoices: OverviewInvoiceInput[], now = Date.now()): { billing: BillingState; unpaid: number } {
  const sent = invoices.filter((i) => i.status === "sent");
  const unpaid = roundCents(sent.reduce((s, i) => s + money(i.total), 0));
  const overdue = sent
    .map((i) => ({ i, days: daysOverdue({ status: i.status, dueDate: i.dueDate ?? "" }, now) }))
    .filter((x) => x.days > 0)
    .sort((a, b) => b.days - a.days)[0];
  if (overdue) return { billing: { kind: "overdue", invoiceId: overdue.i.invoiceId, days: overdue.days, amount: money(overdue.i.total) }, unpaid };
  const due = [...sent].sort((a, b) => String(a.dueDate ?? "").localeCompare(String(b.dueDate ?? "")))[0];
  if (due) return { billing: { kind: "due", invoiceId: due.invoiceId, dueDate: due.dueDate ?? "", amount: money(due.total) }, unpaid };
  const draft = invoices.filter((i) => i.status === "draft").sort((a, b) => money(b.createdAt) - money(a.createdAt))[0];
  if (draft) return { billing: { kind: "draft", invoiceId: draft.invoiceId, amount: money(draft.total) }, unpaid };
  const paid = invoices.filter((i) => i.status === "paid").sort((a, b) => money(b.paidAt ?? b.createdAt) - money(a.paidAt ?? a.createdAt))[0];
  if (paid) return { billing: { kind: "paid", invoiceId: paid.invoiceId, at: paid.paidAt ?? null }, unpaid };
  return { billing: { kind: "none" }, unpaid };
}

export function buildOverview(
  businesses: OverviewClientInput[],
  invoices: OverviewInvoiceInput[],
  month: string,
  range: { from: number; to: number },
  now = Date.now(),
  /** False when Firebase Auth couldn't be read: no "nobody has signed in" warnings from missing data. */
  signInsKnown = true,
): OverviewSummary {
  const byBusiness = new Map<string, OverviewInvoiceInput[]>();
  for (const inv of invoices) {
    if (!inv.businessId) continue;
    byBusiness.set(inv.businessId, [...(byBusiness.get(inv.businessId) ?? []), inv]);
  }

  const clients: OverviewClientRow[] = [];
  const attention: AttentionItem[] = [];
  let demoCost = 0;

  for (const b of businesses) {
    if (b.purpose === "archived") continue;
    if (!isClient(b.purpose)) {
      demoCost += b.cost;
      continue;
    }
    const people = b.members.filter((m) => m.active);
    const signIns = people.map((m) => m.lastSignInAt).filter((t): t is number => typeof t === "number");
    const lastSignInAt = signIns.length ? Math.max(...signIns) : null;
    const activeUsers = signIns.filter((t) => now - t <= ACTIVE_DAYS * DAY).length;
    const price = typeof b.monthlyAmount === "number" && b.monthlyAmount > 0 ? b.monthlyAmount : null;
    const { billing, unpaid } = billingStateFor(byBusiness.get(b.businessId) ?? [], now);

    clients.push({
      businessId: b.businessId,
      businessName: b.businessName,
      industry: b.industry,
      paused: b.paused,
      planName: b.planName,
      monthlyAmount: price,
      users: people.length,
      activeUsers,
      lastSignInAt,
      calls: b.calls,
      phoneMinutes: b.phoneMinutes,
      notes: b.notes,
      cost: b.cost,
      margin: price === null ? null : roundCents(price - b.cost),
      unpaid,
      billing,
      ...(b.companies && b.companies.length > 0 ? { companies: b.companies } : {}),
    });

    // "Needs you": money first, then a client the product isn't working for.
    const name = b.businessName;
    if (billing.kind === "overdue") {
      attention.push({ tone: "urgent", businessId: b.businessId, href: invoiceHref(billing.invoiceId), text: `${name}: invoice ${billing.invoiceId} is ${billing.days} day${billing.days === 1 ? "" : "s"} overdue` });
    } else if (billing.kind === "draft") {
      attention.push({ tone: "warn", businessId: b.businessId, href: invoiceHref(billing.invoiceId), text: `${name}: invoice ${billing.invoiceId} is a draft — check it and send it` });
    }
    if (b.paused) continue;
    if (price === null && b.purpose === "client") {
      attention.push({ tone: "warn", businessId: b.businessId, href: configHref(b.businessId), text: `${name} has no monthly price — set it under Plan` });
    }
    if (!b.phoneLineReady) {
      attention.push({ tone: "urgent", businessId: b.businessId, href: configHref(b.businessId), text: `${name} has no working phone line` });
    } else if (b.bookingCheckFailed) {
      attention.push({ tone: "urgent", businessId: b.businessId, href: configHref(b.businessId), text: `${name}: today's booking check failed` });
    }
    const ageDays = b.createdAt ? (now - b.createdAt) / DAY : Infinity;
    if (signInsKnown && people.length > 0 && ageDays > QUIET_DAYS) {
      if (lastSignInAt === null) {
        attention.push({ tone: "warn", businessId: b.businessId, href: configHref(b.businessId), text: `Nobody at ${name} has signed in yet` });
      } else if (now - lastSignInAt > QUIET_DAYS * DAY) {
        attention.push({ tone: "warn", businessId: b.businessId, href: configHref(b.businessId), text: `Nobody at ${name} has signed in for ${Math.floor((now - lastSignInAt) / DAY)} days` });
      }
    }
  }

  // Invoices not tied to a client account still count toward money owed.
  const sent = invoices.filter((i) => i.status === "sent");
  const overdueInvoices = sent.filter((i) => daysOverdue({ status: i.status, dueDate: i.dueDate ?? "" }, now) > 0);
  for (const inv of overdueInvoices) {
    if (inv.businessId) continue;
    const days = daysOverdue({ status: inv.status, dueDate: inv.dueDate ?? "" }, now);
    attention.push({ tone: "urgent", href: invoiceHref(inv.invoiceId), text: `${inv.clientName || "A client"}: invoice ${inv.invoiceId} is ${days} day${days === 1 ? "" : "s"} overdue` });
  }

  const live = clients.filter((c) => !c.paused);
  const monthlyRevenue = roundCents(live.reduce((s, c) => s + (c.monthlyAmount ?? 0), 0));
  const costThisMonth = roundCents(clients.reduce((s, c) => s + c.cost, 0));

  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "urgent" ? -1 : 1));
  clients.sort((a, b) => (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0) || a.businessName.localeCompare(b.businessName, undefined, { sensitivity: "base" }));

  return {
    month,
    metrics: {
      monthlyRevenue,
      payingClients: live.filter((c) => c.monthlyAmount !== null).length,
      clients: clients.length,
      pausedClients: clients.length - live.length,
      collectedThisMonth: roundCents(invoices
        .filter((i) => i.status === "paid" && typeof i.paidAt === "number" && i.paidAt >= range.from && i.paidAt < range.to)
        .reduce((s, i) => s + money(i.total), 0)),
      unpaid: roundCents(sent.reduce((s, i) => s + money(i.total), 0)),
      overdue: roundCents(overdueInvoices.reduce((s, i) => s + money(i.total), 0)),
      overdueCount: overdueInvoices.length,
      costThisMonth,
      margin: roundCents(monthlyRevenue - costThisMonth),
      users: clients.reduce((s, c) => s + c.users, 0),
      activeUsers: clients.reduce((s, c) => s + c.activeUsers, 0),
      demoCost: roundCents(demoCost),
    },
    clients,
    attention,
  };
}

/** "Today", "Yesterday", "5 days ago", "Never" — for the Last sign-in column. */
export function sinceLabel(at: number | null, now = Date.now()): string {
  if (at === null) return "Never";
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
