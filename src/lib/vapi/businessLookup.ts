// Map a Vapi assistantId or phoneNumberId to the businessId in our Firestore.
// Caches the lookup in-process (warm Lambda) to avoid repeated reads.

import { getAdminFirestore } from "@/lib/firebase/admin";

// T-171: entries expire after a minute. They used to live for the whole life of a warm instance, so moving a number to
// a new client (go-live) or rolling it back (retire) kept routing calls to the OLD tenant on warm servers.
const ROUTING_CACHE_TTL_MS = 60_000;

class ExpiringCache {
  private readonly entries = new Map<string, { value: string; exp: number }>();
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.exp <= Date.now()) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }
  get(key: string): string | undefined {
    return this.has(key) ? this.entries.get(key)?.value : undefined;
  }
  set(key: string, value: string): void {
    if (this.entries.size >= 500) this.entries.clear();
    this.entries.set(key, { value, exp: Date.now() + ROUTING_CACHE_TTL_MS });
  }
}

const assistantCache = new ExpiringCache();
const phoneNumberCache = new ExpiringCache();
const elevenLabsAgentCache = new ExpiringCache();
const elevenLabsPhoneCache = new ExpiringCache();

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

export async function findBusinessByElevenLabsAgentId(agentId: string): Promise<string | null> {
  if (elevenLabsAgentCache.has(agentId)) return elevenLabsAgentCache.get(agentId) ?? null;
  const db = getAdminFirestore();
  if (!db) return null;
  const snap = await db.collection("businesses").where("elevenlabs.agentId", "==", agentId).limit(1).get();
  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  elevenLabsAgentCache.set(agentId, businessId);
  return businessId;
}

export async function findBusinessByElevenLabsPhoneNumber(phoneNumber: string): Promise<string | null> {
  if (elevenLabsPhoneCache.has(phoneNumber)) return elevenLabsPhoneCache.get(phoneNumber) ?? null;
  const db = getAdminFirestore();
  if (!db) return null;
  const primarySnap = await db.collection("businesses").where("elevenlabs.phoneNumber", "==", phoneNumber).limit(1).get();
  const snap = primarySnap.empty
    ? await db.collection("businesses").where("elevenlabs.extraPhoneNumbers", "array-contains", phoneNumber).limit(1).get()
    : primarySnap;
  if (snap.empty) return null;
  const businessId = snap.docs[0].id;
  elevenLabsPhoneCache.set(phoneNumber, businessId);
  return businessId;
}
