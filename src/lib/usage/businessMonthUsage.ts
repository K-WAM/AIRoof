// One client's calls, phone minutes, field notes and estimated cost to us for one month — the ONE calculation behind
// both the Usage page (/api/admin/usage) and the Overview (/api/admin/overview), so the two can never disagree.
// Reads: the month's calls (only the fields needed, capped at MAX_CALLS so a busy month can't eat the Spark read
// quota) and one usage-meter doc (src/lib/usage/meter.ts). Rates: src/lib/billing/aiCostRates.ts.

import type { Firestore } from "firebase-admin/firestore";
import { estimateMonthCost } from "@/lib/billing/aiCostRates";

export const MAX_CALLS = 3000;

export interface MonthUsage {
  calls: number;
  callsCapped: boolean;
  phoneMinutes: number;
  voiceNotes: number;
  voiceNoteMinutes: number;
  typedNotes: number;
}

export interface MonthCost {
  phone: number;
  ai: number;
  total: number;
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
): Promise<{ usage: MonthUsage; cost: MonthCost }> {
  const [callsSnap, meterSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/calls`)
      .where("startedAt", ">=", range.from).where("startedAt", "<", range.to)
      .select("durationSecs", "startedAt", "endedAt", "elevenLabsConversationId")
      .limit(MAX_CALLS).get(),
    db.collection(`businesses/${businessId}/usageMonths`).doc(month).get(),
  ]);

  let elevenSeconds = 0;
  let vapiSeconds = 0;
  for (const doc of callsSnap.docs) {
    const c = doc.data();
    const seconds = typeof c.durationSecs === "number"
      ? c.durationSecs
      : typeof c.endedAt === "number" && typeof c.startedAt === "number" && c.endedAt > c.startedAt
        ? (c.endedAt - c.startedAt) / 1000
        : 0;
    if (c.elevenLabsConversationId) elevenSeconds += seconds;
    else vapiSeconds += seconds;
  }
  const meter = meterSnap.exists ? meterSnap.data() ?? {} : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const cost = estimateMonthCost({
    phoneMinutes: elevenSeconds / 60,
    vapiMinutes: vapiSeconds / 60,
    voiceNoteMinutes: num(meter.voiceSeconds) / 60,
    notesRead: num(meter.notesRead),
    calls: callsSnap.size,
  });

  return {
    usage: {
      calls: callsSnap.size,
      callsCapped: callsSnap.size >= MAX_CALLS,
      phoneMinutes: Math.round((elevenSeconds + vapiSeconds) / 60),
      voiceNotes: num(meter.voiceNotes),
      voiceNoteMinutes: Math.round(num(meter.voiceSeconds) / 6) / 10,
      typedNotes: num(meter.typedNotes),
    },
    cost: { phone: round2(cost.phone), ai: round2(cost.ai), total: round2(cost.total) },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
