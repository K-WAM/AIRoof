import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const db = getAdminFirestore();

    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        firestore: db ? "connected" : "disconnected",
        openai: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
        deepseek: process.env.DEEPSEEK_API_KEY ? "configured" : "not_configured",
      },
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error("GET /api/health error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
