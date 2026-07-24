import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendFeedbackEmail } from "@/lib/notify";

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  let body: { businessId?: string; message?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { businessId, message, category } = body;

  if (!businessId || typeof businessId !== "string") {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  if (category !== undefined && (typeof category !== "string" || category.length > 100)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const auth = await verifyAuthAndRole(request, businessId, [
    "owner",
    "staff",
    "viewer",
    "superadmin",
  ]);
  if ("error" in auth) return auth.error;

  const result = await sendFeedbackEmail({
    businessName: businessId,
    submitterName: auth.user.email ?? auth.user.uid,
    submitterEmail: auth.user.email ?? "",
    businessId,
    category: category?.trim() || undefined,
    message: message.trim(),
  });

  if (result.status === "unconfigured") {
    return NextResponse.json(
      { error: "Email service is not configured — feedback could not be sent" },
      { status: 503 },
    );
  }

  if (result.status !== "delivered") {
    return NextResponse.json(
      { error: "Failed to send feedback — please try again later" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
