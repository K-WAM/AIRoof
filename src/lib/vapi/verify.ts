// Verify that an incoming webhook is from Vapi by checking the secret header.
// Vapi sends the header configured in its dashboard ("Server URL Secret"
// or a custom HTTP header).

import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { VapiMessage } from "@/lib/vapi/types";

export const VAPI_REPLAY_WINDOW_MS = 10 * 60 * 1000;
const VAPI_REPLAY_COLLECTION = "_vapiWebhookEvents";

// T-065: a scheduled check (src/lib/vapi/webhookHealth.ts +
// src/app/api/cron/webhook-health/route.ts) reads this counter and alerts
// past a threshold. Kept here, next to the auth check itself, per the task's
// own owned-scope.
export const VAPI_WEBHOOK_HEALTH_COLLECTION = "_vapiWebhookHealth";
export const VAPI_AUTH_FAILURE_COUNTER_DOC = "authFailureCounter";

export type VapiReplayClaim = "claimed" | "duplicate" | "invalid";

export function verifyVapiWebhook(request: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!expected) {
    console.error(
      "Vapi webhook authentication unavailable: VAPI_WEBHOOK_SECRET is not configured"
    );
    return false;
  }

  const headerNames = [
    "x-vapi-secret",
    "x-vapi-signature",
    "vapi-secret",
    "vapi-signature",
    "secret",
  ];

  const candidates: Array<{ source: string; value: string }> = [];
  for (const name of headerNames) {
    const value = request.headers.get(name);
    if (value) candidates.push({ source: name, value: value.trim() });
  }

  const authorization = request.headers.get("authorization");
  if (authorization) {
    candidates.push({
      source: "authorization",
      value: authorization.replace(/^Bearer\s+/i, "").trim(),
    });
  }

  for (const candidate of candidates) {
    if (timingSafeEqual(candidate.value, expected)) return true;
  }

  // Diagnostic metadata only: never log the configured or received secret.
  console.warn("Vapi webhook auth mismatch", {
    expectedLen: expected.length,
    receivedHeaders: candidates.map((candidate) => ({
      source: candidate.source,
      len: candidate.value.length,
      matchesLen: candidate.value.length === expected.length,
    })),
    allHeaderKeys: Array.from(request.headers.keys()),
  });

  return false;
}

// Best-effort observability only — never blocks or fails the actual 401
// decision. A Firestore hiccup here must never turn a clean auth rejection
// into a 500 (matches this file's own "log diagnostics, never the secret"
// posture), so every failure is caught and swallowed, not propagated.
export async function recordVapiAuthFailure(now = Date.now()): Promise<void> {
  try {
    const db = getAdminFirestore();
    if (!db) return;
    await db
      .collection(VAPI_WEBHOOK_HEALTH_COLLECTION)
      .doc(VAPI_AUTH_FAILURE_COUNTER_DOC)
      .set(
        { count: FieldValue.increment(1), lastFailureAt: Timestamp.fromMillis(now) },
        { merge: true }
      );
  } catch (error) {
    console.error("Failed to record Vapi webhook auth-failure counter", error);
  }
}

export function getVapiEventIdentity(message: VapiMessage): string | null {
  const record = asRecord(message);
  const call = asRecord(record.call);
  const callId = readNonEmptyString(call.id);
  const messageType = readNonEmptyString(record.type);
  if (!callId || !messageType) return null;

  const explicitId = [record.id, record.messageId, record.eventId]
    .map(readNonEmptyString)
    .find(Boolean);

  const toolCallIds = Array.isArray(record.toolCalls)
    ? record.toolCalls
        .map((toolCall) => readNonEmptyString(asRecord(toolCall).id))
        .filter((id): id is string => Boolean(id))
        .sort()
    : [];

  const discriminator =
    explicitId ??
    (toolCallIds.length > 0 ? toolCallIds.join(",") : hash(stableSerialize(record)));

  return hash(`${callId}\u0000${messageType}\u0000${discriminator}`);
}

export async function claimVapiWebhookEvent(
  db: Firestore,
  message: VapiMessage,
  now = Date.now()
): Promise<VapiReplayClaim> {
  const eventId = getVapiEventIdentity(message);
  if (!eventId) return "invalid";

  const record = asRecord(message);
  const callId = readNonEmptyString(asRecord(record.call).id);
  const messageType = readNonEmptyString(record.type);
  if (!callId || !messageType) return "invalid";

  const claimRef = db.collection(VAPI_REPLAY_COLLECTION).doc(eventId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(claimRef);
    const expiresAt = timestampMillis(existing.data()?.expiresAt);
    if (existing.exists && expiresAt !== null && expiresAt > now) {
      return "duplicate";
    }

    transaction.set(claimRef, {
      eventId,
      callId,
      messageType,
      claimedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + VAPI_REPLAY_WINDOW_MS),
    });
    return "claimed";
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
