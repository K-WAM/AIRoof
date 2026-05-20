import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
): Promise<NextResponse<any | { error: string }>> {
  try {
    const { callId } = await params;
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!callId || !businessId) {
      return NextResponse.json(
        { error: "Missing callId or businessId parameter" },
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

    const callDoc = await db
      .collection("businesses")
      .doc(businessId)
      .collection("calls")
      .doc(callId)
      .get();

    if (!callDoc.exists) {
      return NextResponse.json(
        { error: `Call ${callId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(callDoc.data());
  } catch (error) {
    console.error("GET /api/calls/[callId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { callId } = await params;
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");
    const body = await request.json();

    if (!callId || !businessId) {
      return NextResponse.json(
        { error: "Missing callId or businessId parameter" },
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

    // Validate business exists
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    // Update call
    await db
      .collection("businesses")
      .doc(businessId)
      .collection("calls")
      .doc(callId)
      .update({
        ...body,
        updatedAt: Date.now(),
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/calls/[callId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { callId } = await params;
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!callId || !businessId) {
      return NextResponse.json(
        { error: "Missing callId or businessId parameter" },
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

    const callRef = db
      .collection("businesses")
      .doc(businessId)
      .collection("calls")
      .doc(callId);

    const callDoc = await callRef.get();
    if (!callDoc.exists) {
      return NextResponse.json(
        { error: `Call ${callId} not found` },
        { status: 404 }
      );
    }

    await callRef.update({
      status: "ended",
      endedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/calls/[callId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
