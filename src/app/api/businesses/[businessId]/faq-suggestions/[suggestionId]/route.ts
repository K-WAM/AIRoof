import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig, FaqSuggestionBatch } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";

interface ReviewFaqSuggestionRequest {
  action: "approve" | "reject";
  approvedIndexes?: number[];
  reviewedByUid?: string;
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ businessId: string; suggestionId: string }>;
  }
): Promise<
  NextResponse<
    | {
        success: true;
        action: "approve" | "reject";
        approvedCount: number;
      }
    | { error: string }
  >
> {
  try {
    const { businessId, suggestionId } = await params;
    const body: ReviewFaqSuggestionRequest = await request.json();

    if (!businessId || !suggestionId) {
      return NextResponse.json(
        { error: "Missing businessId or suggestionId parameter" },
        { status: 400 }
      );
    }

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json(
        { error: "Invalid action. Use approve or reject." },
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
    const suggestionRef = businessRef.collection("faqSuggestions").doc(suggestionId);

    const result = await db.runTransaction(async (transaction) => {
      const businessDoc = await transaction.get(businessRef);
      if (!businessDoc.exists) {
        throw new Error(`Business ${businessId} not found`);
      }

      const suggestionDoc = await transaction.get(suggestionRef);
      if (!suggestionDoc.exists) {
        throw new Error(`FAQ suggestion ${suggestionId} not found`);
      }

      const businessConfig = businessDoc.data() as BusinessConfig;
      const suggestionBatch = suggestionDoc.data() as FaqSuggestionBatch;
      const reviewedAt = Date.now();

      if (body.action === "reject") {
        transaction.update(suggestionRef, {
          status: "rejected",
          reviewedByUid: body.reviewedByUid,
          reviewedAt,
          updatedAt: reviewedAt,
        });

        return { approvedCount: 0 };
      }

      const approvedIndexes =
        body.approvedIndexes && body.approvedIndexes.length > 0
          ? new Set(body.approvedIndexes)
          : new Set(suggestionBatch.suggestions.map((_, index) => index));

      const approvedSuggestions = suggestionBatch.suggestions.filter((_, index) =>
        approvedIndexes.has(index)
      );

      const existingFaqs = businessConfig.approvedFaqs || [];
      const existingQuestions = new Set(
        existingFaqs.map((faq) => faq.question.trim().toLowerCase())
      );
      const newFaqs = approvedSuggestions.filter(
        (faq) => !existingQuestions.has(faq.question.trim().toLowerCase())
      );

      transaction.update(businessRef, {
        approvedFaqs: existingFaqs.concat(newFaqs),
        updatedAt: reviewedAt,
      });

      transaction.update(suggestionRef, {
        status: "approved",
        reviewedByUid: body.reviewedByUid,
        reviewedAt,
        updatedAt: reviewedAt,
      });

      return { approvedCount: newFaqs.length };
    });

    return NextResponse.json({
      success: true,
      action: body.action,
      approvedCount: result.approvedCount,
    });
  } catch (error) {
    console.error("POST /api/businesses/[businessId]/faq-suggestions/[suggestionId] error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
