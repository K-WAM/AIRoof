import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET() {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoiceTemplates").orderBy("createdAt", "desc").get();
  const templates = snap.docs.map((d) => ({ templateId: d.id, ...d.data() }));
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const now = Date.now();
  const ref = db.collection("luxorInvoiceTemplates").doc();
  await ref.set({ templateId: ref.id, ...body, createdAt: now, updatedAt: now });
  return NextResponse.json({ templateId: ref.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { templateId } = await req.json();
  if (!templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });

  await db.collection("luxorInvoiceTemplates").doc(templateId).delete();
  return NextResponse.json({ ok: true });
}
