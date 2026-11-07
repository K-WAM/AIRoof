import { sendEmail } from "@/lib/comms/send";
import { escapeHtml } from "@/lib/documents/letterhead";

export async function notifySubmission(businessId: string, clientName: string, title: string) {
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://crm.luxordev.com"}/admin/businesses/${encodeURIComponent(businessId)}/onboarding`;
    const result = await sendEmail({ businessId, to: "connect@luxordev.com", subject: `${clientName} sent: ${title}`, html: `<p>${escapeHtml(title)}</p><p><a href="${escapeHtml(url)}">Review in Luxor CRM</a></p>` });
    if (result.status !== "delivered") console.warn("Onboarding notification not delivered", { businessId, status: result.status });
  } catch { console.warn("Onboarding notification failed", { businessId }); }
}
