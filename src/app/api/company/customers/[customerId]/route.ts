import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { buildMatchKey, buildSearchTokens } from "@/lib/customers/search";
import type { Customer, CustomerContact, CustomerKind } from "@/types/customer";
import type { Job } from "@/types/jobs";

const OPEN_STATUSES = new Set(["open", "inspection", "quoted", "in_progress"]);
const JOBS_LIMIT = 200;

// GET /api/company/customers/[customerId]?businessId=
//   -> { customer, jobs }  — every job for this customer, newest first. This
//      is the "type walmart, see every job" requirement: the Library drawer
//      calls this once a row is picked.
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

  const bizRef = db.collection("businesses").doc(businessId);
  const [customerSnap, jobsSnap] = await Promise.all([
    bizRef.collection("customers").doc(customerId).get(),
    bizRef.collection("jobs").where("customerId", "==", customerId).orderBy("createdAt", "desc").limit(JOBS_LIMIT).get(),
  ]);

  if (!customerSnap.exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const customer = customerSnap.data() as Customer;
  const jobs = jobsSnap.docs.map((d) => ({ jobId: d.id, ...d.data() })) as Job[];
  return NextResponse.json({ customer, jobs });
}

// PATCH /api/company/customers/[customerId]  body: { businessId, ...fields, propagate? }
//
// `propagate: true` re-denormalizes name/phone/address onto this customer's
// still-OPEN jobs only — an invoiced/complete job's snapshot is frozen so a
// rename never mutates something already sent to a customer.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { customerId } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    businessId, name, kind, phone, email, address, contacts, notes, tags,
    defaultTaxRate, defaultLaborRate, active, propagate,
  } = body as {
    businessId?: string; name?: string; kind?: CustomerKind; phone?: string; email?: string;
    address?: string; contacts?: CustomerContact[]; notes?: string; tags?: string[];
    defaultTaxRate?: number; defaultLaborRate?: number; active?: boolean; propagate?: boolean;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (kind !== undefined && kind !== "residential" && kind !== "commercial") {
    return NextResponse.json({ error: "kind must be residential or commercial" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection("businesses").doc(businessId).collection("customers").doc(customerId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const current = snap.data() as Customer;

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  const nextName = name !== undefined ? name.trim() : current.name;
  const nextPhone = phone !== undefined ? phone : current.phone;
  if (name !== undefined) update.name = nextName;
  if (kind !== undefined) update.kind = kind;
  if (phone !== undefined) update.phone = phone || null;
  if (email !== undefined) update.email = email || null;
  if (address !== undefined) update.address = address || null;
  if (Array.isArray(contacts)) update.contacts = contacts.slice(0, 10);
  if (notes !== undefined) update.notes = notes;
  if (Array.isArray(tags)) update.tags = tags.slice(0, 10);
  if (defaultTaxRate !== undefined) update.defaultTaxRate = defaultTaxRate;
  if (defaultLaborRate !== undefined) update.defaultLaborRate = defaultLaborRate;
  if (active !== undefined) update.active = active;

  const identityChanged = name !== undefined || phone !== undefined || address !== undefined;
  if (identityChanged) {
    update.matchKey = buildMatchKey({ name: nextName, phone: nextPhone });
    update.searchTokens = buildSearchTokens({
      name: nextName, phone: nextPhone,
      address: address !== undefined ? address : current.address,
      contacts: (Array.isArray(contacts) ? contacts : current.contacts) as CustomerContact[] | undefined,
    });
  }

  await ref.update(update);

  let propagatedCount = 0;
  if (propagate && (name !== undefined || phone !== undefined || address !== undefined)) {
    const jobsSnap = await db.collection("businesses").doc(businessId).collection("jobs")
      .where("customerId", "==", customerId)
      .get();
    const openDocs = jobsSnap.docs.filter((d) => OPEN_STATUSES.has(d.data().status));
    if (openDocs.length > 0) {
      const batch = db.batch();
      const jobUpdate: Record<string, unknown> = { updatedAt: Date.now() };
      if (name !== undefined) jobUpdate.clientName = nextName;
      if (phone !== undefined) jobUpdate.clientPhone = nextPhone || null;
      if (address !== undefined) jobUpdate.address = address || null;
      for (const doc of openDocs) batch.update(doc.ref, jobUpdate);
      await batch.commit();
      propagatedCount = openDocs.length;
    }
  }

  return NextResponse.json({ ok: true, propagatedCount });
}
