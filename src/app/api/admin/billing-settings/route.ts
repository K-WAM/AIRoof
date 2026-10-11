import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { luxorZelleTo } from "@/lib/billing/luxorNotices";
import { loadLuxorZelleTo, PAY_SETTINGS_DOC, validZelleTo } from "@/lib/billing/luxorPaySettings";

// How clients pay Luxor (the Invoices page's "How clients pay you" form). Superadmin only.

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  const saved = await loadLuxorZelleTo(db);
  // `fromEnv`: nothing saved yet, but the old LUXOR_ZELLE_TO env var is still putting a Zelle line on invoices.
  return NextResponse.json({ zelleTo: saved ?? "", fromEnv: saved === null && luxorZelleTo() !== null });
}

export async function PUT(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  const body = await req.json().catch(() => null) as { zelleTo?: unknown } | null;
  if (!body || !validZelleTo(body.zelleTo)) {
    return NextResponse.json({ error: "Enter the email or 10-digit US phone your Zelle is registered to, or leave it blank." }, { status: 400 });
  }
  const zelleTo = body.zelleTo.trim();
  await db.collection(PAY_SETTINGS_DOC.collection).doc(PAY_SETTINGS_DOC.id).set({ zelleTo, updatedAt: Date.now() }, { merge: true });
  return NextResponse.json({ zelleTo, fromEnv: false });
}
