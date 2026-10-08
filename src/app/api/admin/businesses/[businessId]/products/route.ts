import { NextRequest, NextResponse } from "next/server";
import type { AdminAuditEvent, BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { PRODUCTS, productsOf, type ProductId, type ProductSet } from "@/lib/products/products";
import { invalidateProducts } from "@/lib/products/productCache";

// POST /api/admin/businesses/[businessId]/products — turn a client's products on or off to match their contract
// (owner, 2026-10-08). Superadmin only, one audited write. Body: { products: { calls?: boolean, field?: boolean,
// billing?: boolean } } — omitted keys keep their current value. Billing needs Jobs & field input (invoices belong to
// jobs), so billing on with field off is refused rather than silently ignored. The phone line itself is never touched
// here: turning "calls" off hides the screens and refuses the APIs; disconnecting the number is a separate decision.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  const { businessId } = await params;
  const body = (await request.json().catch(() => ({}))) as { products?: Record<string, unknown> };
  const asked = body.products;
  if (!asked || typeof asked !== "object") {
    return NextResponse.json({ error: "products must be an object like { calls: true, field: false }" }, { status: 400 });
  }
  const ids = PRODUCTS.map((p) => p.id);
  for (const [key, value] of Object.entries(asked)) {
    if (!ids.includes(key as ProductId)) return NextResponse.json({ error: `Unknown product "${key}"` }, { status: 400 });
    if (typeof value !== "boolean") return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const now = Date.now();
  const auditRef = db.collection("adminAuditEvents").doc(`audit_${now}`);

  try {
    const next = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(businessRef);
      if (!doc.exists) throw new Error(`Business ${businessId} not found`);
      const before = productsOf(doc.data() as BusinessConfig);
      const wanted: ProductSet = { ...before, ...(asked as Partial<ProductSet>) };
      if (wanted.billing && !wanted.field) throw new Error("Billing needs Jobs & field input — turn that on first.");
      // Store all three explicitly so the record says exactly what was sold.
      transaction.update(businessRef, { products: wanted, updatedAt: now });
      const auditEvent: AdminAuditEvent = {
        auditEventId: auditRef.id,
        actorUid: gate.user.uid,
        actorEmail: gate.user.email,
        businessId,
        action: "products.updated",
        targetPath: `businesses/${businessId}`,
        before,
        after: wanted,
        createdAt: now,
      };
      transaction.set(auditRef, auditEvent);
      return wanted;
    });
    invalidateProducts(businessId);
    return NextResponse.json({ success: true, products: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /not found/i.test(message) ? 404 : /needs/i.test(message) ? 400 : 500;
    if (status === 500) console.error("POST products error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
