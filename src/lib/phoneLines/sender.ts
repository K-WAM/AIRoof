import type { Firestore } from "firebase-admin/firestore";
import type { BusinessPhoneNumber } from "@/types";
import type { SmsPurpose } from "@/types/phoneLine";
import { toE164 } from "@/lib/phoneLines/registry";

// Phase 32 (T-169): which number a text comes from. The rule, in order:
//  1. The record carries the line the caller DIALED → text only from exactly that line of this tenant, and only if its
//     texting is Ready for this purpose. Never another line, another country's line or an env default — a Canadian
//     caller who dialed the US demo line gets a US-line text, and vice versa, whatever their own area code.
//  2. No dialed line (the office booked it, email intake, a staff notice) → this tenant's default sender, if Ready.
//  3. Otherwise → no text, with a reason the ledger records (the caller hears about email/a call instead).
// The old `smsFromNumber` / env TWILIO_PHONE_NUMBER fallback is gone: it is how a "Canadian" test text went out from the
// US number.

export type SenderRefusal = "called_line_unknown" | "called_line_not_ready" | "no_default_sender" | "invalid_called_line";

export type SenderResult = { ok: true; from: string; lineId: string } | { ok: false; reason: SenderRefusal };

function allows(line: Partial<BusinessPhoneNumber>, purpose: SmsPurpose): boolean {
  if (line.status === "retired" || line.sms?.status !== "ready") return false;
  const purposes = line.sms.purposes;
  return !Array.isArray(purposes) || purposes.length === 0 || purposes.includes(purpose);
}

export async function resolveSmsSender(
  db: Firestore,
  opts: { businessId: string; calledNumber?: string | null; purpose: SmsPurpose },
): Promise<SenderResult> {
  const lines = await db.collection("businessPhoneNumbers").where("businessId", "==", opts.businessId).get();
  const tenantLines = lines.docs
    .map((doc) => ({ id: doc.id, line: doc.data() as Partial<BusinessPhoneNumber> }))
    // Belt and braces: the query already scopes to the tenant; a doc naming another tenant is never a sender.
    .filter(({ line }) => line.businessId === opts.businessId);

  if (opts.calledNumber !== undefined && opts.calledNumber !== null && opts.calledNumber !== "") {
    const dialed = toE164(opts.calledNumber);
    if (!dialed) return { ok: false, reason: "invalid_called_line" };
    const match = tenantLines.find(({ line }) => toE164(line.normalizedPhoneNumber ?? line.phoneNumber) === dialed && line.status !== "retired");
    if (!match) return { ok: false, reason: "called_line_unknown" };
    if (!allows(match.line, opts.purpose)) return { ok: false, reason: "called_line_not_ready" };
    return { ok: true, from: dialed, lineId: match.id };
  }

  const fallback = tenantLines.find(({ line }) => line.sms?.isDefaultSender === true && allows(line, opts.purpose));
  const from = fallback ? toE164(fallback.line.normalizedPhoneNumber ?? fallback.line.phoneNumber) : null;
  if (!fallback || !from) return { ok: false, reason: "no_default_sender" };
  return { ok: true, from, lineId: fallback.id };
}
