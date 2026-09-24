// ElevenLabs inbound webhook authentication (T-111b).
//
// Two distinct mechanisms, both fail-closed:
//
// 1. Shared-secret header auth — conversation-initiation webhook + the 7 webhook
//    tools. ElevenLabs sends the secret stored in its secrets manager; we read
//    it as `x-luxor-tool-secret` (see src/lib/voice/elevenlabs/toolSchemas.ts)
//    and compare timing-safe against ELEVENLABS_TOOL_SECRET.
//
// 2. HMAC signature auth — post-call webhooks. The `ElevenLabs-Signature`
//    header carries "t=<unix_secs>,v0=<hex hmac-sha256>", signed over
//    "<timestamp>.<raw body>" with ELEVENLABS_WEBHOOK_SECRET. This is exactly
//    the scheme ElevenLabs' official SDKs implement (constructEvent /
//    construct_event), re-verified 2026-09-24 from the elevenlabs-js source
//    (src/wrapper/webhooks.ts): v0 (not Stripe's v1), timestamp in SECONDS,
//    hex digest. Plus a Firestore replay guard modeled on src/lib/vapi/verify.ts
//    (ElevenLabs retries deliver an identical payload, so an idempotent claim
//    is the correct dedup).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

export const ELEVENLABS_TOOL_SECRET_ENV = "ELEVENLABS_TOOL_SECRET";
export const ELEVENLABS_WEBHOOK_SECRET_ENV = "ELEVENLABS_WEBHOOK_SECRET";
export const ELEVENLABS_SIGNATURE_HEADER = "elevenlabs-signature";

// ElevenLabs post-call retries run up to ~30 minutes after the original
// delivery; a 24h TTL covers retries while still expiring stale claims.
export const ELEVENLABS_POST_CALL_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ELEVENLABS_POST_CALL_REPLAY_COLLECTION = "_elevenLabsPostCallEvents";

// SDK parity: the official constructEvent rejects a timestamp more than 30
// minutes in the past. A small future skew is tolerated for clock drift, but a
// timestamp far in the future is rejected — the Firestore replay guard is the
// defense against replayed *identical* payloads, this bounds grossly stale or
// forged-timestamp events.
export const ELEVENLABS_SIGNATURE_PAST_TOLERANCE_MS = 30 * 60 * 1000;
export const ELEVENLABS_SIGNATURE_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type ElevenLabsPostCallReplayClaim = "claimed" | "in_progress" | "duplicate" | "invalid";
const ELEVENLABS_POST_CALL_CLAIM_LEASE_MS = 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Shared-secret header auth (initiation webhook + tools)
// ──────────────────────────────────────────────────────────────────────────────

export function verifyElevenLabsToolSecret(request: NextRequest): boolean {
  const expected = process.env[ELEVENLABS_TOOL_SECRET_ENV]?.trim();
  if (!expected) {
    console.error(
      "ElevenLabs webhook authentication unavailable: ELEVENLABS_TOOL_SECRET is not configured"
    );
    return false;
  }

  const candidates: Array<{ source: string; value: string }> = [];
  const toolSecret = request.headers.get("x-luxor-tool-secret");
  if (toolSecret) {
    candidates.push({ source: "x-luxor-tool-secret", value: toolSecret.trim() });
  }
  const authorization = request.headers.get("authorization");
  if (authorization) {
    candidates.push({
      source: "authorization",
      value: authorization.replace(/^Bearer\s+/i, "").trim(),
    });
  }

  for (const candidate of candidates) {
    if (timingSafeStringEqual(candidate.value, expected)) return true;
  }

  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Post-call HMAC signature verification
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Verify an ElevenLabs post-call webhook signature.
 *
 * @param rawBody  the RAW request body string (never a re-serialized object)
 * @param signatureHeader value of the `ElevenLabs-Signature` header
 * @param secret   the shared webhook secret (ELEVENLABS_WEBHOOK_SECRET)
 * @param now      current time in ms (injectable for tests)
 */
export function verifyElevenLabsPostCallSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
  now = Date.now()
): boolean {
  const trimmedSecret = secret?.trim();
  if (!trimmedSecret) {
    console.error(
      "ElevenLabs post-call verification unavailable: ELEVENLABS_WEBHOOK_SECRET is not configured"
    );
    return false;
  }
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signaturePart = parts.find((part) => part.startsWith("v0="));
  if (!timestampPart || !signaturePart) return false;

  const timestampSecs = Number(timestampPart.substring(2));
  const receivedSignature = signaturePart.substring(3);
  if (!Number.isFinite(timestampSecs) || receivedSignature.length === 0) return false;

  const timestampMs = timestampSecs * 1000;
  if (timestampMs < now - ELEVENLABS_SIGNATURE_PAST_TOLERANCE_MS) return false;
  if (timestampMs > now + ELEVENLABS_SIGNATURE_FUTURE_SKEW_MS) return false;

  const expected = createHmac("sha256", trimmedSecret)
    .update(`${timestampSecs}.${rawBody}`)
    .digest("hex");

  return timingSafeStringEqual(receivedSignature, expected);
}

// ──────────────────────────────────────────────────────────────────────────────
// Replay guard (modeled on src/lib/vapi/verify.ts)
// ──────────────────────────────────────────────────────────────────────────────

export interface ElevenLabsPostCallEventIdentity {
  type: string;
  conversationId: string;
  eventTimestamp: string | number;
}

export function getElevenLabsPostCallEventIdentity(
  event: ElevenLabsPostCallEventIdentity
): string | null {
  const type = readNonEmptyString(event.type);
  const conversationId = readNonEmptyString(event.conversationId);
  const eventTimestamp = readNonEmptyString(event.eventTimestamp);
  if (!type || !conversationId || !eventTimestamp) return null;
  return hash(`${type}\u0000${conversationId}\u0000${eventTimestamp}`);
}

export async function claimElevenLabsPostCallEvent(
  db: Firestore,
  event: ElevenLabsPostCallEventIdentity,
  now = Date.now()
): Promise<ElevenLabsPostCallReplayClaim> {
  const eventId = getElevenLabsPostCallEventIdentity(event);
  const type = readNonEmptyString(event.type);
  const conversationId = readNonEmptyString(event.conversationId);
  if (!eventId || !type || !conversationId) return "invalid";

  const claimRef = db.collection(ELEVENLABS_POST_CALL_REPLAY_COLLECTION).doc(eventId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(claimRef);
    const expiresAt = timestampMillis(existing.data()?.expiresAt);
    if (existing.exists && expiresAt !== null && expiresAt > now) {
      if (timestampMillis(existing.data()?.completedAt) !== null) return "duplicate";
      const claimedAt = timestampMillis(existing.data()?.claimedAt);
      if (claimedAt !== null && claimedAt > now - ELEVENLABS_POST_CALL_CLAIM_LEASE_MS) {
        return "in_progress";
      }
    }

    transaction.set(claimRef, {
      eventId,
      type,
      conversationId,
      claimedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + ELEVENLABS_POST_CALL_REPLAY_WINDOW_MS),
    });
    return "claimed";
  });
}

/** Mark processing complete only after the call document was written. */
export async function completeElevenLabsPostCallEvent(
  db: Firestore,
  event: ElevenLabsPostCallEventIdentity,
  now = Date.now()
): Promise<void> {
  const eventId = getElevenLabsPostCallEventIdentity(event);
  if (!eventId) throw new Error("Missing ElevenLabs event identity");
  await db.collection(ELEVENLABS_POST_CALL_REPLAY_COLLECTION).doc(eventId).update({
    completedAt: Timestamp.fromMillis(now),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

export function timingSafeStringEqual(a: string, b: string): boolean {
  // Hash to fixed-size buffers so even differing input lengths use the
  // platform's constant-time comparison primitive.
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (
    value !== null &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}
