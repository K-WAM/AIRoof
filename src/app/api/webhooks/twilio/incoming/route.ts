import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

// Twilio webhook for incoming calls
// This endpoint receives the initial webhook when a call comes in to the business number
// For now, returns TwiML to accept the call (real audio processing deferred)

interface TwilioWebhookBody {
  CallSid: string;
  From: string;
  To: string;
  AccountSid: string;
  Direction?: string;
  CallStatus?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<string | { error: string }>> {
  try {
    // Parse Twilio form-encoded body
    const text = await request.text();
    const params = new URLSearchParams(text);

    const callSid = params.get("CallSid");
    const from = params.get("From");
    const to = params.get("To");

    if (!callSid || !from || !to) {
      console.warn("Missing Twilio webhook parameters");
      return NextResponse.json(
        { error: "Invalid Twilio webhook" },
        { status: 400 }
      );
    }

    // Map incoming 'to' number to business ID
    // TODO: Implement number-to-business mapping
    const businessId = await mapPhoneToBusinessId(to);
    if (!businessId) {
      // Return error TwiML
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we could not process your call. Please try again later.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    // Create call record in Firestore
    const db = getAdminFirestore();
    if (!db) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we are temporarily unavailable. Please try again later.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    try {
      const callId = `call_${callSid}`;
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

    // Return TwiML to gather speech input and route to /api/webhooks/twilio/transcribe
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="3" maxSpeechTime="10" action="/api/webhooks/twilio/transcribe" method="POST">
    <Say>Thank you for calling. Please tell me how I can help you.</Say>
  </Gather>
  <Say>Sorry, I did not understand. Please call back and try again.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("POST /api/webhooks/twilio/incoming error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we are unable to process your call. Please try again later.</Say>
  <Hangup/>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }
}

async function mapPhoneToBusinessId(phoneNumber: string): Promise<string | null> {
  // TODO: Implement phone number to business mapping
  // For now, hardcode demo business
  if (phoneNumber.includes("604") || phoneNumber === "+16045551234") {
    return "demo-roofing";
  }
  return null;
}
