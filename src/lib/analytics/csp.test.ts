import { afterEach, expect, it, vi } from "vitest";
import { buildCsp } from "@/lib/http/csp";
afterEach(() => vi.unstubAllEnvs());
it("allows only the regional ingest and asset hosts while retaining the nonce", () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test");
  const csp = buildCsp({ nonce: "test-nonce" });
  const script = csp.split(";").find((part) => part.trim().startsWith("script-src"))!;
  expect(script).toContain("'nonce-test-nonce'"); expect(script).not.toContain("unsafe-inline");
  expect(script).toContain("https://us-assets.i.posthog.com");
  expect(csp).toContain("https://us.i.posthog.com"); expect(csp).not.toContain("*.posthog.com");
});
it("adds no PostHog asset permission when analytics is unconfigured", () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", ""); expect(buildCsp()).not.toContain("posthog.com");
});
