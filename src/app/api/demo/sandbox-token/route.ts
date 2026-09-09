// Public, unauthenticated endpoint that lets a prospect enter the REAL company
// portal (Pipeline, Calendar, Jobs incl. materials/labor/invoicing, Library)
// for the shared demo business — not a mockup, the actual app — as a
// read-only "viewer" role, without any password or account of their own.
//
// Safety model (not new machinery — this composes two guards that already
// exist and are independently tested):
//   1. Hardcoded, allowlisted target business (never client-supplied) — this
//      route can never be pointed at a real tenant, mirroring the same
//      isAllowedDemoBusiness pattern demo-customize/route.ts uses.
//   2. "viewer" is a role every write path already excludes: every mutating
//      API route gates to ["owner","staff","superadmin"] (viewer omitted —
//      see jobs/route.ts, jobs/[jobId]/route.ts, company/team/*, etc.), and
//      firestore.rules' isBusinessOwnerOrStaff() (the function every
//      client-side Firestore write in the company UI depends on) excludes
//      "viewer" too. So this sandbox identity can read everything a real
//      viewer teammate could, and can write nothing, on both write paths the
//      app has (API routes and direct client Firestore writes).
//
// One shared Firebase Auth identity is reused across every visitor (find-or-
// create, idempotent) rather than minting a new user per request — the data
// is a shared sandbox regardless, so there's nothing to gain from per-visitor
// identities, and it keeps this endpoint cheap to hit repeatedly.
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";

const SANDBOX_BUSINESS_ID = "demo-roofing";
const SANDBOX_EMAIL = "sandbox-visitor@luxordev.com";

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 20, keyPrefix: "demo-sandbox-token" });
  if (limited) return limited;

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) {
    return NextResponse.json({ error: "Sandbox unavailable" }, { status: 503 });
  }

  // Guard: only ever the hardcoded demo business, and only if it's still
  // actually marked as a demo (the same isDemo marker demo-customize/route.ts
  // requires before it will touch a business at all).
  const bizSnap = await db.collection("businesses").doc(SANDBOX_BUSINESS_ID).get();
  if (!bizSnap.exists || bizSnap.data()?.isDemo !== true) {
    return NextResponse.json({ error: "Sandbox unavailable" }, { status: 503 });
  }

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(SANDBOX_EMAIL);
    uid = existing.uid;
  } catch {
    const created = await auth.createUser({
      email: SANDBOX_EMAIL,
      emailVerified: true,
      displayName: "Demo Sandbox Visitor",
      // No password set — this identity only ever signs in via the custom
      // token minted below, so email/password sign-in is simply never wired.
    });
    uid = created.uid;
  }

  // Idempotent upsert. Persists across Demo Studio relaunches — resets only
  // touch demo-roofing's calls/leads/appointments/crews/jobs subcollections,
  // never the top-level businessUsers collection this doc lives in.
  await db.collection("businessUsers").doc(uid).set(
    {
      uid,
      businessId: SANDBOX_BUSINESS_ID,
      email: SANDBOX_EMAIL,
      role: "viewer",
      active: true,
      isSandboxVisitor: true,
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  const token = await auth.createCustomToken(uid);
  return NextResponse.json({ token });
}
