import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase/admin";

// GET /api/auth/profile — the current session's businessUsers/{uid} doc,
// merged over { uid, email } from the verified ID token.
//
// Replaces AuthContext's client-side `getDoc(doc(db, "businessUsers", uid))`
// call, which was the last thing pulling the ~281KB @firebase/firestore
// bundle into every authenticated page (admin, hub, and company layouts all
// mount AuthProvider). This is a server-verified equivalent with the exact
// same output shape (a raw spread of the doc's fields), so every consumer of
// useAuth() — admin/hub layouts (superadmin check), company/settings
// (canManageTeam), FeedbackForm, QuickAddContext, useBusinessId — is
// unaffected by this move; only AuthContext.tsx itself changes.
//
// Auth is the __session cookie itself (the ID token), so there's no
// businessId to check membership against here — this route answers "who is
// the caller", not "does the caller belong to business X".
export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("__session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const decoded = await verifyIdToken(sessionCookie);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const profile: Record<string, unknown> = { uid: decoded.uid, email: decoded.email ?? null };

  const db = getAdminFirestore();
  if (db) {
    const snap = await db.collection("businessUsers").doc(decoded.uid).get();
    if (snap.exists) Object.assign(profile, snap.data());
  }

  return NextResponse.json({ profile });
}
