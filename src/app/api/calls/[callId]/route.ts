import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getRetentionPolicy, redactCallDocument } from "@/lib/audit";

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

    const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "viewer", "superadmin"]);
    if ("error" in gate) return gate.error;

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

// No PUT: nothing in the app edits a call record, and a generic "merge the body into the call doc" let any staff
// member rewrite a transcript or outcome (removed 2026-10-08). Calls change only through the webhooks and DELETE (redaction).

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
): Promise<NextResponse<{ success: boolean; redacted: boolean } | { error: string }>> {
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

    const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
    if ("error" in gate) return gate.error;

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

    const now = Date.now();
    const correlationId = `call_delete_${now}_${randomUUID()}`;
    const outcome = await redactCallDocument(
      db,
      businessId,
      callRef,
      getRetentionPolicy(),
      now,
      {
        action: "call.delete",
        actor: { type: "user", id: gate.user.uid },
        correlationId,
        eventId: `${correlationId}_call_${callId}`,
        force: true,
        includeIdentifiers: true,
        reason: "user_delete",
      }
    );

    if (outcome === "missing") {
      return NextResponse.json(
        { error: `Call ${callId} not found` },
        { status: 404 }
      );
    }
    if (outcome === "active") {
      return NextResponse.json(
        { error: "Active calls cannot be redacted" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, redacted: outcome === "redacted" });
  } catch (error) {
    console.error("DELETE /api/calls/[callId] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
