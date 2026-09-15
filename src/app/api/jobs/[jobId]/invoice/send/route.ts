import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import type { JobInvoice } from "@/types/invoice";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

// POST /api/jobs/[jobId]/invoice/send  body: { businessId, to }
// Phase 12/Phase 4 rewrite: reads the SAVED invoice doc instead of trusting rows the client
// sends — a client can no longer email totals that were never actually persisted/reviewed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  let body: { businessId?: string; to?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { businessId, to } = body;
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const jobSnap = await db.collection(`businesses/${businessId}/jobs`).doc(jobId).get();
  const invoiceId = jobSnap.data()?.invoiceId;
  if (!invoiceId) return NextResponse.json({ error: "No invoice exists for this job yet" }, { status: 404 });

  const invRef = db.collection(`businesses/${businessId}/invoices`).doc(invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = invSnap.data() as JobInvoice;

  const bizDoc = await db.collection("businesses").doc(businessId).get();
  const biz = bizDoc.exists ? bizDoc.data()! : {};
  const bizName: string = biz.businessName ?? "Roofing Company";
  const bizPhone: string = biz.phone ?? "";

  const today = new Date(invoice.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const due = new Date(invoice.dueAt ?? invoice.createdAt + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const laborRowsHtml = invoice.labor.map(l => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${l.name || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${l.arrival || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${l.departure || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${l.hours || 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${l.rate}/hr</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(l.total)}</td>
    </tr>`).join("");

  // hideMaterials: collapse to one lump line at the real materialSubtotal — never nothing (the
  // line items would stop summing to the total) and never rolled into labor (misstates tax
  // treatment). The internal app view (job detail page) always shows the real rows regardless.
  const materialsHtml = invoice.materials.length === 0 ? "" : invoice.hideMaterials
    ? `<tr><td colspan="4" style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Materials &amp; supplies</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(invoice.materialSubtotal)}</td></tr>`
    : invoice.materials.map(m => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${m.item || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${m.quantity || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${m.unit || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${m.unitPrice.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(m.total)}</td>
    </tr>`).join("");

  const otherRowsHtml = invoice.other.filter(o => o.description).map(o => `
    <tr>
      <td colspan="4" style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${o.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(o.amount)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:#0f172a;padding:28px 40px">
    <div style="color:#fff;font-weight:800;font-size:22px">${bizName}</div>
    ${bizPhone ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px">${bizPhone}</div>` : ""}
  </div>
  <div style="padding:32px 40px">
    <div style="display:flex;justify-content:space-between;margin-bottom:28px">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3b82f6;margin-bottom:4px">Invoice</div>
        <div style="font-weight:800;font-size:24px;color:#0f172a">${invoice.invoiceId}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">Date: ${today}<br/>Due: ${due}</div>
      </div>
      <div style="text-align:right">
        ${invoice.billTo.name ? `<div style="font-weight:700;font-size:15px">${invoice.billTo.name}</div>` : ""}
        ${invoice.billTo.address ? `<div style="font-size:13px;color:#64748b">${invoice.billTo.address}</div>` : ""}
      </div>
    </div>

    ${invoice.labor.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Labor</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Technician</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Arrival</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Departure</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Hours</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Rate</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Total</th>
        </tr></thead>
        <tbody>${laborRowsHtml}</tbody>
      </table>
    </div>` : ""}

    ${invoice.materials.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Materials</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${invoice.hideMaterials ? "" : `<thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Item</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Qty</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Unit</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Unit Price</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Total</th>
        </tr></thead>`}
        <tbody>${materialsHtml}</tbody>
      </table>
    </div>` : ""}

    ${invoice.other.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Other Charges</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${otherRowsHtml}</tbody>
      </table>
    </div>` : ""}

    <div style="border-top:2px solid #e2e8f0;padding-top:16px">
      <table style="width:260px;margin-left:auto;font-size:13px">
        <tbody>
          <tr><td style="padding:4px 16px 4px 0;color:#64748b">Subtotal</td><td style="text-align:right;font-weight:600">${fmt(invoice.subtotal)}</td></tr>
          ${invoice.taxRate > 0 ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Tax (${invoice.taxRate}%)</td><td style="text-align:right;font-weight:600">${fmt(invoice.taxAmount)}</td></tr>` : ""}
          <tr style="border-top:2px solid #0f172a">
            <td style="padding:12px 16px 4px 0;font-weight:800;font-size:15px">Total Due</td>
            <td style="text-align:right;font-weight:800;font-size:18px;color:#0f172a;padding-top:12px">${fmt(invoice.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${invoice.notes ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b">${invoice.notes}</div>` : ""}

    <div style="margin-top:32px;font-size:11px;color:#94a3b8;text-align:center">
      This is a draft invoice. Please review amounts before making payment.<br/>
      Powered by Luxor AI
    </div>
  </div>
</div>
</body></html>`;

  await sendEmail({
    to,
    subject: `[Invoice] ${invoice.invoiceId} from ${bizName}`,
    html,
  });

  await invRef.update({ status: "sent", sentAt: Date.now(), sentTo: to, updatedAt: Date.now() });

  return NextResponse.json({ ok: true });
}
