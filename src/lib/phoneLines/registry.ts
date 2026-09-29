import type { Firestore } from "firebase-admin/firestore";
import type { BusinessPhoneNumber } from "@/types";
import type { LineCountry, LineStatus, PhoneLineView, SmsPurpose } from "@/types/phoneLine";
import { isDemoTenant } from "@/lib/accounts/purpose";

// Phone-line registry helpers (Phase 32, T-171 — contract C-B). The registry lives on `businessPhoneNumbers` and never
// routes calls by itself; these helpers normalise numbers, detect every way a number could already be taken, and shape
// a registry doc into the PhoneLineView the admin/company screens read.

const E164 = /^\+[1-9]\d{7,14}$/;

/** "(689) 204-2643" / "16892042643" / "+1 689 204 2643" → "+16892042643"; anything else → null. */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  let candidate: string;
  if (trimmed.startsWith("+")) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) candidate = `+${digits}`;
  else return null;
  if (!E164.test(candidate)) return null;
  // North American numbers must be exactly +1 and 10 more digits, with a real area code.
  if (candidate.startsWith("+1") && (candidate.length !== 12 || /^[01]/.test(candidate.slice(2)))) return null;
  return candidate;
}

export function formatLineDisplay(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}

// Canadian NANP area codes (CRTC list). Only a default for display/registry creation — an operator can set country.
const CANADIAN_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368", "382", "387", "403",
  "416", "418", "428", "431", "437", "438", "450", "460", "468", "474", "506", "514", "519", "548", "579", "581", "584",
  "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825",
  "867", "873", "879", "902", "905", "942",
]);

export function countryOf(e164: string): LineCountry | null {
  const match = /^\+1(\d{3})\d{7}$/.exec(e164);
  if (!match) return null;
  return CANADIAN_AREA_CODES.has(match[1]) ? "CA" : "US";
}

export type LineConflictKind = "other_tenant_line" | "other_tenant_registry" | "demo_reserved" | "client_line_on_demo";

export interface LineConflict {
  kind: LineConflictKind;
  businessId: string;
}

export const LINE_CONFLICT_MESSAGE: Record<LineConflictKind, string> = {
  other_tenant_line: "This number already answers calls for another business.",
  other_tenant_registry: "This number is already on record for another business.",
  demo_reserved: "This is a shared demo line. It can never be a client's number.",
  client_line_on_demo: "This number belongs to a client. It can't be added to the shared demo.",
};

/**
 * Every way `e164` could already be taken, from the point of view of assigning it to `businessId`:
 * another tenant's primary/extra ElevenLabs number, another tenant's registry line (anything but retired), a line of a
 * demo tenant being given to a client, or a client's line being given to a demo tenant. An empty array means free.
 */
export async function findLineConflicts(db: Firestore, e164: string, businessId: string): Promise<LineConflict[]> {
  const [primary, extra, registry, target] = await Promise.all([
    db.collection("businesses").where("elevenlabs.phoneNumber", "==", e164).limit(5).get(),
    db.collection("businesses").where("elevenlabs.extraPhoneNumbers", "array-contains", e164).limit(5).get(),
    db.collection("businessPhoneNumbers").where("normalizedPhoneNumber", "==", e164).limit(10).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);
  const targetIsDemo = isDemoTenant(businessId, target.data());
  const conflicts: LineConflict[] = [];
  const add = (conflict: LineConflict) => {
    if (!conflicts.some((c) => c.kind === conflict.kind && c.businessId === conflict.businessId)) conflicts.push(conflict);
  };

  for (const doc of [...primary.docs, ...extra.docs]) {
    if (doc.id === businessId) continue;
    const ownerIsDemo = isDemoTenant(doc.id, doc.data());
    if (ownerIsDemo && !targetIsDemo) add({ kind: "demo_reserved", businessId: doc.id });
    else add({ kind: "other_tenant_line", businessId: doc.id });
  }
  for (const doc of registry.docs) {
    const line = doc.data() as Partial<BusinessPhoneNumber>;
    if (line.status === "retired") continue;
    const ownerId = typeof line.businessId === "string" ? line.businessId : "";
    if (line.purpose === "demo" && !targetIsDemo) add({ kind: "demo_reserved", businessId: ownerId });
    else if (line.purpose === "client" && targetIsDemo) add({ kind: "client_line_on_demo", businessId: ownerId });
    else if (ownerId && ownerId !== businessId) add({ kind: "other_tenant_registry", businessId: ownerId });
  }
  return conflicts;
}

const NEXT_STEP: Record<LineStatus, string> = {
  draft: "Luxor connects this line",
  provisioned: "Luxor connects this line to the AI",
  connected: "Waiting for a test call",
  test_passed: "Ready to go live",
  live: "Answering calls",
  retired: "No longer in use",
};

const DEFAULT_SMS_PURPOSES: SmsPurpose[] = ["booking_received", "appointment_confirmed", "inspector_assigned"];

/** A registry doc (old or new shape) → the view the screens read. `includeProvider` is false for company users. */
export function toPhoneLineView(id: string, line: Partial<BusinessPhoneNumber>, includeProvider: boolean): PhoneLineView | null {
  const e164 = toE164(line.normalizedPhoneNumber ?? line.phoneNumber);
  if (!e164 || typeof line.businessId !== "string") return null;
  const status: LineStatus = line.status ?? "draft";
  return {
    lineId: id,
    businessId: line.businessId,
    e164,
    display: formatLineDisplay(e164),
    country: line.country ?? countryOf(e164) ?? "US",
    label: line.label ?? "Main line",
    purpose: line.purpose ?? "client",
    ...(includeProvider && line.provider ? { provider: line.provider } : {}),
    ...(line.acquisition ? { acquisition: line.acquisition } : {}),
    status,
    ...(typeof line.lastTestAt === "number" ? { lastTestAt: line.lastTestAt } : {}),
    sms: {
      status: line.sms?.status ?? "not_configured",
      purposes: line.sms?.purposes ?? DEFAULT_SMS_PURPOSES,
      isDefaultSender: line.sms?.isDefaultSender === true,
    },
    nextStep: NEXT_STEP[status],
  };
}
