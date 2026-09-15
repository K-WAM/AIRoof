import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  consumeFieldExchangeToken,
  FIELD_ACCESS_COOKIE,
  FIELD_SESSION_TTL_MS,
  type FieldTokenExchangeResult,
} from "@/lib/auth/verifyRole";

// A real technician follows a QR/text link a handful of times per visit.
// This caps brute-forcing the short grant id, not normal field use.
const SHORT_GRANT_LIMIT = { windowMs: 60_000, max: 30, keyPrefix: "field-short-grant" };

function setNoCredentialHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function setFieldSessionCookie(response: NextResponse, result: FieldTokenExchangeResult): void {
  if (!result.ok) return;
  response.cookies.set(FIELD_ACCESS_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(FIELD_SESSION_TTL_MS / 1000),
    expires: new Date(result.expiresAt),
  });
}

// GET /f/[grant] — the short, printable/scannable alias for a field-qr grant.
// Resolves the opaque id to the real signed token (stored server-side by
// POST /api/jobs/[jobId]/field-qr), consumes it exactly like the legacy
// /api/field/exchange?grant= path did, and redirects to a bare "/field" —
// no businessId/jobId query params, since the crew's client picks those up
// from the now-set field-session cookie via GET /api/field/session.
export async function GET(request: NextRequest, { params }: { params: Promise<{ grant: string }> }) {
  const limited = checkRateLimit(request, SHORT_GRANT_LIMIT);
  if (limited) return setNoCredentialHeaders(limited);

  const { grant: shortGrantId } = await params;
  const deniedUrl = new URL("/field", request.url);
  deniedUrl.searchParams.set("access", "denied");

  const db = getAdminFirestore();
  if (!db) {
    return setNoCredentialHeaders(NextResponse.redirect(deniedUrl, 303));
  }

  const ref = db.collection("fieldAccessGrants").doc(shortGrantId);
  const snap = await ref.get();
  // Delete on lookup regardless of outcome — this alias is meant for exactly
  // one resolution; the underlying signed token has its own independent
  // one-use enforcement (fieldAccessGrantUses), so this is belt-and-suspenders,
  // not the actual security boundary.
  if (snap.exists) await ref.delete().catch(() => {});

  const stored = snap.data() as { token?: string; expiresAt?: number } | undefined;
  if (!snap.exists || !stored?.token || (stored.expiresAt ?? 0) <= Date.now()) {
    return setNoCredentialHeaders(NextResponse.redirect(deniedUrl, 303));
  }

  const result = await consumeFieldExchangeToken(stored.token, request);
  const response = NextResponse.redirect(result.ok ? new URL("/field", request.url) : deniedUrl, 303);
  if (result.ok) {
    setFieldSessionCookie(response, result);
  } else {
    response.cookies.delete(FIELD_ACCESS_COOKIE);
  }
  return setNoCredentialHeaders(response);
}
