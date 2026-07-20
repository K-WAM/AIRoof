import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";

export function requireCronAuth(
  request: NextRequest,
): NextResponse | null {
  const cronSecret = getEnv("CRON_SECRET");
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron authentication is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
