import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

export async function GET() {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").orderBy("createdAt", "desc").limit(100).get();
  const invoices = snap.docs.map((d) => ({ invoiceId: d.id, ...d.data() }));
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json();

  // Auto-increment invoice number: LX-1001, LX-1002, …
  const counterRef = db.collection("luxorMeta").doc("invoiceCounter");
  let invoiceNum = 1001;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    invoiceNum = (snap.data()?.count ?? 1000) + 1;
    tx.set(counterRef, { count: invoiceNum });
  });

  const invoiceId = `LX-${invoiceNum}`;
  const now = Date.now();
  const invoice = {
    invoiceId,
    ...body,
    status: body.status ?? "draft",
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("luxorInvoices").doc(invoiceId).set(invoice);
  return NextResponse.json({ invoice }, { status: 201 });
}
