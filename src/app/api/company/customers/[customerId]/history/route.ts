import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import type { JobHistoryRecord } from "@/types/invoiceHistory";

// Bounded but generous: one real customer has 206 Jobba work orders plus inspections, and rows are sorted after the
// read (no orderBy — it would drop records missing dueAt), so a low cap silently hid arbitrary rows. The screen still
// shows the first 10 with "Show all".
const HISTORY_LIMIT = 1000;

export interface CustomerHistoryItem {
  id: string;
  kind: "inspection" | "work-order";
  description?: string;
  dueAt?: number;
  property?: string;
  address?: string;
  city?: string;
  jobType?: string;
  status: string;
}

// GET /api/company/customers/[customerId]/history?businessId=
//   -> { items } — this customer's past work orders from an imported system,
//      newest first. Read-only: the collections it reads are never written here.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db
    .collection("businesses")
    .doc(businessId)
    .collection("jobHistory")
    .where("customerId", "==", customerId)
    .limit(HISTORY_LIMIT)
    .get();

  const items: CustomerHistoryItem[] = snap.docs
    .map((doc) => doc.data() as JobHistoryRecord)
    .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0))
    .map((record) => ({
      id: record.id,
      kind: record.kind ?? "inspection",
      description: record.description,
      dueAt: record.dueAt,
      property: record.property,
      address: record.address,
      city: record.city,
      jobType: record.jobType,
      status: record.status,
    }));

  return jsonWithCache({ items }, "volatile");
}
