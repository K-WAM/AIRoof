import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/config/env";

export const PAY_TOKEN_LIFETIME = 90 * 24 * 60 * 60 * 1000;
export const PAY_LINK_REUSE_WINDOW = 30 * 24 * 60 * 60 * 1000;
export interface PayLinkState { payLinkNonce?: string; payLinkExpiresAt?: number }
export function validPayLink(invoice: PayLinkState, now = Date.now()): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(invoice.payLinkNonce ?? "") && Number(invoice.payLinkExpiresAt) > now;
}
export function issuePayLink(invoice: PayLinkState, newLink = false, now = Date.now()) {
  if (!newLink && validPayLink(invoice, now) && invoice.payLinkExpiresAt! - now >= PAY_LINK_REUSE_WINDOW) {
    return { payLinkNonce: invoice.payLinkNonce!, payLinkExpiresAt: invoice.payLinkExpiresAt! };
  }
  return { payLinkNonce: randomBytes(16).toString("base64url"), payLinkExpiresAt: now + PAY_TOKEN_LIFETIME };
}
export function signPayToken(businessId: string, invoiceId: string, nonce: string): string {
  const secret = getEnv("PAY_LINK_SECRET");
  if (!secret || secret.length < 32) throw new Error("Pay links not configured");
  return createHmac("sha256", secret).update(`${businessId}:${invoiceId}:${nonce}`).digest("base64url");
}
export function verifyPayToken(token: string, businessId: string, invoiceId: string, invoice: PayLinkState, now = Date.now()): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !validPayLink(invoice, now)) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(signPayToken(businessId, invoiceId, invoice.payLinkNonce!)));
  } catch { return false; }
}
export function invoicePayUrl(baseUrl: string, businessId: string, invoiceId: string, token: string): string {
  const url = new URL("/api/pay/invoice", baseUrl);
  url.search = new URLSearchParams({ b: businessId, i: invoiceId, t: token }).toString();
  return url.toString();
}
