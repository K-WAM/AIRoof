import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { buildCsp } from "./src/lib/http/csp";

// Resolve once at build/config load, never from the public status request.
function buildCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

// Static files and API JSON only. Every page gets the nonce policy from src/middleware.ts (same builder).
const csp = buildCsp();

const nextConfig: NextConfig = {
  env: {
    APP_STATUS_BUILD_COMMIT: buildCommit(),
    APP_STATUS_DEPLOY_ENV: process.env.VERCEL_ENV === "production" ? "production" : "preview",
  },
  // The smoke harness's `--prod` mode builds into its own folder so it never fights a running `next dev` over `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // `next dev` only (no effect on a production build): keep compiled pages/routes warm. The defaults (60 s, 5 pages)
  // made the local smoke harness recompile routes all through a long Playwright run, stalling requests 5–15 s and
  // failing specs at random (2026-10-04).
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 200 },
  // lucide-react is imported (icon-by-icon, which is already tree-shakeable)
  // in 30+ files; this lets Next's compiler rewrite those into per-icon
  // module paths at build time so bundling/minification has less to do per
  // route, rather than relying on tree-shaking alone.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
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
          // The field screens record voice notes and take photos; nothing needs location, payment or USB.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
