import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
): Promise<NextResponse<Partial<BusinessConfig> | { error: string }>> {
  try {
    const { businessId } = await params;

    if (!businessId) {
      return NextResponse.json(
        { error: "Missing businessId parameter" },
        { status: 400 }
      );
    }

    const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "viewer", "superadmin"]);
    if ("error" in gate) return gate.error;

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "Firestore not available" },
        { status: 500 }
      );
    }

    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;

    // Return only public config fields (no internal admin settings)
    const publicConfig = {
      businessId: businessConfig.businessId,
      businessName: businessConfig.businessName,
      industry: businessConfig.industry,
      phoneNumber: businessConfig.phoneNumber,
      serviceArea: businessConfig.serviceArea,
      businessHours: businessConfig.businessHours,
      approvedServices: businessConfig.approvedServices,
      approvedFaqs: businessConfig.approvedFaqs,
      disallowedTopics: businessConfig.disallowedTopics,
      emergencyRules: businessConfig.emergencyRules,
      bookingRules: businessConfig.bookingRules,
    };

    return NextResponse.json(publicConfig);
  } catch (error) {
    console.error("GET /api/businesses/[businessId]/agent-config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
