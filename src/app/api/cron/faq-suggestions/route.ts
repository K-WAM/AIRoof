import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig, FaqSuggestionBatch } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { generateFaqSuggestions } from "@/lib/ai/deepseekClient";

interface FaqSuggestionsRequest {
  businessId: string;
  since?: number;
  until?: number;
}

export async function POST(
  request: NextRequest
): Promise<
  NextResponse<
    | {
        success: true;
        businessId: string;
        suggestionId: string;
        sourceCallCount: number;
        suggestions: Array<{ question: string; answer: string }>;
      }
    | { error: string }
  >
> {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");

      if (token !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body: FaqSuggestionsRequest = await request.json();
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
    const since = body.since || until - 7 * 24 * 60 * 60 * 1000;

    const callsSnapshot = await businessRef
      .collection("calls")
      .where("startedAt", ">=", since)
      .where("startedAt", "<=", until)
      .get();

    const callSummaries = callsSnapshot.docs
      .map((callDoc) => callDoc.data().summary)
      .filter((summary): summary is string => typeof summary === "string" && summary.length > 0);

    if (callSummaries.length === 0) {
      return NextResponse.json(
        { error: "No call summaries available for FAQ suggestions" },
        { status: 400 }
      );
    }

    const suggestions = await generateFaqSuggestions({
      callSummary: callSummaries.join("\n\n"),
      businessName: businessConfig.businessName,
      existingFaqs: businessConfig.approvedFaqs || [],
    });

    const suggestionId = `faq_suggestions_${Date.now()}`;
    const suggestionBatch: FaqSuggestionBatch = {
      suggestionId,
      businessId,
      suggestions,
      sourceCallCount: callSummaries.length,
      since,
      until,
      status: "pending_review",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await businessRef.collection("faqSuggestions").doc(suggestionId).set(suggestionBatch);

    return NextResponse.json({
      success: true,
      businessId,
      suggestionId,
      sourceCallCount: callSummaries.length,
      suggestions,
    });
  } catch (error) {
    console.error("POST /api/cron/faq-suggestions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
