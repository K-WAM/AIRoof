import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM ?? "Alice <alice@yourdomain.com>";
const BASE_URL = "https://ai-roof.vercel.app";
const LOGO_URL = `${BASE_URL}/logo.png`;

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

  const [apptDoc, bizDoc] = await Promise.all([
    db.collection("businesses").doc(businessId).collection("appointments").doc(appointmentId).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);

  if (!apptDoc.exists) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (!bizDoc.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const appt = apptDoc.data()!;
  const biz = bizDoc.data()!;
  const notificationEmail = biz.notificationEmail as string | undefined;

  if (!resend || !notificationEmail) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  const apptDate = new Date(appt.startTime as number).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });

  const html = confirmationEmailHtml({
    businessName: (biz.businessName as string) ?? "Your Roofing Company",
    callerName: (appt.callerName as string) ?? "Valued Customer",
    callerPhone: (appt.callerPhone as string) ?? "—",
    serviceType: (appt.serviceType as string) ?? "Inspection",
    address: (appt.address as string) ?? "Address not provided",
    apptDate,
  });

  await resend.emails.send({
    from: FROM,
    to: notificationEmail,
    subject: `Appointment Confirmed — ${appt.callerName ?? "Customer"} · ${apptDate}`,
    html,
  });

  // Mark as confirmed in Firestore
  await db.collection("businesses").doc(businessId).collection("appointments").doc(appointmentId).update({
    status: "confirmed",
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

function confirmationEmailHtml(p: {
  businessName: string;
  callerName: string;
  callerPhone: string;
  serviceType: string;
  address: string;
  apptDate: string;
}): string {
  function row(label: string, value: string): string {
    return `<tr>
      <td style="padding:10px 24px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top;width:110px;">${label}</td>
      <td style="padding:10px 24px 10px 0;font-size:14px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9;">${value}</td>
    </tr>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="Luxor AI" height="36" style="display:block;margin:0 auto 14px;">
    <span style="display:inline-block;background:#22c55e;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:20px;">Confirmed</span>
  </td></tr>
  <tr><td style="padding:24px 32px 8px;">
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a;">Appointment Confirmed</h1>
    <p style="margin:0;font-size:14px;color:#64748b;">Alice booked and confirmed this appointment on behalf of ${p.businessName}.</p>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      ${row("Customer", p.callerName)}
      ${row("Phone", p.callerPhone)}
      ${row("Service", p.serviceType)}
      ${row("When", p.apptDate)}
      ${row("Address", p.address)}
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by Luxor AI Receptionist · <a href="${BASE_URL}/company/appointments" style="color:#6366f1;text-decoration:none;">View all appointments</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
