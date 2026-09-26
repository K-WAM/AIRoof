import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";

export async function POST(req: NextRequest) {
  const { businessId } = await req.json().catch(() => ({}));
  if (typeof businessId !== "string" || !businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(businessId);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  await ref.update({ fieldKey: randomBytes(32).toString("hex"), fieldKeyRotatedAt: Date.now() });
  return jsonWithCache({ ok: true }, "noStore");
}
