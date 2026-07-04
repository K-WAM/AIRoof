import { NextRequest, NextResponse } from "next/server";
import type { AgentAction } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import {
  checkAvailability,
  bookAppointment,
  createLead,
  escalateCall,
  logAgentAction,
} from "@/lib/tools/agentTools";

interface ExecuteToolRequest {
  businessId: string;
  callId: string;
  toolName: string;
  input: any;
}

export async function POST(request: NextRequest): Promise<NextResponse<any | { error: string }>> {
  // Tool test endpoint (live calls execute tools via the Vapi webhook).
  // Superadmin-only — books/escalates/creates leads, so it must not be public.
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  try {
    const body: ExecuteToolRequest = await request.json();
    const { businessId, callId, toolName, input } = body;

    if (!businessId || !callId || !toolName || !input) {
      return NextResponse.json(
        { error: "Missing required fields: businessId, callId, toolName, input" },
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

    // Validate business exists
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} not found` },
        { status: 404 }
      );
    }

    const actionId = `action_${Date.now()}`;
    let output: any;
    let status: "success" | "failed" = "success";
    let errorMessage = "";

    try {
      switch (toolName) {
        case "checkAvailability":
          output = await checkAvailability({
            businessId,
            ...input,
          });
          break;

        case "bookAppointment":
          output = await bookAppointment({
            businessId,
            ...input,
            sourceCallId: callId,
          });
          break;

        case "createLead":
          output = await createLead({
            businessId,
            ...input,
            sourceCallId: callId,
          });
          break;

        case "escalateCall":
          output = await escalateCall({
            businessId,
            callId,
            ...input,
          });
          break;

        default:
          return NextResponse.json(
            { error: `Unknown tool: ${toolName}` },
            { status: 400 }
          );
      }
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
      output = { error: errorMessage };
    }

    // Log the action
    const action: AgentAction = {
      actionId,
      businessId,
      callId,
      type: toolName as any,
      input,
      output,
      status,
      createdAt: Date.now(),
    };

    await logAgentAction(action);

    return NextResponse.json({
      actionId,
      toolName,
      status,
      output,
    });
  } catch (error) {
    console.error("POST /api/tools/execute error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
