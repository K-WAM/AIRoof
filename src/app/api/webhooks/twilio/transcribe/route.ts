import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "twilio";
import type { BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { classifyMessage, getOffTopicResponse } from "@/lib/ai/scopeClassifier";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { generateAgentResponse, type ConversationTurn } from "@/lib/ai/openaiClient";
import { getTwilioSayVoice } from "@/lib/twilio/voice";

interface StoredMessage {
  role: "caller" | "agent";
  text: string;
  timestamp?: number;
  confidence?: number;
}

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

    // Verify Twilio signature in production.
    // Twilio signs the full URL it POSTed to (including query params we set in
    // the TwiML action attribute) plus the POST body params.
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

    const businessRef = db.collection("businesses").doc(businessId);
    const callRef = businessRef.collection("calls").doc(callId);

    // Parallel: load business config + prior conversation history
    const [businessDoc, callDoc] = await Promise.all([
      businessRef.get(),
      callRef.get(),
    ]);

    if (!businessDoc.exists) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, business not found.</Say><Hangup/></Response>`,
        { status: 200, headers: { "Content-Type": "application/xml" } }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;
    const priorMessages = (callDoc.data()?.messages as StoredMessage[] | undefined) ?? [];

    // Convert stored messages to OpenAI conversation history
    const history: ConversationTurn[] = priorMessages.map((m) => ({
      role: m.role === "caller" ? "user" : "assistant",
      content: m.text,
    }));

    // DEFENSE LAYER 1: Classify message
    const classification = classifyMessage(speechResult, businessConfig);

    let responseText = "";
    if (!classification.allowedToAnswer) {
      responseText = getOffTopicResponse(businessConfig);
    } else {
      // DEFENSE LAYER 2: Build prompt + call OpenAI with full conversation history
      const systemPrompt = buildAgentPrompt(businessConfig, { midConversation: history.length > 0 });
      responseText = await generateAgentResponse({
        systemPrompt,
        userMessage: speechResult,
        history,
        model: businessConfig.liveModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: businessConfig.temperature ?? 0.5,
        maxTokens: businessConfig.maxTokens ?? 150,
      });
    }

    // Append this exchange to the call record
    try {
      const updatedMessages = [
        ...priorMessages,
        {
          role: "caller" as const,
          text: speechResult,
          confidence: parseFloat(confidence ?? "0"),
          timestamp: Date.now(),
        },
        {
          role: "agent" as const,
          text: responseText,
          timestamp: Date.now(),
        },
      ];
      await callRef.update({ messages: updatedMessages, updatedAt: Date.now() });
    } catch (error) {
      console.error("Failed to log messages:", error);
    }

    const agentVoice = getTwilioSayVoice(businessConfig.agentVoice);
    const host = request.headers.get("host") ?? "";
    const transcribeUrl = `https://${host}/api/webhooks/twilio/transcribe?businessId=${businessId}&callId=${encodeURIComponent(callId)}`;

    // Put Roofus's response INSIDE the Gather so the listener starts
    // immediately after he finishes speaking — no second prompt unless
    // the caller actually stays silent past the timeout.
    // speechTimeout="auto" uses Twilio's voice activity detection so we
    // don't wait a fixed 5s of silence to decide the caller is done.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="6" speechTimeout="auto" maxSpeechTime="30" action="${escapeXml(transcribeUrl)}" method="POST">
    <Say voice="${agentVoice}">${escapeXml(responseText)}</Say>
  </Gather>
  <Pause length="1"/>
  <Gather input="speech" timeout="4" speechTimeout="auto" maxSpeechTime="30" action="${escapeXml(transcribeUrl)}" method="POST">
    <Say voice="${agentVoice}">Are you still there?</Say>
  </Gather>
  <Say voice="${agentVoice}">Thanks for calling. Goodbye.</Say>
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
