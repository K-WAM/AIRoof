// Shared ended-call writer (T-111b): extracted verbatim from the Vapi webhook's
// end-of-call-report handler as a pure, tested refactor so the ElevenLabs
// post-call webhook writes the SAME `calls` document shape — transcript
// messages, summary, duration, outcome tagging — without duplicating the
// outcome-classification logic. The Vapi route's behavior is unchanged.

import type { Firestore } from "firebase-admin/firestore";
import { classifyCallOutcome } from "@/lib/ai/deepseekClient";
import type { CallMessage } from "@/types";

/** Provider transcript turns (Vapi messages / ElevenLabs transcript entries) before normalization. */
export interface NormalizedProviderTranscriptMessage {
  role: string;
  message?: string;
  content?: string;
  /** Provider timestamp. Vapi: absolute ms (`time`). ElevenLabs: caller passes absolute ms. */
  time?: number;
}

/**
 * Provider transcript → our CallMessage format (moved verbatim from the Vapi
 * route). Vapi sends "bot" (not "assistant") for Alice's turns in the
 * end-of-call report; both map to "agent".
 */
export function normalizeProviderTranscriptMessages(
  messages: NormalizedProviderTranscriptMessage[]
): CallMessage[] {
  return (messages ?? []).map((m, i) => ({
    messageId: `m_${i}`,
    role: m.role === "user" ? "caller" : (m.role === "assistant" || m.role === "bot" || m.role === "agent") ? "agent" : "system",
    text: m.message ?? m.content ?? "",
    timestamp: m.time ?? Date.now(),
  }));
}

export interface EndedCallReportInput {
  businessId: string;
  callId: string;
  callerPhone: string | null;
  /** Already-normalized CallMessage[] (see normalizeProviderTranscriptMessages). */
  messages: CallMessage[];
  summary: string | null;
  endedReason?: string | null;
  recordingUrl?: string | null;
  cost?: number | null;
  /** Provider-specific id field(s) spread onto the call doc (e.g. { vapiCallId } / { elevenLabsConversationId }). */
  providerFields?: Record<string, string>;
  /** Call duration in seconds. Only ElevenLabs reports one; Vapi passes nothing. */
  durationSecs?: number;
}

export async function writeEndedCallReport(
  db: Firestore,
  input: EndedCallReportInput
): Promise<void> {
  const callRef = db
    .collection("businesses")
    .doc(input.businessId)
    .collection("calls")
    .doc(input.callId);

  // Classify outcome — non-blocking for the webhook response, non-fatal on failure.
  let outcome: string | null = null;
  let outcomeReason: string | null = null;
  if (input.messages.length > 1) {
    try {
      const bizSnap = await db.collection("businesses").doc(input.businessId).get();
      const businessName = bizSnap.data()?.businessName ?? input.businessId;
      const classification = await classifyCallOutcome({
        transcript: input.messages.map((m) => ({ role: m.role, text: m.text })),
        businessName,
      });
      outcome = classification.outcome;
      outcomeReason = classification.reason;
    } catch {
      // non-fatal — proceed without outcome
    }
  }

  await callRef.set(
    {
      callId: input.callId,
      businessId: input.businessId,
      callerPhone: input.callerPhone,
      status: "ended",
      endedAt: Date.now(),
      updatedAt: Date.now(),
      ...(input.providerFields ?? {}),
      summary: input.summary,
      endedReason: input.endedReason ?? null,
      recordingUrl: input.recordingUrl ?? null,
      cost: input.cost ?? null,
      messages: input.messages,
      ...(outcome ? { outcome, outcomeReason } : {}),
      ...(input.durationSecs !== undefined ? { durationSecs: input.durationSecs } : {}),
    },
    { merge: true }
  );
}
