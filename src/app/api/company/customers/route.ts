import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { resolveCustomer } from "@/lib/customers/resolve";
import { tokenForQuery } from "@/lib/customers/search";
import type { Customer, CustomerKind, CustomerSlim } from "@/types/customer";

const SLIM_LIMIT = 1000;
const SEARCH_LIMIT = 20;

function toSlim(d: FirebaseFirestore.DocumentData): CustomerSlim {
  return {
    customerId: d.customerId,
    name: d.name,
    kind: d.kind,
    phone: d.phone,
    address: d.address,
    jobCount: d.jobCount ?? 0,
    lastJobAt: d.lastJobAt,
  };
}

// GET /api/company/customers?businessId=&fields=slim
//   -> { customers: CustomerSlim[], truncated }  — the primary path. Fetched
//      once per session and filtered entirely client-side (see
//      src/lib/customers/search.ts matchesQuery) — this is what makes typing
//      "walmart" instant with zero network. Good to ~1000 rows.
// GET /api/company/customers?businessId=&q=<token>
//   -> { customers: CustomerSlim[] }  — Firestore searchTokens fallback,
//      engaged by the client only when the slim list came back truncated.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const customersRef = db.collection("businesses").doc(businessId).collection("customers");
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (q) {
    const token = tokenForQuery(q);
    if (!token) return NextResponse.json({ customers: [] });
    const snap = await customersRef
      .where("searchTokens", "array-contains", token)
      .orderBy("lastJobAt", "desc")
      .limit(SEARCH_LIMIT)
      .get();
    return NextResponse.json({ customers: snap.docs.map((d) => toSlim(d.data())) });
  }

  const snap = await customersRef.orderBy("lastJobAt", "desc").limit(SLIM_LIMIT + 1).get();
  const truncated = snap.docs.length > SLIM_LIMIT;
  const docs = truncated ? snap.docs.slice(0, SLIM_LIMIT) : snap.docs;
  return jsonWithCache({ customers: docs.map((d) => toSlim(d.data())), truncated }, "semiStatic");
}

// POST /api/company/customers — manual creation from the Library tab. Routed
// through the same resolveCustomer() the job-create combobox and the backfill
// script use, so "is this a duplicate" is decided identically everywhere. If
// a customer with the same identity already exists, this returns 409 with
// the existing id rather than silently creating a second record.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    businessId, name, kind, phone, email, address, notes, tags, defaultTaxRate, defaultLaborRate,
  } = body as {
    businessId?: string; name?: string; kind?: CustomerKind; phone?: string; email?: string;
    address?: string; notes?: string; tags?: string[]; defaultTaxRate?: number; defaultLaborRate?: number;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!name || !name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (kind !== undefined && kind !== "residential" && kind !== "commercial") {
    return NextResponse.json({ error: "kind must be residential or commercial" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { customerId, created } = await resolveCustomer(db, businessId, { name, phone, email, address, kind });
  const ref = db.collection("businesses").doc(businessId).collection("customers").doc(customerId);

  if (!created) {
    const existing = (await ref.get()).data() as Customer | undefined;
    return NextResponse.json({ error: "A matching customer already exists", customerId, customer: existing }, { status: 409 });
  }

  const extra: Record<string, unknown> = {};
  if (notes !== undefined) extra.notes = notes;
  if (Array.isArray(tags)) extra.tags = tags.slice(0, 10);
  if (defaultTaxRate !== undefined) extra.defaultTaxRate = defaultTaxRate;
  if (defaultLaborRate !== undefined) extra.defaultLaborRate = defaultLaborRate;
  if (Object.keys(extra).length > 0) {
    extra.updatedAt = Date.now();
    await ref.update(extra);
  }

  const customer = (await ref.get()).data() as Customer;
  return NextResponse.json({ customer }, { status: 201 });
}
