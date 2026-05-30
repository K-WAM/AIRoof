import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// POST /api/admin/businesses/[businessId]/provision-login
// Creates a Firebase Auth user + businessUsers doc for an existing business.
// Safe to call on a business that already has a user — will update the businessUsers doc.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;
  const body = await req.json();
  const { ownerEmail } = body;

  if (!ownerEmail || typeof ownerEmail !== "string") {
    return NextResponse.json({ error: "ownerEmail required" }, { status: 400 });
  }

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const tempPassword = generateTempPassword();
  let uid: string;

  try {
    const existing = await auth.getUserByEmail(ownerEmail);
    uid = existing.uid;
    await auth.updateUser(uid, { password: tempPassword });
  } catch {
    const created = await auth.createUser({ email: ownerEmail, password: tempPassword, emailVerified: false });
    uid = created.uid;
  }

  await db.collection("businessUsers").doc(uid).set({
    uid,
    businessId,
    email: ownerEmail,
    role: "owner",
    active: true,
    createdAt: Date.now(),
  }, { merge: true });

  return NextResponse.json({ success: true, loginEmail: ownerEmail, tempPassword });
}
