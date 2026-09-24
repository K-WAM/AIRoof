// TEMPORARY SHIM (T-111b) — swap these imports for the T-111a exports when that
// branch merges. T-111a (Codex) adds `findBusinessByElevenLabsPhoneNumber` and
// `findBusinessByElevenLabsAgentId` to src/lib/vapi/businessLookup.ts with these
// exact names/signatures; until then this file provides identical behavior so
// the merge is a one-line import change.
//
// Maps an ElevenLabs agent id or an imported phone number to the businessId in
// our Firestore, with the same in-process caching as the Vapi lookups
// (src/lib/vapi/businessLookup.ts).

import { getAdminFirestore } from "@/lib/firebase/admin";

const agentCache = new Map<string, string>();
const phoneNumberCache = new Map<string, string>();

export async function findBusinessByElevenLabsAgentId(
  agentId: string
): Promise<string | null> {
  if (agentCache.has(agentId)) return agentCache.get(agentId) ?? null;

  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .collection("businesses")
    .where("elevenlabs.agentId", "==", agentId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  agentCache.set(agentId, businessId);
  return businessId;
}

export async function findBusinessByElevenLabsPhoneNumber(
  phoneNumber: string
): Promise<string | null> {
  if (phoneNumberCache.has(phoneNumber)) return phoneNumberCache.get(phoneNumber) ?? null;

  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .collection("businesses")
    .where("elevenlabs.phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  phoneNumberCache.set(phoneNumber, businessId);
  return businessId;
}

// Exported only for tests — lets a suite start from a clean cache state.
export function _resetElevenLabsLookupCaches(): void {
  agentCache.clear();
  phoneNumberCache.clear();
}
