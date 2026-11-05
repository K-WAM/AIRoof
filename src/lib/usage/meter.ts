// Monthly usage counters per client (owner, 2026-10-04: track usage and estimated AI cost per client). One small doc
// per client per month, bumped with atomic increments where the work happens — so the Usage page reads one doc per
// client instead of scanning every job's notes (Spark plan: reads are the scarce resource). Best effort: a failed
// count must never fail the user's note, so every write swallows its error.
//   businesses/{businessId}/usageMonths/{YYYY-MM}  { voiceNotes, voiceSeconds, typedNotes, notesRead, updatedAt }

import { FieldValue, type Firestore } from "firebase-admin/firestore";

export type UsageCounter = "voiceNotes" | "voiceSeconds" | "typedNotes" | "notesRead";

import { monthKey } from "./month";
export { monthKey };

const COMPANY_ID = /^[a-z0-9-]{2,16}$/;

/** `at` then a non-default company id: that company's copy of the counters is bumped as `byCompany.<id>.<counter>`. */
export async function recordUsage(db: Firestore, businessId: string, counts: Partial<Record<UsageCounter, number>>, at = Date.now(), companyId?: string | null): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: at };
  const perCompany = typeof companyId === "string" && COMPANY_ID.test(companyId) ? companyId : null;
  const byCompany: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      update[key] = FieldValue.increment(value);
      if (perCompany) (byCompany[perCompany] ??= {})[key] = FieldValue.increment(value);
    }
  }
  if (Object.keys(byCompany).length > 0) update.byCompany = byCompany;
  if (Object.keys(update).length === 1) return;
  try {
    await db.collection("businesses").doc(businessId).collection("usageMonths").doc(monthKey(at)).set(update, { merge: true });
  } catch (error) {
    console.warn("usage meter: count not recorded", error instanceof Error ? error.message : error);
  }
}
