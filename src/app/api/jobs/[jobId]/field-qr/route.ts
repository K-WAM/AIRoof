import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { mintFieldExchangeToken, verifyAuthAndRole } from "@/lib/auth/verifyRole";

// POST /api/jobs/[jobId]/field-qr — mint a one-time, ten-minute field-access
// grant scoped to this job, for staff to hand off (as a QR code or a texted
// link) to a crew member who has no portal login. Same signed-grant primitive
// Demo Studio already uses for the live demo line (mintFieldExchangeToken),
// just wired up for a real tenant's real jobs.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  let body: { businessId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { businessId } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const [jobSnap, businessSnap] = await Promise.all([
    businessRef.collection("jobs").doc(jobId).get(),
    businessRef.get(),
  ]);
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!businessSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // Lazily provision the business's field key the first time it's needed —
  // same pattern demo-customize/route.ts already uses. Rotating this key
  // later (a real "revoke all field access" lever) invalidates every
  // outstanding grant/session at once; nothing else needs to change for that.
  let fieldKey = businessSnap.data()?.fieldKey;
  if (typeof fieldKey !== "string" || fieldKey.length < 16) {
    fieldKey = randomBytes(16).toString("hex");
    await businessRef.set({ fieldKey }, { merge: true });
  }

  let grant;
  try {
    grant = mintFieldExchangeToken(businessId, fieldKey, jobId);
  } catch {
    return NextResponse.json({ error: "Field access is not configured" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    fieldUrl: `${req.nextUrl.origin}/api/field/exchange?grant=${encodeURIComponent(grant.token)}`,
    expiresAt: grant.expiresAt,
  });
}
