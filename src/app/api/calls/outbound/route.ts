import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getVoiceProvider } from "@/lib/voice/provider";
import { placeElevenLabsOutboundCall } from "@/lib/voice/elevenlabs/outbound";
import { buildOutboundCallContext, type OutboundPurpose, type OutboundRequestRecord } from "@/lib/voice/outboundContext";
import type { BusinessConfig } from "@/types";
import { contactPhone } from "@/lib/format/phone";

function sanitizePhone(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  return digitCount >= 7 ? trimmed : undefined;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  // With a businessId (every in-app button sends one) the session is checked against THAT business, which is
  // how a superadmin previewing a tenant can use Call Back — verifyOwnBusinessRole always 403'd them, so the
  // button failed in every demo (2026-09-28). Members are still held to their own business by verifyAuthAndRole.
  // Without one, the business is resolved from the session (members only), as before.
  const requestedBusinessId = optionalString(body?.businessId);
  const gate = requestedBusinessId
    ? await verifyAuthAndRole(request, requestedBusinessId, ["owner", "staff", "superadmin"])
    : await verifyOwnBusinessRole(request, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const businessId = requestedBusinessId ?? gate.user.businessId!;
  const uid = gate.user.uid;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // The request being called about: its phone number wins over the client's, and it gives the AI the
  // booking details to talk about (buildOutboundCallContext).
  const appointmentId = optionalString(body.appointmentId);
  const leadId = appointmentId ? undefined : optionalString(body.leadId);
  const purpose: OutboundPurpose = body.purpose === "confirm" ? "confirm" : "callback";
  let record: OutboundRequestRecord | null = null;
  let recordPhone: string | undefined;
  if (appointmentId || leadId) {
    const snap = await db.collection("businesses").doc(businessId)
      .collection(appointmentId ? "appointments" : "leads").doc((appointmentId ?? leadId)!).get();
    if (!snap.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    const data = snap.data() ?? {};
    record = {
      kind: appointmentId ? "appointment" : "lead",
      callerName: optionalString(data.callerName),
      serviceType: optionalString(data.serviceType),
      serviceRequested: optionalString(data.serviceRequested),
      address: optionalString(data.address),
      startTime: typeof data.startTime === "number" ? data.startTime : undefined,
    };
    // The number the caller said on the call wins over caller ID (callbackPhone), then caller ID.
    recordPhone = sanitizePhone(contactPhone(data));
  }

  const targetPhone = recordPhone ?? sanitizePhone(body.targetPhone);
  if (!targetPhone) {
    return NextResponse.json({ error: "targetPhone is required and must be a valid phone number" }, { status: 400 });
  }

  // Load business config to get vapiAssistantId + vapiPhoneNumberId
  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const bizData = bizSnap.data()! as BusinessConfig;
  const provider = getVoiceProvider(bizData);

  const canCall = provider.id === "vapi"
    ? Boolean(bizData.vapiAssistantId && bizData.vapiPhoneNumberId)
    : provider.isConfigured(bizData);
  if (!canCall) {
    return NextResponse.json(
      { error: provider.id === "vapi"
        ? "Business is not configured for outbound calls. Set vapiAssistantId and vapiPhoneNumberId in business config."
        : "Business is not configured for ElevenLabs outbound calls." },
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
    leadId: leadId ?? null,
    appointmentRef: appointmentId ?? null,
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
    const metadata = {
      businessId,
      outboundCallId: callId,
      ...(leadId ? { leadId } : {}),
      ...(appointmentId ? { appointmentId } : {}),
    };
    const variables = {
      callType: "outbound",
      ...(typeof body.context === "string" ? { callContext: body.context } : {}),
    };
    const call = provider.id === "elevenlabs"
      ? await placeElevenLabsOutboundCall({
        businessId,
        config: bizData,
        targetPhone,
        ...buildOutboundCallContext(bizData, purpose, record),
        metadata,
        variables,
      })
      : await provider.startOutboundCall({ config: bizData, targetPhone, metadata, variables });
    vapiCallId = call.callId;
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
  const canonicalCallId = `call_${provider.id}_${vapiCallId}`;
  const canonicalRef = db.collection("businesses").doc(businessId).collection("calls").doc(canonicalCallId);
  await canonicalRef.set({
    callId: canonicalCallId,
    businessId,
    callType: "outbound",
    targetPhone,
    status: "queued",
    initiatedByUid: uid,
    leadId: leadId ?? null,
    appointmentRef: appointmentId ?? null,
    context: typeof body.context === "string" ? body.context : null,
    ...(provider.id === "vapi" ? { vapiCallId } : { elevenlabsConversationId: vapiCallId }),
    startedAt: now,
    createdAt: now,
    updatedAt: Date.now(),
    messages: [],
  });
  // Clean up the placeholder doc
  await callRef.delete();

  return NextResponse.json({ callId: canonicalCallId, ...(provider.id === "vapi" ? { vapiCallId } : { elevenlabsConversationId: vapiCallId }) });
}
