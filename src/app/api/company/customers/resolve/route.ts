import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { resolveCustomer, bumpCustomerJobStats } from "@/lib/customers/resolve";
import type { CustomerKind } from "@/types/customer";

// POST /api/company/customers/resolve  body: { businessId, jobId, name, phone?, email?, address?, kind? }
//
// The non-blocking call the job-create form fires after creating a job when
// no existing customer was picked from the combobox: find-or-create a
// customer by identity (resolveCustomer) and back-patch job.customerId. The
// job itself is already created and visible by the time this runs — a slow
// or failed resolve never blocks or fails job creation. Idempotent: retrying
// with the same name/phone finds the same customer via matchKey rather than
// creating a duplicate.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, jobId, name, phone, email, address, kind } = body as {
    businessId?: string; jobId?: string; name?: string; phone?: string;
    email?: string; address?: string; kind?: CustomerKind;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  if (!name || !name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const jobRef = db.collection("businesses").doc(businessId).collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobSnap.data()!;

  const { customerId, created } = await resolveCustomer(db, businessId, { name, phone, email, address, kind });

  // Defensive: don't clobber a customerId the job might already carry (e.g. a
  // retry, or the combobox path having already set one directly).
  if (!job.customerId) {
    await jobRef.update({ customerId, updatedAt: Date.now() });
  }
  await bumpCustomerJobStats(db, businessId, customerId, typeof job.createdAt === "number" ? job.createdAt : Date.now());

  return NextResponse.json({ customerId, created });
}
