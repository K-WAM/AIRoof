import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  consumeFieldExchangeToken,
  exchangeLegacyFieldKey,
  FIELD_ACCESS_COOKIE,
  FIELD_SESSION_TTL_MS,
  type FieldTokenExchangeResult,
} from "@/lib/auth/verifyRole";

// A real technician exchanges a grant/key at most a handful of times per
// visit (a mis-scan, a stale link). This caps brute-forcing the grant/key
// param, not normal field use.
const FIELD_EXCHANGE_LIMIT = { windowMs: 60_000, max: 30, keyPrefix: "field-exchange" };

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

function cleanFieldUrl(request: NextRequest, result?: FieldTokenExchangeResult): URL {
  const url = new URL("/field", request.url);
  if (result?.ok) {
    url.searchParams.set("businessId", result.businessId);
    if (result.jobId) url.searchParams.set("jobId", result.jobId);
  } else {
    url.searchParams.set("access", "denied");
  }
  return url;
}

// New printed/mobile QR flow. The grant is short-lived and one-use; the redirect
// lands on a clean URL after setting an HttpOnly field session.
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, FIELD_EXCHANGE_LIMIT);
  if (limited) return setNoCredentialHeaders(limited);

  const grant = request.nextUrl.searchParams.get("grant");
  const result = grant
    ? await consumeFieldExchangeToken(grant, request)
    : ({ ok: false, status: 401, error: "Field exchange grant required" } as const);

  const response = NextResponse.redirect(cleanFieldUrl(request, result), 303);
  if (result.ok) {
    setFieldSessionCookie(response, result);
  } else {
    response.cookies.delete(FIELD_ACCESS_COOKIE);
  }
  return setNoCredentialHeaders(response);
}

// One-deploy compatibility bootstrap for an old ?key= QR or localStorage entry.
// The browser POSTs the key in the body only after removing it from its URL.
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, FIELD_EXCHANGE_LIMIT);
  if (limited) return setNoCredentialHeaders(limited);

  let body: { businessId?: unknown; key?: unknown; jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return setNoCredentialHeaders(
      NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  const key = typeof body.key === "string" ? body.key : "";
  const jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : undefined;
  if (!businessId || !key || businessId.length > 200 || key.length > 512 || (jobId?.length ?? 0) > 200) {
    return setNoCredentialHeaders(
      NextResponse.json({ error: "businessId and key required" }, { status: 400 }),
    );
  }

  const result = await exchangeLegacyFieldKey(businessId, key, jobId, request);
  if (!result.ok) {
    const response = NextResponse.json({ error: result.error }, { status: result.status });
    response.cookies.delete(FIELD_ACCESS_COOKIE);
    return setNoCredentialHeaders(response);
  }

  const response = NextResponse.json({
    ok: true,
    businessId: result.businessId,
    jobId: result.jobId,
    expiresAt: result.expiresAt,
  });
  setFieldSessionCookie(response, result);
  return setNoCredentialHeaders(response);
}
