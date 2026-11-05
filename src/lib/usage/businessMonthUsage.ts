// One client's calls, phone minutes, field notes and estimated cost to us for one month — the ONE calculation behind
// both the Usage page (/api/admin/usage) and the Overview (/api/admin/overview), so the two can never disagree.
// Reads: the month's calls (only the fields needed, capped at MAX_CALLS so a busy month can't eat the Spark read
// quota) and one usage-meter doc (src/lib/usage/meter.ts). Rates: src/lib/billing/aiCostRates.ts.

import type { Firestore } from "firebase-admin/firestore";
import { estimateMonthCost } from "@/lib/billing/aiCostRates";

export const MAX_CALLS = 3000;
const MAX_COMPANY_JOBS = 2000;
const MAX_COMPANY_INVOICES = 1000;

export interface MonthUsage {
  calls: number;
  callsCapped: boolean;
  phoneMinutes: number;
  voiceNotes: number;
  voiceNoteMinutes: number;
  typedNotes: number;
  /** Per-company counters for known non-default companies (T-317). Missing = single-company or no attributed work. */
  byCompany?: Record<string, CompanyMonthUsage>;
}

/** One company's unrounded slice of a client's month. The default company gets the residual. */
export interface CompanyMonthUsage {
  calls: number;
  /** ElevenLabs phone minutes. */
  phoneMinutes: number;
  /** Older Vapi phone minutes. */
  vapiMinutes: number;
  voiceNotes: number;
  voiceNoteMinutes: number;
  typedNotes: number;
  notesRead: number;
}

/** The exact totals behind the rounded display fields — the basis for splitting cost per company. */
export interface MonthCostBasis {
  calls: number;
  phoneMinutes: number;
  vapiMinutes: number;
  voiceNoteMinutes: number;
  notesRead: number;
}

export interface MonthCost {
  phone: number;
  ai: number;
  total: number;
}

/** This month's jobs and app invoices, attributed only as far as `invoice.companyId ?? job.companyId`. */
export interface CompanyActivity {
  jobs: Array<{ companyId?: string }>;
  invoices: Array<{ companyId?: string; total: number; collected: number }>;
}

/** "2026-10" → that month's UTC start/end in ms; null for anything else. */
export function monthRange(key: string): { from: number; to: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { from: Date.UTC(year, month, 1), to: Date.UTC(year, month + 1, 1) };
}

export async function readBusinessMonthUsage(
  db: Firestore,
  businessId: string,
  month: string,
  range: { from: number; to: number },
): Promise<{ usage: MonthUsage; cost: MonthCost; costBasis: MonthCostBasis }> {
  const [callsSnap, meterSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/calls`)
      .where("startedAt", ">=", range.from).where("startedAt", "<", range.to)
      .select("durationSecs", "startedAt", "endedAt", "elevenLabsConversationId", "companyId")
      .limit(MAX_CALLS).get(),
    db.collection(`businesses/${businessId}/usageMonths`).doc(month).get(),
  ]);

  let elevenSeconds = 0;
  let vapiSeconds = 0;
  const byCompany: Record<string, CompanyMonthUsage> = {};
  for (const doc of callsSnap.docs) {
    const c = doc.data();
    const seconds = typeof c.durationSecs === "number"
      ? c.durationSecs
      : typeof c.endedAt === "number" && typeof c.startedAt === "number" && c.endedAt > c.startedAt
        ? (c.endedAt - c.startedAt) / 1000
        : 0;
    if (c.elevenLabsConversationId) elevenSeconds += seconds;
    else vapiSeconds += seconds;
    if (typeof c.companyId === "string") {
      const slice = byCompany[c.companyId] ?? emptyCompanyUsage();
      slice.calls += 1;
      if (c.elevenLabsConversationId) slice.phoneMinutes += seconds / 60;
      else slice.vapiMinutes += seconds / 60;
      byCompany[c.companyId] = slice;
    }
  }
  const meter = meterSnap.exists ? meterSnap.data() ?? {} : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  // Field notes already recorded per company by the meter (non-default jobs only).
  const meterByCompany = meter.byCompany && typeof meter.byCompany === "object" ? meter.byCompany as Record<string, Record<string, unknown>> : {};
  for (const [id, counters] of Object.entries(meterByCompany)) {
    if (!/^[a-z0-9-]{2,16}$/.test(id) || !counters || typeof counters !== "object") continue;
    const slice = byCompany[id] ?? emptyCompanyUsage();
    slice.voiceNotes = num(counters.voiceNotes);
    slice.voiceNoteMinutes = num(counters.voiceSeconds) / 60;
    slice.typedNotes = num(counters.typedNotes);
    slice.notesRead = num(counters.notesRead);
    byCompany[id] = slice;
  }
  const costBasis: MonthCostBasis = {
    calls: callsSnap.size,
    phoneMinutes: elevenSeconds / 60,
    vapiMinutes: vapiSeconds / 60,
    voiceNoteMinutes: num(meter.voiceSeconds) / 60,
    notesRead: num(meter.notesRead),
  };
  const cost = estimateMonthCost({
    phoneMinutes: costBasis.phoneMinutes,
    vapiMinutes: costBasis.vapiMinutes,
    voiceNoteMinutes: costBasis.voiceNoteMinutes,
    notesRead: costBasis.notesRead,
    calls: costBasis.calls,
  });

  return {
    usage: {
      calls: callsSnap.size,
      callsCapped: callsSnap.size >= MAX_CALLS,
      phoneMinutes: Math.round((elevenSeconds + vapiSeconds) / 60),
      voiceNotes: num(meter.voiceNotes),
      voiceNoteMinutes: Math.round(num(meter.voiceSeconds) / 6) / 10,
      typedNotes: num(meter.typedNotes),
      ...(Object.keys(byCompany).length > 0 ? { byCompany } : {}),
    },
    cost: { phone: round2(cost.phone), ai: round2(cost.ai), total: round2(cost.total) },
    costBasis,
  };
}

function emptyCompanyUsage(): CompanyMonthUsage {
  return { calls: 0, phoneMinutes: 0, vapiMinutes: 0, voiceNotes: 0, voiceNoteMinutes: 0, typedNotes: 0, notesRead: 0 };
}

/**
 * This month's jobs and app invoices for a multi-company client (T-317). Invoices fall back to their job's company;
 * everything else is left unattributed so the caller can give it to the default company. Bounded, single-field ranges
 * (createdAt), and only called for 2+ company clients.
 */
export async function readBusinessCompanyActivity(
  db: Firestore,
  businessId: string,
  range: { from: number; to: number },
): Promise<CompanyActivity> {
  const business = db.collection("businesses").doc(businessId);
  const invoiceFields = ["companyId", "jobId", "total", "status", "amountPaid", "payments", "paidAt"] as const;
  const [jobsSnap, invoicesSnap, updatedInvoicesSnap] = await Promise.all([
    business.collection("jobs").where("createdAt", ">=", range.from).where("createdAt", "<", range.to)
      .select("companyId").limit(MAX_COMPANY_JOBS).get(),
    business.collection("invoices").where("createdAt", ">=", range.from).where("createdAt", "<", range.to)
      .select(...invoiceFields).limit(MAX_COMPANY_INVOICES).get(),
    // Collected money is a payment, not an invoice: an invoice created in an earlier month can be paid this month.
    // Bounded to invoices touched since the month started, then each payment is filtered by its own receivedAt.
    business.collection("invoices").where("updatedAt", ">=", range.from)
      .select(...invoiceFields).limit(MAX_COMPANY_INVOICES).get(),
  ]);

  const jobs = jobsSnap.docs.map((doc) => {
    const companyId = doc.data().companyId;
    return typeof companyId === "string" ? { companyId } : {};
  });

  // One row per invoice. `total` only ever comes from an invoice created this month; `collected` only from payments
  // whose receivedAt is in this month, whichever month the invoice was created in.
  const invoiceRows = new Map<string, { data: Record<string, unknown>; created: boolean }>();
  for (const doc of invoicesSnap.docs) invoiceRows.set(doc.id, { data: doc.data() as Record<string, unknown>, created: true });
  for (const doc of updatedInvoicesSnap.docs) {
    if (!invoiceRows.has(doc.id)) invoiceRows.set(doc.id, { data: doc.data() as Record<string, unknown>, created: false });
  }
  const rows = [...invoiceRows.entries()].filter(([, row]) => row.data.status === "sent" || row.data.status === "paid");

  const missingJobIds = [...new Set(rows
    .filter(([, row]) => typeof row.data.companyId !== "string" && typeof row.data.jobId === "string")
    .map(([, row]) => row.data.jobId as string))];
  const jobCompany: Record<string, string> = {};
  for (let i = 0; i < missingJobIds.length; i += 100) {
    const snaps = await db.getAll(...missingJobIds.slice(i, i + 100).map((jobId) => business.collection("jobs").doc(jobId)));
    for (const job of snaps) {
      const companyId = job.data()?.companyId;
      if (typeof companyId === "string") jobCompany[job.id] = companyId;
    }
  }

  const invoices = rows.flatMap(([, { data: inv, created }]) => {
    const payments = Array.isArray(inv.payments) ? inv.payments as Array<{ receivedAt?: unknown; amount?: unknown }> : [];
    let collected = payments
      .filter((p) => typeof p.receivedAt === "number" && p.receivedAt >= range.from && p.receivedAt < range.to)
      .reduce((sum, p) => sum + (typeof p.amount === "number" && Number.isFinite(p.amount) ? p.amount : 0), 0);
    if (collected === 0 && inv.status === "paid" && typeof inv.paidAt === "number" && inv.paidAt >= range.from && inv.paidAt < range.to) {
      collected = typeof inv.amountPaid === "number" ? inv.amountPaid : typeof inv.total === "number" ? inv.total : 0;
    }
    // An older invoice contributes only money received this month, never its total.
    if (!created && collected === 0) return [];
    const companyId = typeof inv.companyId === "string" ? inv.companyId : typeof inv.jobId === "string" ? jobCompany[inv.jobId] : undefined;
    return [{
      ...(companyId ? { companyId } : {}),
      total: created && typeof inv.total === "number" && Number.isFinite(inv.total) ? inv.total : 0,
      collected,
    }];
  });

  return { jobs, invoices };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
