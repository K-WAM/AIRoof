import { NextResponse } from "next/server";
import { getCapabilityReport } from "@/lib/config/env";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const db = getAdminFirestore();
    const capabilities = getCapabilityReport();

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      firestore: db ? "connected" : "disconnected",
      capabilities,
    });
  } catch (error) {
    console.error("GET /api/health error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
