// Map a Vapi assistantId or phoneNumberId to the businessId in our Firestore.
// Caches the lookup in-process (warm Lambda) to avoid repeated reads.

import { getAdminFirestore } from "@/lib/firebase/admin";

const assistantCache = new Map<string, string>();
const phoneNumberCache = new Map<string, string>();

export async function findBusinessByVapiAssistantId(
  assistantId: string
): Promise<string | null> {
  if (assistantCache.has(assistantId)) return assistantCache.get(assistantId) ?? null;

  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .collection("businesses")
    .where("vapiAssistantId", "==", assistantId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  assistantCache.set(assistantId, businessId);
  return businessId;
}

export async function findBusinessByVapiPhoneNumberId(
  phoneNumberId: string
): Promise<string | null> {
  if (phoneNumberCache.has(phoneNumberId)) return phoneNumberCache.get(phoneNumberId) ?? null;

  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .collection("businesses")
    .where("vapiPhoneNumberId", "==", phoneNumberId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  phoneNumberCache.set(phoneNumberId, businessId);
  return businessId;
}
