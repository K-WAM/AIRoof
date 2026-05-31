import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const d = snap.data()!;
  return NextResponse.json({
    timezone: d.timezone ?? "America/New_York",
    businessHours: d.businessHours ?? {},
    notificationEmail: d.notificationEmail ?? "",
    contactPhone: d.contactPhone ?? "",
    contactEmail: d.contactEmail ?? "",
    businessName: d.businessName ?? "",
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { businessId, timezone, businessHours, notificationEmail, contactPhone, contactEmail } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (timezone) update.timezone = timezone;
  if (businessHours) update.businessHours = businessHours;
  if (notificationEmail !== undefined) update.notificationEmail = notificationEmail;
  if (contactPhone !== undefined) update.contactPhone = contactPhone;
  if (contactEmail !== undefined) update.contactEmail = contactEmail;

  await db.collection("businesses").doc(businessId).update(update);

  // Bust timezone cache: client sessionStorage is client-side, no server action needed
  return NextResponse.json({ ok: true });
}
