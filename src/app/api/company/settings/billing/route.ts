import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { effectiveBillingPrefs, parseBillingPrefs } from "@/lib/billing/customerPayments";

// Settings → Getting paid (Billing product). GET: how this business's customers pay it. PUT { businessId, payInstructions?,
// payLink?, remindersOn?, dueDays? }: owner only — it is printed on every invoice and reminder, so staff can't change
// where the money goes. Validation lives in customerPayments.ts (parseBillingPrefs); a pay link must be https.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return jsonWithCache({ prefs: effectiveBillingPrefs(snap.data()) }, "noStore");
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const businessId = typeof body?.businessId === "string" ? body.businessId : "";
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const parsed = parseBillingPrefs({ payInstructions: body!.payInstructions, payLink: body!.payLink, remindersOn: body!.remindersOn, dueDays: body!.dueDays });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(businessId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const next = { ...(snap.data()?.billingPrefs ?? {}), ...parsed.prefs };
  await ref.update({ billingPrefs: next, updatedAt: Date.now() });
  return NextResponse.json({ prefs: effectiveBillingPrefs({ billingPrefs: next }) });
}
