import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "twilio";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function POST(request: NextRequest): Promise<NextResponse<string | { error: string }>> {
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);

    const callSid = params.get("CallSid");
    const from = params.get("From");
    const to = params.get("To");

    if (!callSid || !from || !to) {
      console.warn("Missing Twilio webhook parameters");
      return NextResponse.json({ error: "Invalid Twilio webhook" }, { status: 400 });
    }

    // Verify Twilio signature in production
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const sig = request.headers.get("x-twilio-signature") ?? "";
      const host = request.headers.get("host") ?? "";
      const webhookUrl = `https://${host}${new URL(request.url).pathname}`;
      const formData: Record<string, string> = {};
      params.forEach((value, key) => { formData[key] = value; });

      if (!validateRequest(authToken, sig, webhookUrl, formData)) {
        console.warn("Invalid Twilio signature");
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const businessId = await mapPhoneToBusinessId(to);
    if (!businessId) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we could not process your call. Please try again later.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are temporarily unavailable. Please try again later.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
      );
    }

    const callId = `call_${callSid}`;

    // Load business config to get greeting
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    const businessData = businessDoc.data();

    // Determine greeting based on business hours
    const greeting = businessData?.greeting ?? "Thanks for calling. How can I help you today?";

    try {
      await db
        .collection("businesses")
        .doc(businessId)
        .collection("calls")
        .doc(callId)
        .set({
          callId,
          businessId,
          callSid,
          callerPhone: from,
          inboundNumber: to,
          status: "active",
          startedAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        });
    } catch (error) {
      console.error("Failed to create call record:", error);
    }

    const agentVoice = businessData?.agentVoice ?? "alloy";
    const transcribeUrl = `/api/webhooks/twilio/transcribe?businessId=${businessId}&callId=${encodeURIComponent(callId)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" maxSpeechTime="15" action="${transcribeUrl}" method="POST">
    <Say voice="${agentVoice}">${escapeXml(greeting)}</Say>
  </Gather>
  <Say>Sorry, I didn't catch that. Please call back and try again.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("POST /api/webhooks/twilio/incoming error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are unable to process your call. Please try again later.</Say><Hangup/></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml" } }
    );
  }
}

async function mapPhoneToBusinessId(twilioTo: string): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db) return null;

  try {
    const snap = await db
      .collection("businessPhoneNumbers")
      .where("normalizedPhoneNumber", "==", twilioTo)
      .where("active", "==", true)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0].data().businessId;
  } catch (error) {
    console.error("Phone mapping lookup failed:", error);
    return null;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
