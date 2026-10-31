import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase/admin";
import { LEGAL_VERSION } from "@/lib/legal/version";

// POST /api/auth/terms — the record behind the no-friction "By signing in, you … agree to the Terms" line on /login
// (owner, 2026-10-30). The login page calls it right after a successful sign-in with the fresh ID token in the
// Authorization header (the __session cookie is still a placeholder at that moment). One write-once doc per person and
// version in legalAcceptances (server-only; Firestore rules default-deny), so the evidence can't be edited from a browser.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const decoded = token ? await verifyIdToken(token) : null;
  if (!decoded) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection("legalAcceptances").doc(`${decoded.uid}_${LEGAL_VERSION}`);
  try {
    await ref.create({
      uid: decoded.uid,
      email: decoded.email ?? null,
      version: LEGAL_VERSION,
      documents: ["terms", "privacy", "sms"],
      ageConfirmed18: true,
      via: "sign-in",
      acceptedAt: Date.now(),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch (err) {
    // ALREADY_EXISTS (gRPC 6): this person already accepted this version — the first record is the one that counts.
    if ((err as { code?: number }).code !== 6) throw err;
  }
  return NextResponse.json({ ok: true, version: LEGAL_VERSION });
}
