import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

interface Redirect {
  source: string;
  destination: string;
  permanent: boolean;
}

// T-055: Demo Studio, the onboarding wizard, and Playbooks moved from
// /admin/* to /hub/*. Every old deep link must redirect, never 404.
describe("next.config redirects (hub move)", () => {
  it("redirects every old /admin/{demo,onboarding,guide} path to its new /hub location", async () => {
    const redirects = (await nextConfig.redirects!()) as Redirect[];
    const bySource = Object.fromEntries(redirects.map((r) => [r.source, r]));

    expect(bySource["/admin/demo"]).toMatchObject({ destination: "/hub/demo", permanent: false });
    expect(bySource["/admin/onboarding"]).toMatchObject({ destination: "/hub/onboarding", permanent: false });
    expect(bySource["/admin/guide"]).toMatchObject({ destination: "/hub/guide", permanent: false });
  });

  it("also redirects nested sub-paths, not just the bare old route", async () => {
    const redirects = (await nextConfig.redirects!()) as Redirect[];
    const bySource = Object.fromEntries(redirects.map((r) => [r.source, r]));

    expect(bySource["/admin/demo/:path*"]).toMatchObject({ destination: "/hub/demo/:path*" });
    expect(bySource["/admin/onboarding/:path*"]).toMatchObject({ destination: "/hub/onboarding/:path*" });
    expect(bySource["/admin/guide/:path*"]).toMatchObject({ destination: "/hub/guide/:path*" });
  });

  it("uses a temporary redirect, not permanent — the move could still be revisited", async () => {
    const redirects = (await nextConfig.redirects!()) as Redirect[];
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
  });
});
