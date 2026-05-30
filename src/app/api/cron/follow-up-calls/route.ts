// Daily cron: fire outbound follow-up calls for leads that haven't been reached.
// Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
//
// Fires when:
//   - Lead has no calledBack flag (never reached)
//   - Business has callbackDelayMinutes configured
//   - callAttempts < maxCallAttempts (default 3)
//   - Current time is within callingWindowStart/callingWindowEnd

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { initiateVapiCall } from "@/lib/vapi/vapiClient";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const now = Date.now();
  let attempted = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // Load all businesses that have outbound calling configured
    const bizSnap = await db.collection("businesses").where("vapiAssistantId", "!=", null).get();

    for (const bizDoc of bizSnap.docs) {
      const biz = bizDoc.data();
      const businessId = bizDoc.id;

      const maxAttempts: number = biz.maxCallAttempts ?? 3;
      const windowStart: number = biz.callingWindowStart ?? 8;
      const windowEnd: number = biz.callingWindowEnd ?? 20;
      const tz: string = biz.timezone ?? "America/New_York";

      // Check calling window
      const localHour = parseInt(
        new Date(now).toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })
      );
      if (localHour < windowStart || localHour >= windowEnd) {
        skipped++;
        continue;
      }

      if (!biz.vapiAssistantId || !biz.vapiPhoneNumberId) {
        skipped++;
        continue;
      }

      // Find leads that need a follow-up call
      const leadsSnap = await db
        .collection(`businesses/${businessId}/leads`)
        .where("calledBack", "!=", true)
        .limit(10)
        .get();

      for (const leadDoc of leadsSnap.docs) {
        const lead = leadDoc.data();
        const callAttempts: number = lead.callAttempts ?? 0;

        if (callAttempts >= maxAttempts) continue;
        if (!lead.callerPhone) continue;

        // Don't re-attempt within 4 hours of last attempt
        const lastAttemptAt: number = lead.lastCallAttemptAt ?? 0;
        if (now - lastAttemptAt < 4 * 60 * 60 * 1000) continue;

        try {
          await initiateVapiCall({
            assistantId: biz.vapiAssistantId,
            phoneNumberId: biz.vapiPhoneNumberId,
            customerNumber: lead.callerPhone,
            metadata: { businessId, leadId: leadDoc.id, type: "follow_up" },
            assistantOverrides: {
              firstMessage: `Hi, this is ${biz.agentName ?? "your AI receptionist"} calling back from ${biz.businessName}. We missed each other earlier — I'm calling about your roofing inquiry. Is now a good time?`,
            },
          });

          await leadDoc.ref.update({
            callAttempts: callAttempts + 1,
            lastCallAttemptAt: now,
          });

          attempted++;
        } catch (err) {
          errors.push(`${businessId}/${leadDoc.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attempted, skipped, errors });
}
