import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig } from "@/types";
import { requireCronAuth } from "@/lib/auth/cronGuard";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { summarizeTranscript } from "@/lib/ai/deepseekClient";

interface DailySummaryRequest {
  businessId: string;
  since?: number;
  until?: number;
}

export async function POST(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const body: DailySummaryRequest = await request.json();
    const { businessId } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: "Missing required field: businessId" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "Firestore not available" },
        { status: 500 }
      );
    }

    const businessRef = db.collection("businesses").doc(businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;
    const until = body.until || Date.now();
    const since = body.since || until - 24 * 60 * 60 * 1000;

    const callsSnapshot = await businessRef
      .collection("calls")
      .where("startedAt", ">=", since)
      .where("startedAt", "<=", until)
      .get();

    let processed = 0;
    let skipped = 0;

    for (const callDoc of callsSnapshot.docs) {
      const callData = callDoc.data();
      const messages = Array.isArray(callData.messages)
        ? callData.messages
        : Array.isArray(callData.transcript)
          ? callData.transcript
          : [];

      const transcript = messages
        .filter((message: any) => message?.role && message?.text)
        .map((message: any) => ({
          role: String(message.role),
          text: String(message.text),
        }));

      if (transcript.length === 0) {
        skipped += 1;
        continue;
      }

      const summary = await summarizeTranscript({
        transcript,
        businessName: businessConfig.businessName,
      });

      await callDoc.ref.update({
        summary,
        summarizedAt: Date.now(),
        updatedAt: Date.now(),
      });

      processed += 1;
    }

    return NextResponse.json({
      success: true,
      businessId,
      processed,
      skipped,
    });
  } catch (error) {
    console.error("POST /api/cron/daily-call-summary error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
