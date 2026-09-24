// Stored inbound-call records for ElevenLabs tool resolution (T-111b).
//
// The conversation-initiation webhook persists
// `elevenlabsConversations/{conversation_id-or-call_sid}` → { businessId,
// callerPhone, calledNumber, createdAt, expiresAt } so the tools and post-call
// routes can resolve the tenant AND the verified caller number WITHOUT trusting
// anything the model sends as a parameter. TTL is short (a call plus tool
// retries), like the other replay collections in this repo.

import { getAdminFirestore } from "@/lib/firebase/admin";

export const ELEVENLABS_CONVERSATIONS_COLLECTION = "elevenlabsConversations";
export const ELEVENLABS_CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface ElevenLabsConversationRecord {
  businessId: string;
  callerPhone?: string;
  calledNumber?: string;
  agentId?: string;
  conversationId?: string;
  callSid?: string;
  createdAt: number;
  expiresAt: number;
}

/** Firestore-safe doc id for a conversation id or call SID. */
export function elevenLabsConversationDocId(id: string): string {
  return encodeURIComponent(id);
}

export async function persistElevenLabsConversation(
  input: Omit<ElevenLabsConversationRecord, "createdAt" | "expiresAt"> & {
    createdAt?: number;
    expiresAt?: number;
  },
  now = Date.now()
): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;

  const key = input.conversationId ?? input.callSid;
  if (!key) return null;

  const docId = elevenLabsConversationDocId(key);
  await db.collection(ELEVENLABS_CONVERSATIONS_COLLECTION).doc(docId).set({
    ...input,
    conversationId: input.conversationId ?? null,
    callSid: input.callSid ?? null,
    createdAt: input.createdAt ?? now,
    expiresAt: input.expiresAt ?? now + ELEVENLABS_CONVERSATION_TTL_MS,
  });
  return docId;
}

export async function getElevenLabsConversation(
  id: string,
  now = Date.now()
): Promise<ElevenLabsConversationRecord | null> {
  const db = getAdminFirestore();
  if (!db) return null;

  try {
    const snap = await db
      .collection(ELEVENLABS_CONVERSATIONS_COLLECTION)
      .doc(elevenLabsConversationDocId(id))
      .get();
    if (!snap.exists) return null;

    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data || typeof data.businessId !== "string" || data.businessId.length === 0) {
      return null;
    }
    const expiresAt = data.expiresAt;
    if (
      typeof expiresAt === "number" &&
      Number.isFinite(expiresAt) &&
      expiresAt <= now
    ) {
      return null;
    }

    return {
      businessId: data.businessId,
      callerPhone: typeof data.callerPhone === "string" ? data.callerPhone : undefined,
      calledNumber: typeof data.calledNumber === "string" ? data.calledNumber : undefined,
      agentId: typeof data.agentId === "string" ? data.agentId : undefined,
      conversationId: typeof data.conversationId === "string" ? data.conversationId : undefined,
      callSid: typeof data.callSid === "string" ? data.callSid : undefined,
      createdAt: typeof data.createdAt === "number" ? data.createdAt : now,
      expiresAt: typeof expiresAt === "number" ? expiresAt : now,
    };
  } catch (error) {
    console.error("getElevenLabsConversation error:", error);
    return null;
  }
}
