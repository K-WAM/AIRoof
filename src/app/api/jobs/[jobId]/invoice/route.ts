import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { FieldUpdate, InvoiceLineItem, ParsedUpdate } from "@/types/jobs";

// POST /api/jobs/[jobId]/invoice — generate draft invoice from parsed updates
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json();
  const { businessId } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const [jobSnap, updatesSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/jobs`).doc(jobId).get(),
    db.collection(`businesses/${businessId}/jobs/${jobId}/updates`).orderBy("createdAt", "asc").get(),
  ]);

  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const job = jobSnap.data()!;
  const updates = updatesSnap.docs.map((d) => d.data() as FieldUpdate);
  const allParsed = updates.map((u) => u.parsed).filter(Boolean) as ParsedUpdate[];

  // Collect AI invoice suggestions from all updates
  const lineItems: InvoiceLineItem[] = allParsed.flatMap((p) => p.invoiceSuggestions ?? []);

  // If no AI suggestions, fall back to building from materials + labor
  if (lineItems.length === 0) {
    allParsed.forEach((p) => {
      p.materials.forEach((m) => {
        if (m.cost != null) {
          const qty = parseFloat(m.quantity ?? "1") || 1;
          lineItems.push({
            description: `${m.item}${m.unit ? ` (${m.unit})` : ""}`,
            quantity: qty,
            unitPrice: m.cost / qty,
            total: m.cost,
          });
        }
      });
      p.labor.forEach((l) => {
        if (l.hours != null && l.rate != null) {
          lineItems.push({
            description: l.description,
            quantity: l.hours,
            unitPrice: l.rate,
            total: l.hours * l.rate,
          });
        }
      });
    });
  }

  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);

  const invoice = {
    jobId,
    businessId,
    clientName: job.clientName ?? null,
    clientPhone: job.clientPhone ?? null,
    address: job.address ?? null,
    serviceType: job.serviceType ?? null,
    lineItems,
    subtotal,
    generatedAt: Date.now(),
    status: "draft",
  };

  return NextResponse.json({ invoice });
}
