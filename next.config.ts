import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Firebase Auth (identitytoolkit/securetoken), Firestore, and Installations
  // all live under *.googleapis.com — the client SDK calls these directly
  // from the browser. Without this, connect-src falls back to default-src
  // 'self' and every fetch/XHR to them is silently blocked (this was a live
  // incident: "Firebase: Error (auth/network-request-failed)" on /login).
  "connect-src 'self' https://*.googleapis.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // T-055: Demo Studio, the onboarding wizard, and Playbooks moved from
  // /admin/* to their own /hub/* route group. Old deep links (bookmarks,
  // this file's own history) must redirect, never 404 — temporary (307), not
  // permanent, since these are internal admin tool URLs, not public/SEO'd
  // pages, and the move could still be revisited.
  async redirects() {
    return [
      { source: "/admin/demo", destination: "/hub/demo", permanent: false },
      { source: "/admin/demo/:path*", destination: "/hub/demo/:path*", permanent: false },
      { source: "/admin/onboarding", destination: "/hub/onboarding", permanent: false },
      { source: "/admin/onboarding/:path*", destination: "/hub/onboarding/:path*", permanent: false },
      { source: "/admin/guide", destination: "/hub/guide", permanent: false },
      { source: "/admin/guide/:path*", destination: "/hub/guide/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
