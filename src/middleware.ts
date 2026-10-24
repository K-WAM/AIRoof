import { NextRequest, NextResponse } from "next/server";
import { buildCsp } from "@/lib/http/csp";

// Protected route prefixes — require an active session cookie.
// The cookie is set by AuthContext after Firebase login; cleared on logout.
// Actual authorization (superadmin vs. company user) is enforced by:
//   1. Layout redirects (client-side, immediate)
//   2. Firestore security rules (server-side, authoritative)
// This middleware layer stops casual URL manipulation before React loads.
const PROTECTED_PREFIXES = ["/admin", "/company", "/hub"];
const LOGIN_URL = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected && !request.cookies.get("__session")?.value) {
    const loginUrl = new URL(LOGIN_URL, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Per-request CSP nonce (src/lib/http/csp.ts). Next reads the nonce from the request's CSP header and stamps it on
  // its own scripts; the response carries the same policy so the browser enforces it.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({ nonce, voiceDemo: pathname === "/demo" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every page. Not API routes (JSON, no scripts), Next's static chunks/images, or plain files in public/ (anything
  // with an extension) — those keep next.config.ts's static policy.
  matcher: ["/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
