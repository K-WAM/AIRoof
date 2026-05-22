// Verify that an incoming webhook is from Vapi by checking the secret header.
// Vapi sends the header you configure in its dashboard ("Server URL Secret").
// We compare against VAPI_WEBHOOK_SECRET in our env.

import type { NextRequest } from "next/server";

export function verifyVapiWebhook(request: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) {
    // No secret configured — skip verification in dev. In production, set the env var.
    console.warn("VAPI_WEBHOOK_SECRET not set — webhook signature check skipped");
    return true;
  }

  // Vapi sends the secret in the "x-vapi-secret" header (the name you choose in their UI).
  // We accept a few common header names defensively.
  const candidates = [
    request.headers.get("x-vapi-secret"),
    request.headers.get("x-vapi-signature"),
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
  ];

  return candidates.some((c) => c && timingSafeEqual(c, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
