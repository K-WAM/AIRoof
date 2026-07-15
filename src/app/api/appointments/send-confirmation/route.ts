import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendCustomerConfirmation } from "@/lib/notify";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Alice <alice@yourdomain.com>";
const BASE_URL = "https://ai-roof.vercel.app";

export async function POST(request: NextRequest) {
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  let body: { businessId?: string; appointmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { businessId, appointmentId } = body;
  if (!businessId || !appointmentId) {
    return NextResponse.json({ error: "businessId and appointmentId required" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(request, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const [apptDoc, bizDoc] = await Promise.all([
    db.collection("businesses").doc(businessId).collection("appointments").doc(appointmentId).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);

  if (!apptDoc.exists) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (!bizDoc.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const appt = apptDoc.data()!;
  const biz = bizDoc.data()!;
  const notificationEmail = biz.notificationEmail as string | undefined;
  const customerEmail = (appt.callerEmail as string | undefined) || undefined;
  const tz = (biz.timezone as string | undefined) ?? "America/New_York";

  const apptDate = new Date(appt.startTime as number).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });

  const brand = {
    businessName: (biz.businessName as string) ?? "Your Company",
    brandColor: (biz.brandColor as string | undefined) ?? null,
    logoUrl: (biz.logoUrl as string | undefined) ?? null,
    contactPhone: (biz.contactPhone as string | undefined) ?? null,
    contactEmail: (biz.contactEmail as string | undefined) ?? null,
  };

  // Best-effort notifications. Confirming the appointment is the primary action and
  // must succeed even if email isn't configured or the customer left no email.
  let notifiedCustomer = false;
  if (resend) {
    // 1. Notify the CUSTOMER — the whole point of "Confirm & notify customer".
    if (customerEmail) {
      try {
        await sendCustomerConfirmation({
          to: customerEmail,
          brand,
          clientName: appt.callerName as string | undefined,
          serviceType: appt.serviceType as string | undefined,
          when: apptDate,
          address: appt.address as string | undefined,
        });
        notifiedCustomer = true;
      } catch (e) {
        console.error("Customer confirmation email failed:", e);
      }
    }
    // 2. Notify the business (internal record), as before.
    if (notificationEmail) {
      try {
        await resend.emails.send({
          from: FROM,
          to: notificationEmail,
          subject: `Appointment Confirmed — ${appt.callerName ?? "Customer"} · ${apptDate}`,
          html: confirmationEmailHtml({
            businessName: brand.businessName,
            brandColor: brand.brandColor,
            logoUrl: brand.logoUrl,
            contactPhone: brand.contactPhone,
            contactEmail: brand.contactEmail,
            callerName: (appt.callerName as string) ?? "Valued Customer",
            callerPhone: (appt.callerPhone as string) ?? "—",
            serviceType: (appt.serviceType as string) ?? "Appointment",
            address: (appt.address as string) ?? "Address not provided",
            apptDate,
            appointmentId,
          }),
        });
      } catch (e) {
        console.error("Business confirmation email failed:", e);
      }
    }
  }

  await db.collection("businesses").doc(businessId).collection("appointments").doc(appointmentId).update({
    status: "confirmed",
    pendingConfirmation: false,
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true, notifiedCustomer, customerEmail: customerEmail ?? null });
}

function brandHeader(p: { businessName: string; brandColor?: string | null; logoUrl?: string | null; contactPhone?: string | null; contactEmail?: string | null }): string {
  const bg = p.brandColor ?? "#0f172a";
  const logo = p.logoUrl
    ? `<img src="${p.logoUrl}" alt="${p.businessName}" height="44" style="display:block;margin:0 auto 12px;max-width:180px;">`
    : `<p style="margin:0 0 10px;font-size:22px;font-weight:800;color:#ffffff;">${p.businessName}</p>`;
  const contact = [p.contactPhone, p.contactEmail].filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<td style="background:${bg};padding:28px 32px;text-align:center;">
    ${logo}
    ${contact ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">${contact}</p>` : ""}
  </td>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 24px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top;width:110px;">${label}</td>
    <td style="padding:10px 24px 10px 0;font-size:14px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9;">${value}</td>
  </tr>`;
}

function confirmationEmailHtml(p: {
  businessName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  callerName: string;
  callerPhone: string;
  serviceType: string;
  address: string;
  apptDate: string;
  appointmentId: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>${brandHeader(p)}</tr>
  <tr><td style="padding:20px 32px 8px;">
    <span style="display:inline-block;background:#22c55e;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">Confirmed</span>
  </td></tr>
  <tr><td style="padding:12px 32px 16px;">
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a;">Appointment Confirmed</h1>
    <p style="margin:0;font-size:14px;color:#64748b;">Your AI receptionist booked and confirmed this appointment automatically.</p>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      ${row("Customer", p.callerName)}
      ${row("Phone", p.callerPhone)}
      ${row("Service", p.serviceType)}
      ${row("When", p.apptDate)}
      ${row("Address", p.address)}
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 32px;">
    <p style="margin:0;font-size:10px;color:#cbd5e1;">
      Appt ID: ${p.appointmentId} &nbsp;·&nbsp;
      <a href="${BASE_URL}/company/pipeline?tab=appointments" style="color:#94a3b8;text-decoration:none;">View appointments</a> &nbsp;·&nbsp;
      <span style="color:#e2e8f0;">Powered by Luxor AI</span>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
