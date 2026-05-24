import { NextRequest, NextResponse } from "next/server";

// Protected route prefixes — require an active session cookie.
// The cookie is set by AuthContext after Firebase login; cleared on logout.
// Actual authorization (superadmin vs. company user) is enforced by:
//   1. Layout redirects (client-side, immediate)
//   2. Firestore security rules (server-side, authoritative)
// This middleware layer stops casual URL manipulation before React loads.
const PROTECTED_PREFIXES = ["/admin", "/company"];
const LOGIN_URL = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get("__session");
  if (session?.value) return NextResponse.next();

  const loginUrl = new URL(LOGIN_URL, request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/company/:path*"],
};
