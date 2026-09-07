import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

function request(path: string, opts?: { session?: string }): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: opts?.session ? { cookie: `__session=${opts.session}` } : undefined,
  });
}

// T-055: /hub joined /admin and /company as a protected prefix when Demo
// Studio/onboarding/Playbooks moved out of /admin into their own route group.
describe("middleware", () => {
  it("redirects an unauthenticated /hub/* request to /login", () => {
    const res = middleware(request("/hub/demo"));
    expect(res.headers.get("location")).toContain("/login");
  });

  it("preserves the original /hub path in the login redirect's next param", () => {
    const res = middleware(request("/hub/onboarding"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/hub/onboarding");
  });

  it("lets a session-cookie-bearing /hub/* request through", () => {
    const res = middleware(request("/hub/demo", { session: "signed-in" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still protects /admin/* and /company/* (unchanged behavior)", () => {
    expect(middleware(request("/admin/businesses")).headers.get("location")).toContain("/login");
    expect(middleware(request("/company/dashboard")).headers.get("location")).toContain("/login");
  });

  it("leaves an unprotected route like /login alone", () => {
    expect(middleware(request("/login")).headers.get("location")).toBeNull();
  });
});
