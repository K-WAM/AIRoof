import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (gate.user.superadmin || !gate.user.businessId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "volatile", { status: 503 });
  const collection = db.collection(`businesses/${gate.user.businessId!}/stripeUnmatched`);
  const [snapshot, payments, refunds] = await Promise.all([collection.orderBy("receivedAt", "desc").limit(30).get(),
    collection.where("kind", "==", "payment").count().get(), collection.where("kind", "==", "refund").count().get()]);
  const paymentCount = payments.data().count, refundCount = refunds.data().count;
  return jsonWithCache({ count: paymentCount + refundCount, paymentCount, refundCount, payments: snapshot.docs.map(doc => {
    const data = doc.data();
    return { eventId: doc.id, kind: data.kind, eventType: data.eventType, amount: data.amount, currency: data.currency,
      sessionId: data.sessionId, paymentIntentId: data.paymentIntentId, chargeId: data.chargeId };
  }) }, "volatile");
}
