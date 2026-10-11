// How clients can pay Luxor (owner, 2026-10-10: "LUXOR_ZELLE_TO should be set in the app as a form"). One doc,
// `platform/billing`, written only by the superadmin (api/admin/billing-settings) through the Admin SDK and read by the
// invoice send route and the reminder cron. The LUXOR_ZELLE_TO env var stays as the fallback when nothing is saved.

import type { Firestore } from "firebase-admin/firestore";
import { ZELLE_TO_MAX } from "@/lib/billing/luxorNotices";

export const PAY_SETTINGS_DOC = { collection: "platform", id: "billing" } as const;

export interface LuxorPaySettings { zelleTo: string }

/** "" clears it. Otherwise an email or a 10-digit US phone, plain text, within the cap. */
export function validZelleTo(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "") return true;
  if (v.length > ZELLE_TO_MAX || /[<>\u0000-\u001f]/.test(v)) return false;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const phone = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").length === 10 && /^[\d\s()+.-]+$/.test(v);
  return email || phone;
}

/** The saved Zelle address, or null when none is saved (callers then fall back to the env var). */
export async function loadLuxorZelleTo(db: Firestore): Promise<string | null> {
  const snap = await db.collection(PAY_SETTINGS_DOC.collection).doc(PAY_SETTINGS_DOC.id).get();
  const stored = snap.exists ? (snap.data() as Partial<LuxorPaySettings>).zelleTo : undefined;
  return typeof stored === "string" ? stored : null;
}
