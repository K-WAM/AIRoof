import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { initiateVapiCall } from "@/lib/vapi/vapiClient";

function sanitizePhone(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  return digitCount >= 7 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  // Resolves "my own business" from the session rather than checking against
  // a caller-supplied businessId — this route has no businessId input, only
  // a targetPhone. Shares the same point-read + active-status + role check
  // every other route uses, so this can no longer drift from them.
  const gate = await verifyOwnBusinessRole(request, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const businessId = gate.user.businessId!;
  const uid = gate.user.uid;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetPhone = sanitizePhone(body.targetPhone);
  if (!targetPhone) {
    return NextResponse.json({ error: "targetPhone is required and must be a valid phone number" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Load business config to get vapiAssistantId + vapiPhoneNumberId
  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const bizData = bizSnap.data()!;
  const vapiAssistantId = bizData.vapiAssistantId as string | undefined;
  const vapiPhoneNumberId = bizData.vapiPhoneNumberId as string | undefined;

  if (!vapiAssistantId || !vapiPhoneNumberId) {
    return NextResponse.json(
      { error: "Business is not configured for outbound calls. Set vapiAssistantId and vapiPhoneNumberId in business config." },
      { status: 400 }
    );
  }

  // Create a placeholder Firestore doc before calling Vapi
  const callId = `call_out_${Date.now()}`;
  const now = Date.now();
  const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);
  await callRef.set({
    callId,
    businessId,
    callType: "outbound",
    targetPhone,
    status: "queued",
    initiatedByUid: uid,
    leadId: typeof body.leadId === "string" ? body.leadId : null,
    appointmentRef: typeof body.appointmentId === "string" ? body.appointmentId : null,
    context: typeof body.context === "string" ? body.context : null,
    vapiCallId: null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    messages: [],
  });

  // Initiate via Vapi
  let vapiCallId: string;
  try {
    const vapiCall = await initiateVapiCall({
      assistantId: vapiAssistantId,
      phoneNumberId: vapiPhoneNumberId,
      customerNumber: targetPhone,
      metadata: {
        businessId,
        outboundCallId: callId,
        ...(typeof body.leadId === "string" ? { leadId: body.leadId } : {}),
      },
      assistantOverrides: {
        variableValues: {
          callType: "outbound",
          ...(typeof body.context === "string" ? { callContext: body.context } : {}),
        },
      },
    });
    vapiCallId = vapiCall.id;
  } catch (err) {
    // Mark doc as failed so UI can show it
    await callRef.update({ status: "failed", updatedAt: Date.now() });
    console.error("Vapi outbound call failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Vapi call" },
      { status: 502 }
    );
  }

  // Update doc with real Vapi call ID and rename to canonical call_vapi_* pattern
  const canonicalCallId = `call_vapi_${vapiCallId}`;
  const canonicalRef = db.collection("businesses").doc(businessId).collection("calls").doc(canonicalCallId);
  await canonicalRef.set({
    callId: canonicalCallId,
    businessId,
    callType: "outbound",
    targetPhone,
    status: "queued",
    initiatedByUid: uid,
    leadId: typeof body.leadId === "string" ? body.leadId : null,
    appointmentRef: typeof body.appointmentId === "string" ? body.appointmentId : null,
    context: typeof body.context === "string" ? body.context : null,
    vapiCallId,
    startedAt: now,
    createdAt: now,
    updatedAt: Date.now(),
    messages: [],
  });
  // Clean up the placeholder doc
  await callRef.delete();

  return NextResponse.json({ callId: canonicalCallId, vapiCallId });
}
