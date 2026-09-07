import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { nextLuxorInvoiceNumber } from "@/lib/billing/invoiceNumber";

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").orderBy("createdAt", "desc").limit(100).get();
  const invoices = snap.docs.map((d) => ({ invoiceId: d.id, ...d.data() }));
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json();

  const invoiceId = await nextLuxorInvoiceNumber(db);
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
