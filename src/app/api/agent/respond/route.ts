import { NextRequest, NextResponse } from "next/server";
import type { AgentResponse, BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { classifyMessage, getOffTopicResponse } from "@/lib/ai/scopeClassifier";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { generateAgentResponse } from "@/lib/ai/openaiClient";
import { selectModel } from "@/lib/ai/registry";

interface RespondRequest {
  businessId: string;
  callId: string;
  callerMessage: string;
  callerPhone?: string;
  idToken?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AgentResponse | { error: string }>> {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  try {
    const body: RespondRequest = await request.json();
    const { businessId, callId, callerMessage } = body;

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

    const classification = classifyMessage(callerMessage, businessConfig);

    if (!classification.allowedToAnswer) {
      const offTopicResponse: AgentResponse = {
        text: getOffTopicResponse(businessConfig),
        classification,
        allowedToAnswer: false,
        callId,
      };

      await logCallMessage(db, businessId, callId, {
        role: "caller",
        text: callerMessage,
        classification,
        timestamp: Date.now(),
      });

      await logCallMessage(db, businessId, callId, {
        role: "agent",
        text: offTopicResponse.text,
        classification: { category: "off_topic", confidence: 1.0, reason: "Off-topic guard activated", allowedToAnswer: false },
        timestamp: Date.now(),
      });

      return NextResponse.json(offTopicResponse);
    }

    const systemPrompt = buildAgentPrompt(businessConfig);
    const modelSelection = selectModel("agent-respond", {
      liveModel: businessConfig.liveModel,
      backOfficeModel: businessConfig.backOfficeModel,
    });

    const agentText = await generateAgentResponse({
      systemPrompt,
      userMessage: callerMessage,
      model: modelSelection.model,
      temperature: businessConfig.temperature ?? 0.5,
      maxTokens: businessConfig.maxTokens ?? 150,
      modelOverrides: {
        liveModel: businessConfig.liveModel,
        backOfficeModel: businessConfig.backOfficeModel,
      },
    });

    const agentResponse: AgentResponse = {
      text: agentText,
      classification,
      allowedToAnswer: true,
      callId,
    };

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
