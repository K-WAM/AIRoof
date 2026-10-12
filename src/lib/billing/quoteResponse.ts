import { createHash, randomBytes } from "node:crypto";

export function newQuoteResponseToken(): string {
  return randomBytes(32).toString("hex");
}

export function quoteResponseTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validQuoteResponseToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

export function quoteResponseUrl(baseUrl: string, businessId: string, jobId: string, token: string, decision: "accepted" | "declined"): string {
  const url = new URL("/api/quote-response", baseUrl);
  url.searchParams.set("businessId", businessId);
  url.searchParams.set("jobId", jobId);
  url.searchParams.set("token", token);
  url.searchParams.set("decision", decision);
  return url.toString();
}
