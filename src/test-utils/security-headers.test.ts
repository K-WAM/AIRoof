import { describe, it, expect } from "vitest";

interface HeaderEntry {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

async function getAllHeaders(): Promise<HeaderEntry[]> {
  const cfg = await import("@/../next.config");
  const nextConfig = (cfg.default ?? cfg) as { headers?: () => Promise<HeaderRule[]> };
  if (!nextConfig.headers) throw new Error("next.config.ts must export a headers() function");
  const rules = await nextConfig.headers();
  return rules.flatMap((r) => r.headers);
}

describe("next.config.ts security headers", () => {
  it("includes Strict-Transport-Security header", async () => {
    const allHeaders = await getAllHeaders();
    const hsts = allHeaders.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain("max-age=31536000");
    expect(hsts!.value).toContain("includeSubDomains");
  });

  it("includes X-Content-Type-Options: nosniff", async () => {
    const allHeaders = await getAllHeaders();
    const xcto = allHeaders.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto).toBeDefined();
    expect(xcto!.value).toBe("nosniff");
  });

  it("includes X-Frame-Options: SAMEORIGIN", async () => {
    const allHeaders = await getAllHeaders();
    const xfo = allHeaders.find((h) => h.key === "X-Frame-Options");
    expect(xfo).toBeDefined();
    expect(xfo!.value).toBe("SAMEORIGIN");
  });

  it("includes Content-Security-Policy with frame-ancestors 'self'", async () => {
    const allHeaders = await getAllHeaders();
    const csp = allHeaders.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("frame-ancestors 'self'");
  });

  it("ships CSP in enforce mode, not Report-Only", async () => {
    const allHeaders = await getAllHeaders();
    const reportOnly = allHeaders.find((h) => h.key === "Content-Security-Policy-Report-Only");
    expect(reportOnly).toBeUndefined();
  });

  it("restricts font-src and style-src to same-origin (Inter is self-hosted via next/font)", async () => {
    const allHeaders = await getAllHeaders();
    const csp = allHeaders.find((h) => h.key === "Content-Security-Policy");
    expect(csp!.value).toContain("font-src 'self'");
    expect(csp!.value).not.toContain("fonts.googleapis.com");
    expect(csp!.value).not.toContain("fonts.gstatic.com");
  });

  // Regression test for a live incident: an enforced CSP with no connect-src
  // falls back to default-src 'self', which silently blocks every browser
  // fetch/XHR the Firebase client SDK makes (Auth's identitytoolkit/
  // securetoken calls, Firestore reads) — surfaced in prod as
  // "Firebase: Error (auth/network-request-failed)" on /login.
  it("allows the browser to reach Firebase Auth/Firestore (connect-src)", async () => {
    const allHeaders = await getAllHeaders();
    const csp = allHeaders.find((h) => h.key === "Content-Security-Policy");
    expect(csp!.value).toContain("connect-src");
    expect(csp!.value).toMatch(/connect-src[^;]*'self'/);
    expect(csp!.value).toMatch(/connect-src[^;]*googleapis\.com/);
  });
});
