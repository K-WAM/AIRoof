// Scheduled follow-up calls for explicitly consented leads whose callback is due.

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  claimOperation,
  completeOperationAttempt,
  startOperationAttempt,
} from "@/lib/ops/ledger";
import { initiateVapiCall } from "@/lib/vapi/vapiClient";

const DEFAULT_MAX_CALL_ATTEMPTS = 3;
const DEFAULT_CALLBACK_WINDOW_START = 8;
const DEFAULT_CALLBACK_WINDOW_END = 20;
const CALLBACK_RETRY_DELAY_MS = 4 * 60 * 60 * 1000;
const ELIGIBLE_LEAD_QUERY_LIMIT = 10;

function configuredNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function configuredHour(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 24
    ? value
    : fallback;
}

function hourInTimeZone(now: number, timeZone: string): number {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(new Date(now))
    .find((part) => part.type === "hour")?.value;
  return Number(hourPart);
}

function isWithinCallbackWindow(hour: number, start: number, end: number): boolean {
  if (!Number.isInteger(hour)) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function callbackOperationId(leadId: string, attemptNumber: number): string {
  return `callback:${encodeURIComponent(leadId)}:${attemptNumber}`;
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const now = Date.now();
  let skipped = 0;
  const errors: string[] = [];

  try {
    const businesses = await db
      .collection("businesses")
      .where("vapiAssistantId", "!=", null)
      .get();

    for (const businessDocument of businesses.docs) {
      const business = businessDocument.data();
      const businessId = businessDocument.id;

      if (!configuredNonNegativeNumber(business.callbackDelayMinutes)) {
        skipped += 1;
        continue;
      }
      if (!business.vapiAssistantId || !business.vapiPhoneNumberId) {
        skipped += 1;
        continue;
      }

      const windowStart = configuredHour(
        business.callbackWindowStart,
        DEFAULT_CALLBACK_WINDOW_START
      );
      const windowEnd = configuredHour(
        business.callbackWindowEnd,
        DEFAULT_CALLBACK_WINDOW_END
      );
      const timeZone =
        typeof business.timezone === "string" && business.timezone.length > 0
          ? business.timezone
          : "America/New_York";

      if (!isWithinCallbackWindow(hourInTimeZone(now, timeZone), windowStart, windowEnd)) {
        skipped += 1;
        continue;
      }

      const maxAttempts =
        typeof business.maxCallAttempts === "number" &&
        Number.isInteger(business.maxCallAttempts) &&
        business.maxCallAttempts >= 0
          ? business.maxCallAttempts
          : DEFAULT_MAX_CALL_ATTEMPTS;

      const eligibleLeads = await businessDocument.ref
        .collection("leads")
        .where("callbackState", "==", "pending")
        .where("callbackConsent", "==", true)
        .where("callbackDueAt", "<=", now)
        .orderBy("callbackDueAt", "asc")
        .limit(ELIGIBLE_LEAD_QUERY_LIMIT)
        .get();

      for (const leadDocument of eligibleLeads.docs) {
        const lead = leadDocument.data();
        const callAttempts =
          typeof lead.callAttempts === "number" &&
          Number.isInteger(lead.callAttempts) &&
          lead.callAttempts >= 0
            ? lead.callAttempts
            : 0;
        const nextAttempt = callAttempts + 1;

        if (nextAttempt > maxAttempts || typeof lead.callerPhone !== "string") {
          skipped += 1;
          continue;
        }

        const opId = callbackOperationId(leadDocument.id, nextAttempt);
        const claim = await claimOperation(
          {
            businessId,
            opId,
            kind: "callback.follow_up",
            entityRef: { collection: "leads", id: leadDocument.id },
          },
          { firestore: db, now: new Date(now) }
        );

        if (!claim.claimed) {
          skipped += 1;
          continue;
        }

        let attempt;
        try {
          attempt = await startOperationAttempt(
            { businessId, opId },
            { firestore: db, now: new Date(now) }
          );
        } catch (error) {
          errors.push(
            `${businessId}/${leadDocument.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return NextResponse.json({ ok: true, attempted: 0, skipped, errors });
        }

        try {
          const vapiCall = await initiateVapiCall({
            assistantId: business.vapiAssistantId,
            phoneNumberId: business.vapiPhoneNumberId,
            customerNumber: lead.callerPhone,
            metadata: { businessId, leadId: leadDocument.id, type: "follow_up" },
            assistantOverrides: {
              firstMessage: `Hi, this is ${business.agentName ?? "your AI receptionist"} calling back from ${business.businessName}. We missed each other earlier — I'm calling about your roofing inquiry. Is now a good time?`,
            },
          });

          await completeOperationAttempt(
            {
              businessId,
              opId,
              attemptId: attempt.attemptId,
              state: "succeeded",
              providerId: vapiCall.id,
            },
            { firestore: db, now: new Date(now) }
          );

          const canonicalCallId = `call_vapi_${vapiCall.id}`;
          const callbackExhausted = nextAttempt >= maxAttempts;
          const batch = db.batch();
          batch.set(
            businessDocument.ref.collection("calls").doc(canonicalCallId),
            {
              callId: canonicalCallId,
              businessId,
              callType: "outbound",
              targetPhone: lead.callerPhone,
              status: "queued",
              initiatedByUid: "system",
              leadId: leadDocument.id,
              vapiCallId: vapiCall.id,
              callAttempt: nextAttempt,
              startedAt: now,
              createdAt: now,
              updatedAt: now,
              messages: [],
            }
          );
          batch.update(leadDocument.ref, {
            callAttempts: nextAttempt,
            lastCallAttemptAt: now,
            callbackState: callbackExhausted ? "none" : "pending",
            callbackDueAt: callbackExhausted ? null : now + CALLBACK_RETRY_DELAY_MS,
            updatedAt: now,
          });
          await batch.commit();

          return NextResponse.json({ ok: true, attempted: 1, skipped, errors });
        } catch (error) {
          // Provider/network ambiguity remains pending in the ledger. A later
          // reconciliation task must resolve it instead of guessing and duplicating a call.
          errors.push(
            `${businessId}/${leadDocument.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return NextResponse.json({ ok: true, attempted: 1, skipped, errors });
        }
      }
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attempted: 0, skipped, errors });
}
