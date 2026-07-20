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
  const defaultExport: { headers: () => Promise<HeaderRule[]> } = cfg.default || cfg;
  const rules = await defaultExport.headers();
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

  it("includes Content-Security-Policy-Report-Only with frame-ancestors 'self'", async () => {
    const allHeaders = await getAllHeaders();
    const csp = allHeaders.find((h) => h.key === "Content-Security-Policy-Report-Only");
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("frame-ancestors 'self'");
  });

  it("uses Report-Only mode, not enforce mode for CSP", async () => {
    const allHeaders = await getAllHeaders();
    const enforce = allHeaders.find((h) => h.key === "Content-Security-Policy");
    expect(enforce).toBeUndefined();
  });
});
