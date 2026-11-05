// Evaluation guard (T-306, Roof Doctors plan D2/§10).
//
// A business that is being evaluated with real data (its real customers imported) must never email anyone the owner
// hasn't approved. When `businesses/{id}.outboundEmailAllowlist` is present, every email sent ON BEHALF OF that business
// goes only to addresses on the list; anything else is skipped and logged — never thrown, so a blocked email can't
// break the screen or the phone call that triggered it. Missing list = normal sending (every other client).
//
// The one choke point is sendEmail() in ./send.ts: its `businessId` option is REQUIRED (string or null), so the
// type checker makes every caller say whose mail it is. `null` = Luxor's own platform mail (alerts, Luxor invoices).

import { getAdminFirestore } from "@/lib/firebase/admin";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; list: string[] | null }>();

function normalizeAddress(raw: string): string {
  // "Name <a@b.com>" or plain "a@b.com"
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/** Pure: is this recipient allowed under this allowlist? `null`/undefined list = no guard. */
export function isRecipientAllowed(allowlist: readonly string[] | null | undefined, to: string): boolean {
  if (!Array.isArray(allowlist)) return true;
  const addr = normalizeAddress(to);
  if (!addr) return false;
  return allowlist.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === addr);
}

/** Pure: read the allowlist off a business document's data; anything malformed counts as "guard ON, nobody allowed". */
export function allowlistFromBusiness(data: Record<string, unknown> | undefined | null): string[] | null {
  if (!data || !("outboundEmailAllowlist" in data) || data.outboundEmailAllowlist === undefined || data.outboundEmailAllowlist === null) {
    return null;
  }
  const raw = data.outboundEmailAllowlist;
  if (!Array.isArray(raw)) return []; // present but malformed: fail closed
  return raw.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/** The business's allowlist (cached 60 s). A failed read fails closed (nobody allowed) unless an answer is cached. */
export async function loadAllowlist(businessId: string): Promise<string[] | null> {
  const hit = cache.get(businessId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const db = getAdminFirestore();
  if (!db) return hit?.list ?? null;
  try {
    const snap = await db.collection("businesses").doc(businessId).get();
    const list = allowlistFromBusiness(snap.data());
    cache.set(businessId, { at: Date.now(), list });
    return list;
  } catch {
    // Fail closed: if we can't tell whether this business is guarded, don't send (the caller reports "not sent").
    // A business already known (cached) keeps its last answer.
    return hit ? hit.list : [];
  }
}

export type GuardDecision = { allowed: true } | { allowed: false; reason: "evaluation_guard" };

export async function checkOutboundEmail(businessId: string | null, to: string): Promise<GuardDecision> {
  if (!businessId) return { allowed: true };
  const list = await loadAllowlist(businessId);
  if (isRecipientAllowed(list, to)) return { allowed: true };
  // Log the business and the domain only — never the full customer address.
  const domain = normalizeAddress(to).split("@")[1] ?? "?";
  console.warn(`[evaluation-guard] skipped email for business ${businessId} to *@${domain} (not on its allowlist)`);
  return { allowed: false, reason: "evaluation_guard" };
}

/** Tests only. */
export function __resetEvaluationGuardCache(): void {
  cache.clear();
}
