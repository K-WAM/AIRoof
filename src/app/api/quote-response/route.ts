import { timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { escapeHtml } from "@/lib/documents/letterhead";
import { quoteResponseTokenHash, validQuoteResponseToken } from "@/lib/billing/quoteResponse";
import type { JobQuote, QuoteStatus } from "@/types/quote";
import type { Job } from "@/types/jobs";

// Public customer link: the 256-bit, single-use token is the credential. GET only displays a
// confirmation form because mail clients and security scanners follow links automatically.
// The POST changes the status in a transaction so two answers cannot both win.
type Decision = "accepted" | "declined";
type Input = { businessId: string; jobId: string; token: string; decision: Decision };
const idShape = /^[A-Za-z0-9_-]{1,128}$/;
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

function page(title: string, body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:32px 16px"><main style="max-width:520px;margin:40px auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:28px;line-height:1.5"><h1 style="font-size:24px">${escapeHtml(title)}</h1>${body}</main></body></html>`, { status, headers });
}

function parse(input: URLSearchParams | FormData): Input | null {
  const businessId = input.get("businessId");
  const jobId = input.get("jobId");
  const token = input.get("token");
  const decision = input.get("decision");
  if (typeof businessId !== "string" || !idShape.test(businessId) || typeof jobId !== "string" || !idShape.test(jobId)
    || typeof token !== "string" || !validQuoteResponseToken(token) || (decision !== "accepted" && decision !== "declined")) return null;
  return { businessId, jobId, token, decision };
}

function tokenMatches(token: string, saved: string | undefined): boolean {
  if (!saved || !/^[a-f0-9]{64}$/.test(saved)) return false;
  return timingSafeEqual(Buffer.from(quoteResponseTokenHash(token), "hex"), Buffer.from(saved, "hex"));
}

async function linkedQuote(input: Input) {
  const db = getAdminFirestore();
  if (!db) return null;
  const jobRef = db.collection(`businesses/${input.businessId}/jobs`).doc(input.jobId);
  const jobSnap = await jobRef.get();
  const job = jobSnap.exists ? jobSnap.data() as Job : null;
  if (!job?.quoteId || !idShape.test(job.quoteId)) return null;
  const quoteRef = db.collection(`businesses/${input.businessId}/quotes`).doc(job.quoteId);
  const quoteSnap = await quoteRef.get();
  const quote = quoteSnap.exists ? quoteSnap.data() as JobQuote : null;
  if (!quote || quote.jobId !== input.jobId || quote.businessId !== input.businessId || !tokenMatches(input.token, quote.responseTokenHash)) return null;
  return { db, jobRef, quoteRef, quote };
}

export async function GET(req: NextRequest): Promise<Response> {
  const input = parse(req.nextUrl.searchParams);
  if (!input) return page("Link unavailable", "<p>Ask the business to send a new quote link.</p>", 404);
  const linked = await linkedQuote(input);
  if (!linked) return page("Link unavailable", "<p>Ask the business to send a new quote link.</p>", 404);
  if (linked.quote.status !== "sent" || linked.quote.validUntil <= Date.now()) return page("Quote no longer available", "<p>This quote can no longer be answered online. Please contact the business.</p>", 409);
  const action = input.decision === "accepted" ? "Accept" : "Reject";
  const fields = Object.entries(input).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
  return page(`${action} quote`, `<p>You are about to ${action.toLowerCase()} quote <strong>${escapeHtml(linked.quote.quoteId)}</strong>. This will notify the business through the job's quote status.</p><form method="post" action="/api/quote-response">${fields}<button type="submit" style="background:#0f766e;border:0;border-radius:6px;color:#fff;padding:12px 18px;font-weight:700;cursor:pointer">Confirm ${action.toLowerCase()}</button></form><p style="font-size:13px;color:#64748b">Opening this link alone does not record your answer.</p>`);
}

export async function POST(req: NextRequest): Promise<Response> {
  const input = parse(await req.formData().catch(() => new FormData()));
  if (!input) return page("Link unavailable", "<p>Ask the business to send a new quote link.</p>", 404);
  const linked = await linkedQuote(input);
  if (!linked) return page("Link unavailable", "<p>Ask the business to send a new quote link.</p>", 404);
  const now = Date.now();
  const changed = await linked.db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(linked.jobRef);
    const quoteSnap = await tx.get(linked.quoteRef);
    const job = jobSnap.data() as Job | undefined;
    const quote = quoteSnap.data() as JobQuote | undefined;
    if (!job || !quote || job.quoteId !== quote.quoteId || quote.jobId !== input.jobId || quote.businessId !== input.businessId
      || quote.status !== "sent" || quote.validUntil <= now || !tokenMatches(input.token, quote.responseTokenHash)) return false;
    const status: QuoteStatus = input.decision;
    tx.update(linked.quoteRef, { status, answeredAt: now, updatedAt: now, responseTokenHash: FieldValue.delete() });
    return true;
  });
  if (!changed) return page("Quote no longer available", "<p>This quote has already been answered or expired. Please contact the business.</p>", 409);
  return page(input.decision === "accepted" ? "Quote accepted" : "Quote rejected", `<p>Thank you. Your answer to quote <strong>${escapeHtml(linked.quote.quoteId)}</strong> has been recorded. The business can now see it on the job.</p>`);
}
