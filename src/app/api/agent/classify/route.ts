import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig, ScopeClassification } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { classifyMessage } from "@/lib/ai/scopeClassifier";

interface ClassifyRequest {
  businessId: string;
  message: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScopeClassification | { error: string }>> {
  try {
    const body: ClassifyRequest = await request.json();
    const { businessId, message } = body;

    if (!businessId || !message) {
      return NextResponse.json(
        { error: "Missing required fields: businessId, message" },
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

    // Load business config
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;
    const classification = classifyMessage(message, businessConfig);

    return NextResponse.json(classification);
  } catch (error) {
    console.error("POST /api/agent/classify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
