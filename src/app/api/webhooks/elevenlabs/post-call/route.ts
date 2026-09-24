// ElevenLabs post-call webhook (T-111b).
//
// ElevenLabs POSTs three event types (re-verified 2026-09-24 against
// https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks):
//   - post_call_transcription: full transcript + analysis + metadata
//   - post_call_audio:        base64 MP3 (NOT stored — logged as a follow-up)
//   - call_initiation_failure: failed outbound attempts (recorded, never crashes)
//
// Security, modeled on the Vapi webhook (src/lib/vapi/verify.ts):
//   - HMAC `ElevenLabs-Signature` over the RAW body with ELEVENLABS_WEBHOOK_SECRET
//     (scheme "t=<unix_secs>,v0=<hex hmac-sha256>", the exact format ElevenLabs'
//     own constructEvent verifies), timestamp tolerance, timing-safe compare.
//   - Firestore replay guard keyed by (type, conversation_id, event_timestamp)
//     with a 24h TTL — ElevenLabs retries deliver an identical payload, so an
//     idempotent claim is the correct dedup.
//
// Response discipline: every post-call webhook gets a 2xx as long as it parses
// and verifies — ElevenLabs auto-disables webhooks after 10 consecutive
// failures, and retries only 5xx/429/408. A missing identity field acks rather
// than erroring so we never poison that counter.

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  ELEVENLABS_SIGNATURE_HEADER,
  ELEVENLABS_WEBHOOK_SECRET_ENV,
  claimElevenLabsPostCallEvent,
  verifyElevenLabsPostCallSignature,
} from "@/lib/voice/elevenlabs/webhookAuth";
import { findBusinessByElevenLabsAgentId } from "@/lib/vapi/businessLookup";
import { getElevenLabsConversation } from "@/lib/voice/elevenlabs/conversationRecords";
import {
  normalizeProviderTranscriptMessages,
  writeEndedCallReport,
} from "@/lib/calls/endOfCallWriter";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 300, keyPrefix: "elevenlabs-webhook" });
  if (limited) return limited;

  // Signature verification needs the RAW body — read it before anything else.
  const rawBody = await request.text();
  const signature = request.headers.get(ELEVENLABS_SIGNATURE_HEADER);
  if (
    !verifyElevenLabsPostCallSignature(
      rawBody,
      signature,
      process.env[ELEVENLABS_WEBHOOK_SECRET_ENV]
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const event = asRecord(payload);
  const type = readString(event.type);
  const data = asRecord(event.data);
  const conversationId = readString(data.conversation_id);

  if (
    type !== "post_call_transcription" &&
    type !== "post_call_audio" &&
    type !== "call_initiation_failure"
  ) {
    return NextResponse.json({ received: true });
  }
  if (!conversationId) {
    console.warn("elevenlabs post-call: event without conversation_id — acked, not processed", { type });
    return NextResponse.json({ received: true });
  }

  const db = getAdminFirestore();
  if (!db) {
    console.error("ElevenLabs post-call replay protection unavailable: Firestore is not configured");
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }

  try {
    const replayClaim = await claimElevenLabsPostCallEvent(
      db,
      { type, conversationId, eventTimestamp: String(event.event_timestamp ?? "") },
      Date.now()
    );
    if (replayClaim === "duplicate") {
      return NextResponse.json({ received: true });
    }
    if (replayClaim === "invalid") {
      // No stable identity to dedup (missing timestamp) — ack so the webhook is
      // never marked failing, but do not process an unidentifiable event.
      console.warn("elevenlabs post-call: event without stable identity — acked, not processed", { type });
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    console.error("ElevenLabs post-call replay claim failed", error);
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }

  try {
    if (type === "post_call_transcription") {
      await handlePostCallTranscription(data);
    } else if (type === "call_initiation_failure") {
      await handleCallInitiationFailure(data);
    } else {
      // post_call_audio: deliberately NOT stored yet (large base64 MP3) — logged
      // only. Follow-up: decide audio retention per T-112 (b) once needed.
      console.log("elevenlabs post-call: audio webhook received (not stored)", {
        conversationId,
        agentId: readString(data.agent_id),
        audioChars: typeof data.full_audio === "string" ? data.full_audio.length : 0,
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("elevenlabs post-call handler error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handlePostCallTranscription(data: Record<string, unknown>): Promise<void> {
  const conversationId = readString(data.conversation_id);
  const agentId = readString(data.agent_id);
  if (!conversationId) return;

  // Tenant + caller phone from the stored conversation record (the initiation
  // webhook persisted it for inbound calls). Outbound calls fall back to the
  // agent id; the caller phone is then unknown (null).
  const stored = await getElevenLabsConversation(conversationId);
  let businessId = stored?.businessId ?? null;
  const callerPhone = stored?.callerPhone ?? null;
  if (!businessId && agentId) {
    businessId = await findBusinessByElevenLabsAgentId(agentId);
  }
  if (!businessId) {
    console.error("elevenlabs post-call: could not resolve business", {
      agentId,
      conversationId,
    });
    return;
  }

  const db = getAdminFirestore();
  if (!db) return;

  // ElevenLabs transcript entries carry `time_in_call_secs` (seconds since
  // answer) — rebase onto the call's start time for absolute ms timestamps.
  const metadata = asRecord(data.metadata);
  const startTimeSecs =
    typeof metadata.start_time_unix_secs === "number"
      ? metadata.start_time_unix_secs
      : Math.floor(Date.now() / 1000);
  const transcriptEntries = Array.isArray(data.transcript) ? data.transcript : [];
  const messages = normalizeProviderTranscriptMessages(
    transcriptEntries.map((entry) => {
      const turn = asRecord(entry);
      const timeInCallSecs =
        typeof turn.time_in_call_secs === "number" ? turn.time_in_call_secs : undefined;
      return {
        role: typeof turn.role === "string" ? turn.role : "system",
        message: typeof turn.message === "string" ? turn.message : undefined,
        time:
          timeInCallSecs !== undefined
            ? (startTimeSecs + timeInCallSecs) * 1000
            : undefined,
      };
    })
  );

  const analysis = asRecord(data.analysis);
  const summary =
    typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : null;
  const durationSecs =
    typeof metadata.call_duration_secs === "number" ? metadata.call_duration_secs : undefined;

  // Same `calls` document the Vapi end-of-call-report writes (shared writer).
  await writeEndedCallReport(db, {
    businessId,
    callId: `call_elevenlabs_${conversationId}`,
    callerPhone,
    messages,
    summary,
    durationSecs,
    providerFields: { elevenLabsConversationId: conversationId },
  });
}

async function handleCallInitiationFailure(data: Record<string, unknown>): Promise<void> {
  const conversationId = readString(data.conversation_id);
  const agentId = readString(data.agent_id);
  const failureReason = readString(data.failure_reason) ?? "unknown";
  if (!conversationId) return;

  // Outbound calls have no initiation-webhook record; fall back to the agent id.
  const stored = await getElevenLabsConversation(conversationId);
  const businessId =
    stored?.businessId ?? (agentId ? await findBusinessByElevenLabsAgentId(agentId) : null);
  if (!businessId) {
    console.error("elevenlabs post-call: call_initiation_failure — could not resolve business", {
      agentId,
      conversationId,
      failureReason,
    });
    return;
  }

  const db = getAdminFirestore();
  if (!db) return;

  const callId = `call_elevenlabs_${conversationId}`;
  await db
    .collection("businesses")
    .doc(businessId)
    .collection("calls")
    .doc(callId)
    .set(
      {
        callId,
        businessId,
        callerPhone: stored?.callerPhone ?? null,
        status: "failed",
        endedAt: Date.now(),
        updatedAt: Date.now(),
        elevenLabsConversationId: conversationId,
        failureReason,
      },
      { merge: true }
    );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
