import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PAY_TOKEN_LIFETIME = 90 * 24 * 60 * 60 * 1000;
export function payTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function createPayToken(now = Date.now()) {
  const token = randomBytes(32).toString("hex");
  return { token, payTokenHash: payTokenHash(token), payTokenExpiresAt: now + PAY_TOKEN_LIFETIME };
}
export function verifyPayToken(token: string, invoice: { payTokenHash?: string; payTokenExpiresAt?: number }, now = Date.now()): boolean {
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(invoice.payTokenHash ?? "") || !(Number(invoice.payTokenExpiresAt) > now)) return false;
  return timingSafeEqual(Buffer.from(payTokenHash(token), "hex"), Buffer.from(invoice.payTokenHash!, "hex"));
}
export function invoicePayUrl(baseUrl: string, businessId: string, invoiceId: string, token: string): string {
  const url = new URL("/api/pay/invoice", baseUrl);
  url.search = new URLSearchParams({ b: businessId, i: invoiceId, t: token }).toString();
  return url.toString();
}
