// T-065: reads the auth-failure counter src/lib/vapi/verify.ts's
// recordVapiAuthFailure() writes on every rejected Vapi webhook request, and
// decides whether it's crossed a sustained-failure threshold worth alerting
// on. Consumed by src/app/api/cron/webhook-health/route.ts.

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  VAPI_AUTH_FAILURE_COUNTER_DOC,
  VAPI_WEBHOOK_HEALTH_COLLECTION,
} from "@/lib/vapi/verify";

// A lone 401 (e.g. a secret rotation in progress) must never fire a false
// alarm — this is sustained-failure evidence, not a single-occurrence trip
// wire. Tuned to the incident this task was scoped from: a real outage was
// 100% of traffic failing, not an isolated blip.
export const AUTH_FAILURE_ALERT_THRESHOLD = 5;

export interface AuthFailureWindow {
  count: number;
  lastFailureAt: number | null;
}

export function shouldAlertForAuthFailures(
  count: number,
  threshold: number = AUTH_FAILURE_ALERT_THRESHOLD
): boolean {
  return count >= threshold;
}

// Reads the counter accumulated since the previous check, then resets it to
// zero regardless of outcome — each cron run evaluates its own window
// rather than growing an ever-larger event log. Bounded state, matching
// src/lib/audit's retention discipline instead of unbounded history.
export async function readAndResetAuthFailureWindow(
  db: Firestore
): Promise<AuthFailureWindow> {
  const ref = db
    .collection(VAPI_WEBHOOK_HEALTH_COLLECTION)
    .doc(VAPI_AUTH_FAILURE_COUNTER_DOC);
  const snapshot = await ref.get();
  const data = snapshot.data();
  const count = typeof data?.count === "number" ? data.count : 0;
  const lastFailureAt = timestampMillis(data?.lastFailureAt);

  if (count > 0) {
    await ref.set({ count: 0 }, { merge: true });
  }

  return { count, lastFailureAt };
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  return null;
}
