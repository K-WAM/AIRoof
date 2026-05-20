import { NextRequest, NextResponse } from "next/server";
import type { BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { classifyMessage, getOffTopicResponse } from "@/lib/ai/scopeClassifier";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { generateAgentResponse } from "@/lib/ai/openaiClient";

// Twilio webhook that receives transcribed speech and returns voice response
interface TwilioTranscribeBody {
  SpeechResult: string;
  Confidence: string;
  CallSid: string;
  From?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<string | { error: string }>> {
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);

    const speechResult = params.get("SpeechResult");
    const confidence = params.get("Confidence");
    const callSid = params.get("CallSid");

    if (!speechResult || !callSid) {
      console.warn("Missing Twilio transcribe parameters");
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, I did not understand. Please try again.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we are temporarily unavailable.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    // Find the call record by CallSid
    const callId = `call_${callSid}`;
    let businessId = "";

    try {
      // Query all businesses to find the call (this is a simplified approach)
      // TODO: Index by callSid for faster lookup
      const businessesSnapshot = await db.collection("businesses").get();
      for (const businessDoc of businessesSnapshot.docs) {
        const callDoc = await businessDoc.ref.collection("calls").doc(callId).get();
        if (callDoc.exists) {
          businessId = businessDoc.id;
          break;
        }
      }
    } catch (error) {
      console.error("Failed to find call record:", error);
    }

    if (!businessId) {
      console.error(`Call ${callId} not found`);
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we could not process your call.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    // Load business config
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, business not found.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;

    // DEFENSE LAYER 1: Classify message
    const classification = classifyMessage(speechResult, businessConfig);

    let responseText = "";
    if (!classification.allowedToAnswer) {
      responseText = getOffTopicResponse(businessConfig);
    } else {
      // DEFENSE LAYER 2: Build prompt and call OpenAI
      const systemPrompt = buildAgentPrompt(businessConfig);
      responseText = await generateAgentResponse({
        systemPrompt,
        userMessage: speechResult,
        model: businessConfig.liveModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: businessConfig.temperature ?? 0.5,
        maxTokens: businessConfig.maxTokens ?? 150,
      });
    }

    // Log the exchange
    try {
      const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);
      const callDataSnapshot = await callRef.get();
      if (callDataSnapshot.exists) {
        const messages = (callDataSnapshot.data()?.messages as unknown[]) || [];
        messages.push({
          role: "caller",
          text: speechResult,
          confidence: parseFloat(confidence || "0"),
          timestamp: Date.now(),
        });
        messages.push({
          role: "agent",
          text: responseText,
          timestamp: Date.now(),
        });
        await callRef.update({ messages, updatedAt: Date.now() });
      }
    } catch (error) {
      console.error("Failed to log messages:", error);
    }

    // Return TwiML with voice response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(responseText)}</Say>
  <Gather input="speech" timeout="3" maxSpeechTime="10" action="/api/webhooks/twilio/transcribe" method="POST" numDigits="1">
    <Say>Press 1 to schedule an appointment, or speak to leave a message.</Say>
  </Gather>
  <Say>Thank you for calling. Goodbye.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("POST /api/webhooks/twilio/transcribe error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we encountered an error.</Say>
  <Hangup/>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      }
    );
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
