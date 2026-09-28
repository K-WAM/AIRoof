import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { E2E_OUTBOX_COLLECTION, isE2EHarness } from "@/lib/e2e/harness";
import {
  claimOperation,
  completeOperationAttempt,
  startOperationAttempt,
} from "@/lib/ops/ledger";
import type { NotificationDeliveryState } from "@/lib/comms/send";

export type { NotificationDeliveryState };

// Phase 31 (T-152): texting, shipped OFF. isSmsEnabled gates on env SMS_ENABLED === "true" plus Twilio
// credentials, so nothing texts until NH-29 carrier registration is done and the env flag is flipped.
// Dedupe + delivery bookkeeping mirror sendWithLedger in src/lib/comms/send.ts, keyed under a distinct
// opId prefix so an SMS and an email for the same entity never collide.

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_TIMEOUT_MS = 10_000;

interface SmsBusiness {
  smsEnabled?: boolean;
  smsFromNumber?: string;
}

/** Texting is on only when the env flag + Twilio creds are present AND the tenant hasn't opted out. */
export function isSmsEnabled(business: unknown): boolean {
  if (process.env.SMS_ENABLED !== "true") return false;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return false;
  const record = business && typeof business === "object" ? (business as SmsBusiness) : {};
  return record.smsEnabled !== false;
}

/** Digit-count guard (mirrors the Vapi/agentTools sanitizePhone) plus E.164 shaping for Twilio. */
function sanitizePhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** Only ever logged, never returned: the last four digits of a number. */
function last4(value: string): string {
  return value.replace(/\D/g, "").slice(-4);
}

function classifyTwilioError(statusCode: number): {
  classification: "retryable" | "terminal";
  code: string;
} {
  if (statusCode >= 500 || statusCode === 429) {
    return { classification: "retryable", code: `provider_${statusCode}` };
  }
  if (statusCode >= 400) {
    return { classification: "terminal", code: `provider_${statusCode}` };
  }
  return { classification: "retryable", code: "provider_rejected" };
}

interface SmsAttemptResult {
  status: "delivered" | "failed";
  providerId?: string;
  failureCode?: string;
  failureClassification?: "retryable" | "terminal";
}

function createSmsOperationId(messageType: string, entityId: string): string {
  return `sms:${encodeURIComponent(messageType)}:${encodeURIComponent(entityId)}`;
}

async function postToTwilio(to: string, from: string, body: string): Promise<SmsAttemptResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const { classification, code } = classifyTwilioError(response.status);
      console.error(`sms: Twilio rejected the message to …${last4(to)} (${code})`);
      return { status: "failed", failureCode: code, failureClassification: classification };
    }
    const payload = (await response.json().catch(() => ({}))) as { sid?: unknown };
    if (typeof payload.sid !== "string" || !payload.sid) {
      return { status: "failed", failureCode: "no_provider_id", failureClassification: "retryable" };
    }
    return { status: "delivered", providerId: payload.sid };
  } catch {
    // AbortError (the 10s timeout) or a network failure — never log the credential or the full number.
    console.error(`sms: Twilio request failed for …${last4(to)}`);
    return { status: "failed", failureCode: "provider_error", failureClassification: "retryable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one text for a business, deduped and recorded through the T-021 operation ledger exactly like
 * sendWithLedger does for email. Returns "unconfigured" when texting is off (the default). In the local
 * smoke harness the message is written to the shared `_e2eOutbox` with channel "sms" and Twilio is never called.
 */
export async function sendSms(opts: {
  businessId: string;
  to: string;
  body: string;
  messageType: string;
  entityId: string;
}): Promise<NotificationDeliveryState> {
  const firestore = getAdminFirestore();
  if (!firestore) return "unconfigured";

  const businessSnapshot = await firestore.collection("businesses").doc(opts.businessId).get();
  const business = businessSnapshot.data() ?? {};
  if (!isSmsEnabled(business)) return "unconfigured";

  const to = sanitizePhone(opts.to);
  if (!to) {
    console.warn(`sms: refusing an invalid recipient number (…${last4(typeof opts.to === "string" ? opts.to : "")})`);
    return "failed";
  }
  const from = sanitizePhone((business as SmsBusiness).smsFromNumber ?? process.env.TWILIO_PHONE_NUMBER);
  if (!from) return "unconfigured";

  const opId = createSmsOperationId(opts.messageType, opts.entityId);
  const claim = await claimOperation(
    { businessId: opts.businessId, opId, kind: "sms" },
    { firestore }
  );
  if (!claim.claimed && claim.operation.state === "succeeded") return "delivered";
  if (!claim.claimed && claim.operation.state === "pending") return "pending";
  if (!claim.claimed && claim.operation.lastFailure?.classification !== "retryable") {
    return "failed";
  }

  const attempt = await startOperationAttempt(
    { businessId: opts.businessId, opId },
    { firestore }
  );

  const result = isE2EHarness()
    ? await writeToHarnessOutbox(firestore, opts, to)
    : await postToTwilio(to, from, opts.body);

  if (result.status === "delivered") {
    await completeOperationAttempt(
      {
        businessId: opts.businessId,
        opId,
        attemptId: attempt.attemptId,
        state: "succeeded",
        providerId: result.providerId,
      },
      { firestore }
    );
    return "delivered";
  }

  await completeOperationAttempt(
    {
      businessId: opts.businessId,
      opId,
      attemptId: attempt.attemptId,
      state: "failed",
      failure: {
        classification: result.failureClassification ?? "retryable",
        code: result.failureCode ?? "unknown",
      },
    },
    { firestore }
  );
  return "failed";
}

async function writeToHarnessOutbox(
  firestore: Firestore,
  opts: { businessId: string; body: string; messageType: string; entityId: string },
  to: string
): Promise<SmsAttemptResult> {
  const id = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await firestore.collection(E2E_OUTBOX_COLLECTION).doc(id).set({
    id,
    channel: "sms",
    to,
    body: opts.body,
    messageType: opts.messageType,
    entityId: opts.entityId,
    createdAt: Date.now(),
  });
  return { status: "delivered", providerId: id };
}
