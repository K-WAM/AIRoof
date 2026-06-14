import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").doc(invoiceId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ invoice: { invoiceId: snap.id, ...snap.data() } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json();
  await db.collection("luxorInvoices").doc(invoiceId).update({ ...body, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  await db.collection("luxorInvoices").doc(invoiceId).delete();
  return NextResponse.json({ ok: true });
}
