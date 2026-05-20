import { NextRequest, NextResponse } from "next/server";
import type { AgentResponse, BusinessConfig } from "@/types";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase/admin";
import { classifyMessage, getOffTopicResponse } from "@/lib/ai/scopeClassifier";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { generateAgentResponse } from "@/lib/ai/openaiClient";

interface RespondRequest {
  businessId: string;
  callId: string;
  callerMessage: string;
  callerPhone?: string;
  idToken?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AgentResponse | { error: string }>> {
  try {
    const body: RespondRequest = await request.json();
    const { businessId, callId, callerMessage, callerPhone, idToken } = body;

    // Validate required fields
    if (!businessId || !callId || !callerMessage) {
      return NextResponse.json(
        { error: "Missing required fields: businessId, callId, callerMessage" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "Firestore not available" },
        { status: 500 }
      );
    }

    // Load business config to validate and get constraints
    const businessRef = db.collection("businesses").doc(businessId);
    const businessDoc = await businessRef.get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const businessConfig = businessDoc.data() as BusinessConfig;
    if (!businessConfig.active) {
      return NextResponse.json(
        { error: `Business ${businessId} is inactive` },
        { status: 403 }
      );
    }

    // DEFENSE LAYER 1: Deterministic scope classification BEFORE model call
    const classification = classifyMessage(callerMessage, businessConfig);

    if (!classification.allowedToAnswer) {
      const offTopicResponse: AgentResponse = {
        text: getOffTopicResponse(businessConfig),
        classification,
        allowedToAnswer: false,
        callId,
      };

      // Log the off-topic message for auditing
      await logCallMessage(db, businessId, callId, {
        role: "caller",
        text: callerMessage,
        classification,
        timestamp: Date.now(),
      });

      // Log the off-topic response
      await logCallMessage(db, businessId, callId, {
        role: "agent",
        text: offTopicResponse.text,
        classification: { category: "off_topic", confidence: 1.0, reason: "Off-topic guard activated", allowedToAnswer: false },
        timestamp: Date.now(),
      });

      return NextResponse.json(offTopicResponse);
    }

    // DEFENSE LAYER 2: Build system prompt from business config (constraints)
    const systemPrompt = buildAgentPrompt(businessConfig);

    // DEFENSE LAYER 3: Call OpenAI with constraints
    const agentText = await generateAgentResponse({
      systemPrompt,
      userMessage: callerMessage,
      model: businessConfig.liveModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: businessConfig.temperature ?? 0.5,
      maxTokens: businessConfig.maxTokens ?? 150,
    });

    const agentResponse: AgentResponse = {
      text: agentText,
      classification,
      allowedToAnswer: true,
      callId,
    };

    // Log both caller message and agent response
    await logCallMessage(db, businessId, callId, {
      role: "caller",
      text: callerMessage,
      classification,
      timestamp: Date.now(),
    });

    await logCallMessage(db, businessId, callId, {
      role: "agent",
      text: agentText,
      classification: { category: "response", confidence: 1.0, reason: "Generated response", allowedToAnswer: true },
      timestamp: Date.now(),
    });

    return NextResponse.json(agentResponse);
  } catch (error) {
    console.error("POST /api/agent/respond error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function logCallMessage(
  db: any,
  businessId: string,
  callId: string,
  message: { role: string; text: string; classification: any; timestamp: number }
) {
  try {
    const callRef = db.collection("businesses").doc(businessId).collection("calls").doc(callId);
    const callDoc = await callRef.get();

    if (!callDoc.exists) {
      await callRef.set({
        callId,
        businessId,
        status: "active",
        messages: [message],
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await callRef.update({
        messages: ((callDoc.data()?.messages as unknown[]) || []).concat(message),
        updatedAt: Date.now(),
      });
    }
  } catch (error) {
    console.error("logCallMessage error:", error);
  }
}
