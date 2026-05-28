import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase/admin";

export type AllowedRole = "owner" | "staff" | "viewer" | "superadmin";

export interface VerifiedUser {
  uid: string;
  email?: string;
  superadmin: boolean;
  role?: AllowedRole;
  businessId?: string;
}

/**
 * Verifies the __session cookie and checks that the caller has one of the
 * allowed roles for the given businessId. Superadmins always pass.
 *
 * Returns { user } on success, or a NextResponse error (403/401) that callers
 * should return immediately.
 */
export async function verifyAuthAndRole(
  req: NextRequest,
  businessId: string,
  allowedRoles: AllowedRole[]
): Promise<{ user: VerifiedUser } | { error: NextResponse }> {
  const sessionCookie = req.cookies.get("__session")?.value;
  if (!sessionCookie) {
    return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }

  const decoded = await verifyIdToken(sessionCookie);
  if (!decoded) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }

  // Superadmins bypass role checks
  if (decoded.superadmin === true) {
    return { user: { uid: decoded.uid, email: decoded.email, superadmin: true } };
  }

  // Look up business membership
  const db = getAdminFirestore();
  if (!db) {
    return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  }

  const memberSnap = await db
    .collection("businessUsers")
    .where("uid", "==", decoded.uid)
    .where("businessId", "==", businessId)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (memberSnap.empty) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const member = memberSnap.docs[0].data() as { role: AllowedRole; businessId: string };

  if (!allowedRoles.includes(member.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user: {
      uid: decoded.uid,
      email: decoded.email,
      superadmin: false,
      role: member.role,
      businessId: member.businessId,
    },
  };
}
