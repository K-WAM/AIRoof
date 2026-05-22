// Verify that an incoming webhook is from Vapi by checking the secret header.
// Vapi sends the header you configure in its dashboard ("Server URL Secret"
// or a custom HTTP header).
//
// We accept several common header names and trim whitespace defensively
// (Vapi's UI sometimes adds trailing newlines on paste).

import type { NextRequest } from "next/server";

export function verifyVapiWebhook(request: NextRequest): boolean {
  const expectedRaw = process.env.VAPI_WEBHOOK_SECRET;
  if (!expectedRaw) {
    console.warn("VAPI_WEBHOOK_SECRET not set — webhook signature check skipped");
    return true;
  }
  const expected = expectedRaw.trim();

  const headerNames = [
    "x-vapi-secret",
    "x-vapi-signature",
    "vapi-secret",
    "vapi-signature",
    "secret",
  ];

  const candidates: Array<{ source: string; value: string }> = [];
  for (const name of headerNames) {
    const v = request.headers.get(name);
    if (v) candidates.push({ source: name, value: v.trim() });
  }
  const auth = request.headers.get("authorization");
  if (auth) candidates.push({ source: "authorization", value: auth.replace(/^Bearer\s+/i, "").trim() });

  for (const c of candidates) {
    if (timingSafeEqual(c.value, expected)) return true;
  }

  // Diagnostic log on mismatch — lengths only, no values (safe).
  console.warn("Vapi webhook auth mismatch", {
    expectedLen: expected.length,
    receivedHeaders: candidates.map((c) => ({ source: c.source, len: c.value.length, matchesLen: c.value.length === expected.length })),
    allHeaderKeys: Array.from(request.headers.keys()),
  });

  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
