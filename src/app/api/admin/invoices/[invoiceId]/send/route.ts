import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";

export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  const { invoiceId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const snap = await db.collection("luxorInvoices").doc(invoiceId).get();
  if (!snap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const invoice = snap.data()!;

  const body = await req.json().catch(() => ({}));
  const toEmail = body.email ?? invoice.clientEmail;
  if (!toEmail) return NextResponse.json({ error: "No recipient email" }, { status: 400 });

  const lineItemsHtml = (invoice.lineItems ?? []).map((item: { description: string; quantity: number; unitPrice: number; total: number }) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${item.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">$${Number(item.unitPrice).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">$${Number(item.total).toFixed(2)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:40px 0;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <div style="background:#0f172a;padding:32px 40px;display:flex;align-items:center;gap:16px;">
    <div>
      <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Invoice from</div>
      <div style="color:#fff;font-size:22px;font-weight:800;">Luxor AI</div>
      <div style="color:#64748b;font-size:13px;margin-top:2px;">Luxor Developments LLC</div>
    </div>
    <div style="margin-left:auto;text-align:right;">
      <div style="color:#3b82f6;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px;">Invoice</div>
      <div style="color:#fff;font-size:24px;font-weight:800;">${invoiceId}</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Due: ${invoice.dueDate ?? "Net 30"}</div>
    </div>
  </div>

  <!-- Bill To -->
  <div style="padding:28px 40px;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">Bill To</div>
    <div style="font-weight:700;font-size:15px;">${invoice.clientName ?? ""}</div>
    ${invoice.clientEmail ? `<div style="color:#64748b;font-size:13px;">${invoice.clientEmail}</div>` : ""}
    ${invoice.clientAddress ? `<div style="color:#64748b;font-size:13px;">${invoice.clientAddress}</div>` : ""}
  </div>

  <!-- Line Items -->
  <div style="padding:28px 40px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#64748b;">Description</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;">Unit Price</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600;color:#64748b;">Total</th>
        </tr>
      </thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>

    <!-- Totals -->
    <div style="margin-top:20px;display:flex;justify-content:flex-end;">
      <table style="font-size:13px;min-width:240px;">
        <tr>
          <td style="padding:4px 16px 4px 0;color:#64748b;">Subtotal</td>
          <td style="text-align:right;font-weight:600;">$${Number(invoice.subtotal ?? 0).toFixed(2)}</td>
        </tr>
        ${invoice.taxRate ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Tax (${invoice.taxRate}%)</td><td style="text-align:right;font-weight:600;">$${Number(invoice.taxAmount ?? 0).toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid #0f172a;">
          <td style="padding:10px 16px 4px 0;font-weight:800;font-size:15px;">Total Due</td>
          <td style="text-align:right;font-weight:800;font-size:18px;color:#0f172a;padding-top:10px;">$${Number(invoice.total ?? 0).toFixed(2)}</td>
        </tr>
      </table>
    </div>

    ${invoice.notes ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;"><div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Notes & Payment Terms</div><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${invoice.notes}</p></div>` : ""}
  </div>

  <!-- Footer -->
  <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Questions? Reply to this email or contact connect@luxordev.com</p>
    <p style="margin:6px 0 0;font-size:10px;color:#cbd5e1;">Luxor Developments LLC · Vancouver, BC</p>
  </div>
</div>
</body>
</html>`;

  await sendEmail({
    to: toEmail,
    subject: `Invoice ${invoiceId} from Luxor AI`,
    html,
  });

  await db.collection("luxorInvoices").doc(invoiceId).update({
    status: "sent",
    sentAt: Date.now(),
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
