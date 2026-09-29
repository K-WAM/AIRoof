import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { toPhoneLineView } from "@/lib/phoneLines/registry";
import type { BusinessPhoneNumber } from "@/types";
import type { PhoneLineView } from "@/types/phoneLine";

// GET /api/company/phone-lines?businessId= — Phase 32 (T-171/T-169, contract C-B). The company's own lines in plain terms
// for Settings → Phone & notifications: number, connection state, texting readiness. No provider names or IDs, never
// another tenant's lines, never a retired line. Owner, staff and viewer (same readers as the other Settings reads).
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection("businessPhoneNumbers").where("businessId", "==", businessId).get();
  const lines = snap.docs
    .map((doc) => toPhoneLineView(doc.id, doc.data() as Partial<BusinessPhoneNumber>, false))
    .filter((line): line is PhoneLineView => line !== null && line.status !== "retired" && line.businessId === businessId)
    .sort((a, b) => a.e164.localeCompare(b.e164));
  return jsonWithCache({ lines }, "noStore");
}
