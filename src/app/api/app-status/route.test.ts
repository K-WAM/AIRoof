import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const raw = readFileSync(new URL("../../../../app-status.json", import.meta.url), "utf8");
const facts = JSON.parse(raw);
afterEach(() => vi.unstubAllEnvs());

describe("AIRoof public fact sheet", () => {
  it("parses the exact public schema, hub ID and boolean capability fields", () => {
    expect(facts.schema).toBe(1);
    expect(facts.id).toBe("airoof");
    expect(Object.keys(facts).sort()).toEqual(["alerts", "app", "id", "schema"]);
    expect(Object.keys(facts.app).sort()).toEqual([
      "name", "title", "descriptor", "purpose", "url", "liveUrl", "demoUrl", "stack", "hosting", "db", "auth", "email", "payments", "ai",
      "tiers", "backendConnected", "apiConnected", "hasDemoUrl", "stripeConnected", "realStripeConnected", "readiness",
    ].sort());
    for (const [key, value] of Object.entries(facts.app)) {
      if (["backendConnected", "apiConnected", "hasDemoUrl", "stripeConnected", "realStripeConnected"].includes(key)) expect(typeof value).toBe("boolean");
      else if (!["tiers", "readiness"].includes(key)) expect(typeof value).toBe("string");
    }
    for (const value of Object.values(facts.app.readiness)) expect(typeof value).toBe("boolean");
    for (const tier of facts.app.tiers) {
      expect(Object.keys(tier).sort()).toEqual(["id", "name", "price"]);
      for (const value of Object.values(tier)) expect(typeof value).toBe("string");
    }
    for (const alert of facts.alerts) {
      expect(["info", "warning", "critical"]).toContain(alert.level);
      expect(alert.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(alert.text.length).toBeLessThan(240);
    }
  });
  it("contains only HTTPS public URLs and no secret-looking strings or email addresses", () => {
    for (const key of ["url", "liveUrl", "demoUrl"]) expect(new URL(facts.app[key]).protocol).toBe("https:");
    for (const url of raw.match(/https?:[^"\s]+/g) || []) {
      expect(new URL(url).protocol).toBe("https:");
      expect(new URL(url).pathname).not.toMatch(/\/(?:admin|hub|company)(?:\/|$)/);
    }
    expect(raw).not.toMatch(/sk_|rk_|re_|AIza|-----BEGIN|password|token/i);
    expect(raw).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  });
  it("serves unauthenticated JSON with the build SHA, request timestamp and shared cache headers", async () => {
    vi.stubEnv("APP_STATUS_BUILD_COMMIT", "1234567890abcdef");
    vi.stubEnv("APP_STATUS_DEPLOY_ENV", "production");
    const before = Date.now(), response = GET(), body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=300");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(body).toMatchObject({ ...facts, deploy: { commit: "1234567", env: "production" } });
    expect(Date.parse(body.generatedAt)).toBeGreaterThanOrEqual(before);
  });
  it("uses preview for local/preview builds and leaves an unknown build SHA empty", async () => {
    vi.stubEnv("APP_STATUS_BUILD_COMMIT", ""); vi.stubEnv("APP_STATUS_DEPLOY_ENV", "preview");
    expect((await GET().json()).deploy).toEqual({ commit: "", env: "preview" });
  });
});
