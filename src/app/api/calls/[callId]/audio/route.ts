import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
): Promise<Response> {
  const { callId } = await params;
  const businessId = request.nextUrl.searchParams.get("businessId")?.trim();
  if (!callId || !businessId) {
    return NextResponse.json({ error: "Missing callId or businessId parameter" }, { status: 400 });
  }
  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });
  const call = await db.collection("businesses").doc(businessId).collection("calls").doc(callId).get();
  if (!call.exists) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  const data = call.data() ?? {};
  const providerIds = data.providerIds && typeof data.providerIds === "object"
    ? data.providerIds as Record<string, unknown> : {};
  const conversationId = typeof providerIds.elevenLabsConversationId === "string"
    ? providerIds.elevenLabsConversationId
    : typeof data.elevenLabsConversationId === "string" ? data.elevenLabsConversationId : undefined;
  if (!conversationId) return NextResponse.json({ error: "Call audio is unavailable" }, { status: 404 });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Call audio is not configured" }, { status: 503 });
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (upstream.status === 404) return NextResponse.json({ error: "Call audio not found" }, { status: 404 });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Call audio provider unavailable" }, { status: 502 });
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
