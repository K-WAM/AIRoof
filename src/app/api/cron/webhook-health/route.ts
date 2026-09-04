// Scheduled check for sustained Vapi webhook auth failures. Nothing else
// catches this automatically today — a real production outage (100% of
// /api/webhooks/vapi calls failing 401) was found only by manually running
// `vercel logs` after a user's bug report. See TODO.md T-065.

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { sendWebhookHealthAlert } from "@/lib/notify";
import {
  readAndResetAuthFailureWindow,
  shouldAlertForAuthFailures,
} from "@/lib/vapi/webhookHealth";

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ error: "Firestore not available" }, { status: 500 });
  }

  const window = await readAndResetAuthFailureWindow(db);

  if (!shouldAlertForAuthFailures(window.count)) {
    return NextResponse.json({ alerted: false, count: window.count });
  }

  const result = await sendWebhookHealthAlert(window);
  return NextResponse.json({
    alerted: result.status === "delivered",
    count: window.count,
    emailStatus: result.status,
  });
}
