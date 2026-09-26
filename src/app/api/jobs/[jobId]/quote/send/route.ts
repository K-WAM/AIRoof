import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { isCommsConfigured, sendEmail } from "@/lib/comms/send";
import { buildQuoteEmailHtml } from "@/lib/billing/jobQuoteEmailHtml";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { noticesForDocument } from "@/lib/documents/notices";
import type { JobQuote } from "@/types/quote";
import type { Job } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let body: { businessId?: string; to?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { businessId, to } = body;
  if (typeof businessId !== "string" || !businessId || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Valid businessId and to required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  if (!isCommsConfigured()) return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const bizRef = db.collection("businesses").doc(businessId);
  const bizSnap = await bizRef.get();
  if (!bizSnap.exists || getVerticalTemplate(bizSnap.data()?.industry ?? "").disabledModules.includes("jobs")) {
    return NextResponse.json({ error: "Jobs module unavailable" }, { status: 403 });
  }
  const jobRef = db.collection(`businesses/${businessId}/jobs`).doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = jobSnap.data() as Job;
  if (!job.quoteId) return NextResponse.json({ error: "No quote exists" }, { status: 404 });
  const quoteRef = db.collection(`businesses/${businessId}/quotes`).doc(job.quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = quoteSnap.data() as JobQuote;
  if (quote.status !== "draft") return NextResponse.json({ error: "Only a draft quote can be sent" }, { status: 409 });
  if (quote.validUntil <= Date.now()) return NextResponse.json({ error: "Quote has expired" }, { status: 409 });
  if (!quote.lines.length || !quote.billTo.name.trim()) return NextResponse.json({ error: "Quote needs bill-to and at least one line" }, { status: 400 });
  const biz = bizSnap.data()!;
  const logosSnap = await db.collection(`businesses/${businessId}/library`).doc("logos").get();
  const letterhead = resolveLetterhead(biz, (logosSnap.data()?.logos as LibraryLogo[] | undefined) ?? []);
  const businessName: string = typeof biz.businessName === "string" ? biz.businessName.trim() : "";
  if (!businessName) return NextResponse.json({ error: "Business name required before sending" }, { status: 400 });
  // Terms & notices print only once the owner has approved the wording; statutory ones only for a residential job over the threshold.
  const notices = noticesForDocument({ doc: "quote", total: quote.total, commercial: job.propertyType === "commercial", settings: biz.documentNotices, business: { businessName, licenseNumber: biz.licenseNumber } });
  const html = buildQuoteEmailHtml(quote, {
    businessName, brandColor: biz.brandColor, logoUrl: letterhead.logoUrl,
    address: biz.address, contactPhone: biz.contactPhone, contactEmail: biz.contactEmail, websiteUrl: biz.websiteUrl, licenseNumber: biz.licenseNumber,
  }, notices);
  const sent = await sendEmail({
    to, subject: `[Quote] ${quote.quoteId} from ${businessName}`, html,
    fromName: businessName, replyTo: biz.contactEmail || biz.notificationEmail,
  });
  if (sent.status !== "delivered") {
    return NextResponse.json({ error: "The email could not be delivered. Nothing was marked as sent — check the address and try again." }, { status: 502 });
  }
  const now = Date.now();
  const batch = db.batch();
  batch.update(quoteRef, { status: "sent", sentAt: now, sentTo: to, updatedAt: now });
  if (["open", "inspection"].includes(job.status)) batch.update(jobRef, { status: "quoted", updatedAt: now });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
