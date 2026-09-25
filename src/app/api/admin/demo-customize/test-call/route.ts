import { NextRequest, NextResponse } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getVoiceProvider } from "@/lib/voice/provider";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import type { BusinessConfig } from "@/types";

const DEMO_BUSINESS_ID = "demo-roofing";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;
  const limited = checkRateLimit(request, { windowMs: 10 * 60_000, max: 3, keyPrefix: "demo-test-call" });
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { phone?: unknown } | null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!/^[+().\-\s\d]{7,20}$/.test(phone) || (phone.match(/\d/g) ?? []).length < 7) {
    return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const snapshot = await db.collection("businesses").doc(DEMO_BUSINESS_ID).get();
  if (!snapshot.exists) return NextResponse.json({ error: "Demo tenant not found" }, { status: 404 });
  const config = snapshot.data() as BusinessConfig;
  const provider = getVoiceProvider(config);
  if (provider.id !== "elevenlabs" || !provider.isConfigured(config)) {
    return NextResponse.json({ error: "Demo line is not ready for ElevenLabs test calls" }, { status: 409 });
  }

  const firstMessage = buildInitiationResponse(config, undefined, new Date())
    .conversation_config_override.agent?.first_message;
  const call = await provider.startOutboundCall({
    config,
    targetPhone: phone,
    metadata: { businessId: DEMO_BUSINESS_ID, source: "demo-studio-test-call" },
    variables: { callType: "demo-test" },
    ...(firstMessage ? { firstMessage } : {}),
  });
  return NextResponse.json({ ok: true, callId: call.callId });
}
