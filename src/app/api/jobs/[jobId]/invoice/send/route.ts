import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Luxor AI <noreply@luxordev.com>";

interface LaborRow { name: string; arrival: string; departure: string; hours: string; rate: string }
interface MaterialRow { item: string; quantity: string; unit: string; unitPrice: string }
interface OtherRow { description: string; amount: string }

function fmt(n: number) { return `$${n.toFixed(2)}`; }
function laborTotal(r: LaborRow) { return (parseFloat(r.hours) || 0) * (parseFloat(r.rate) || 0); }
function materialTotal(r: MaterialRow) { return (parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  if (!resend) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  let body: {
    businessId?: string; to?: string; clientName?: string;
    address?: string; serviceType?: string;
    laborRows?: LaborRow[]; materialRows?: MaterialRow[]; otherRows?: OtherRow[];
    taxRate?: string; subtotal?: number; tax?: number; grandTotal?: number;
    invoiceNotes?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { businessId, to } = body;
  if (!businessId || !to) return NextResponse.json({ error: "businessId and to required" }, { status: 400 });

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const bizDoc = await db.collection("businesses").doc(businessId).get();
  const biz = bizDoc.exists ? bizDoc.data()! : {};
  const bizName: string = biz.businessName ?? "Roofing Company";
  const bizPhone: string = biz.phone ?? "";

  const labor = body.laborRows ?? [];
  const materials = body.materialRows ?? [];
  const other = body.otherRows ?? [];
  const taxRate = parseFloat(body.taxRate ?? "0");
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const due = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const laborRows = labor.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${r.name || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${r.arrival || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${r.departure || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${r.hours || "0"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${r.rate}/hr</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(laborTotal(r))}</td>
    </tr>`).join("");

  const materialRowsHtml = materials.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${r.item || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${r.quantity || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${r.unit || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${r.unitPrice || "0.00"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(materialTotal(r))}</td>
    </tr>`).join("");

  const otherRowsHtml = other.filter(r => r.description).map(r => `
    <tr>
      <td colspan="4" style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${r.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(parseFloat(r.amount) || 0)}</td>
    </tr>`).join("");

  const grandTotal = body.grandTotal ?? 0;
  const tax = body.tax ?? 0;
  const subtotal = body.subtotal ?? 0;

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
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3b82f6;margin-bottom:4px">Draft Invoice</div>
        <div style="font-weight:800;font-size:24px;color:#0f172a">#${jobId}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">Date: ${today}<br/>Due: ${due}</div>
      </div>
      <div style="text-align:right">
        ${body.clientName ? `<div style="font-weight:700;font-size:15px">${body.clientName}</div>` : ""}
        ${body.address ? `<div style="font-size:13px;color:#64748b">${body.address}</div>` : ""}
        ${body.serviceType ? `<div style="font-size:12px;color:#94a3b8">${body.serviceType}</div>` : ""}
      </div>
    </div>

    ${labor.length > 0 ? `
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
        <tbody>${laborRows}</tbody>
      </table>
    </div>` : ""}

    ${materials.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Materials</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Item</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Qty</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b">Unit</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Unit Price</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b">Total</th>
        </tr></thead>
        <tbody>${materialRowsHtml}</tbody>
      </table>
    </div>` : ""}

    ${other.length > 0 ? `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#475569;margin-bottom:8px">Other Charges</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${otherRowsHtml}</tbody>
      </table>
    </div>` : ""}

    <div style="border-top:2px solid #e2e8f0;padding-top:16px">
      <table style="width:260px;margin-left:auto;font-size:13px">
        <tbody>
          <tr><td style="padding:4px 16px 4px 0;color:#64748b">Subtotal</td><td style="text-align:right;font-weight:600">${fmt(subtotal)}</td></tr>
          ${taxRate > 0 ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Tax (${taxRate}%)</td><td style="text-align:right;font-weight:600">${fmt(tax)}</td></tr>` : ""}
          <tr style="border-top:2px solid #0f172a">
            <td style="padding:12px 16px 4px 0;font-weight:800;font-size:15px">Total Due</td>
            <td style="text-align:right;font-weight:800;font-size:18px;color:#0f172a;padding-top:12px">${fmt(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${body.invoiceNotes ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b">${body.invoiceNotes}</div>` : ""}

    <div style="margin-top:32px;font-size:11px;color:#94a3b8;text-align:center">
      This is a draft invoice. Please review amounts before making payment.<br/>
      Powered by Luxor AI
    </div>
  </div>
</div>
</body></html>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Draft Invoice #${jobId} from ${bizName}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
