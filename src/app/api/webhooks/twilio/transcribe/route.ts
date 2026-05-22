import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "twilio";
import type { BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { classifyMessage, getOffTopicResponse } from "@/lib/ai/scopeClassifier";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { generateAgentResponse } from "@/lib/ai/openaiClient";
import { getTwilioSayVoice } from "@/lib/twilio/voice";

export async function POST(request: NextRequest): Promise<NextResponse<string | { error: string }>> {
  try {
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId");
    const callId = url.searchParams.get("callId");

    const text = await request.text();
    const params = new URLSearchParams(text);

    const speechResult = params.get("SpeechResult");
    const confidence = params.get("Confidence");
    const callSid = params.get("CallSid");

    if (!speechResult || !callSid || !businessId || !callId) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, I didn't understand. Please try again.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
      );
    }

    // Verify Twilio signature in production
    // Twilio signs the full URL it POSTed to (including query params we set in the action URL)
    // plus the POST body params. Reconstruct the exact URL Twilio saw.
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const sig = request.headers.get("x-twilio-signature") ?? "";
      const host = request.headers.get("host") ?? "";
      const webhookUrl = `https://${host}${url.pathname}${url.search}`;
      const formData: Record<string, string> = {};
      params.forEach((value, key) => { formData[key] = value; });

      if (!validateRequest(authToken, sig, webhookUrl, formData)) {
        console.warn("Invalid Twilio signature on transcribe — url:", webhookUrl);
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const db = getAdminFirestore();
    if (!db) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are temporarily unavailable.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
      );
    }

    // Load business config directly — no collection scan needed
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, business not found.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
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
      const callRef = db
        .collection("businesses")
        .doc(businessId)
        .collection("calls")
        .doc(callId);

      const callSnap = await callRef.get();
      const messages = (callSnap.data()?.messages as unknown[]) ?? [];
      messages.push({
        role: "caller",
        text: speechResult,
        confidence: parseFloat(confidence ?? "0"),
        timestamp: Date.now(),
      });
      messages.push({
        role: "agent",
        text: responseText,
        timestamp: Date.now(),
      });
      await callRef.update({ messages, updatedAt: Date.now() });
    } catch (error) {
      console.error("Failed to log messages:", error);
    }

    const agentVoice = getTwilioSayVoice(businessConfig.agentVoice);
    const host = request.headers.get("host") ?? "";
    const transcribeUrl = `https://${host}/api/webhooks/twilio/transcribe?businessId=${businessId}&callId=${encodeURIComponent(callId)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${agentVoice}">${escapeXml(responseText)}</Say>
  <Gather input="speech" timeout="5" maxSpeechTime="15" action="${escapeXml(transcribeUrl)}" method="POST">
    <Say voice="${agentVoice}">Is there anything else I can help you with?</Say>
  </Gather>
  <Say>Thank you for calling. Have a great day!</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("POST /api/webhooks/twilio/transcribe error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we encountered an error.</Say><Hangup/></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml" } }
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
