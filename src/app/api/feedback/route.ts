import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendFeedbackEmail } from "@/lib/notify";

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  // Authenticated, but uncapped per user until now — nobody legitimately
  // submits feedback more than a few times a minute.
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 10, keyPrefix: "feedback" });
  if (limited) return limited;

  let body: { businessId?: string; message?: string; category?: string; page?: string };
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

  // A path like "/company/calendar" only — anything else is dropped, never echoed into the email.
  const page = typeof body.page === "string" && /^\/[\w\-/[\]]{0,120}$/.test(body.page) ? body.page : undefined;

  // Crew (field-only) logins can send feedback too — they are users of the app like everyone else.
  const auth = await verifyAuthAndRole(request, businessId, [
    "owner",
    "staff",
    "viewer",
    "crew",
    "superadmin",
  ]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  const bizDoc = await db?.collection("businesses").doc(businessId).get();
  const businessName = (bizDoc?.data()?.businessName as string | undefined) ?? businessId;

  const result = await sendFeedbackEmail({
    businessName,
    submitterName: auth.user.email ?? auth.user.uid,
    submitterEmail: auth.user.email ?? "",
    businessId,
    category: category?.trim() || undefined,
    message: message.trim(),
    page,
    role: auth.user.superadmin ? "superadmin" : auth.user.role,
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
