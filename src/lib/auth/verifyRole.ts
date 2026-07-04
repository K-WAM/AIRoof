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
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
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

/**
 * Guard for superadmin-only routes (e.g. all of /api/admin/*). Pass the
 * NextRequest; returns { user } if the caller is a superadmin, otherwise a
 * 401/403 NextResponse the caller should return immediately.
 *
 * Auth is cookie-based (__session holds the Firebase ID token, set by
 * AuthContext), so same-origin fetches from the admin UI are authorized
 * automatically — no Authorization header needed.
 */
export async function verifySuperadmin(
  req: NextRequest
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
  return verifyAuthAndRole(req, "", ["superadmin"]);
}

/**
 * Guard for the field data plane (jobs list, voice updates, photos). Two ways in:
 *   1. A logged-in session with any role on the business (or superadmin) — covers
 *      staff opening /field while signed in (same-origin fetch sends the cookie).
 *   2. A per-business field key — `x-field-key` header or `?key=` query param —
 *      matching `businesses/{businessId}.fieldKey`. This is what the QR code
 *      carries so unauthenticated crews can submit voice updates from a phone.
 *
 * Secure by default: a business with no fieldKey configured has NO anonymous
 * access — only sessions pass.
 */
export async function verifyFieldAccess(
  req: NextRequest,
  businessId: string
): Promise<{ user: VerifiedUser } | { error: NextResponse<{ error: string }> }> {
  if (!businessId) {
    return { error: NextResponse.json({ error: "businessId required" }, { status: 400 }) };
  }

  // Path 1: session (staff/owner/viewer of this business, or superadmin)
  if (req.cookies.get("__session")?.value) {
    const byRole = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
    if ("user" in byRole) return byRole;
    // fall through — a stale/foreign session may still carry a valid field key
  }

  // Path 2: field key from the QR link
  const key = req.headers.get("x-field-key") ?? req.nextUrl.searchParams.get("key");
  if (key) {
    const db = getAdminFirestore();
    if (!db) {
      return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
    }
    const snap = await db.collection("businesses").doc(businessId).get();
    const fieldKey = snap.data()?.fieldKey;
    if (typeof fieldKey === "string" && fieldKey.length >= 16 && fieldKey === key) {
      return { user: { uid: `field:${businessId}`, superadmin: false, role: "viewer", businessId } };
    }
  }

  return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
}
