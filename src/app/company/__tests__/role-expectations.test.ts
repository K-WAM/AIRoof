// Fast unit check of the who-sees-what truth table (e2e/roles/expectations.ts) against the nav model and the landing
// rule. The expectations are the owner's rules; this file never derives them from the product.
import { describe, expect, it } from "vitest";
import { visibleNavLinks } from "../navModel";
import { defaultLandingPath } from "@/lib/team/landing";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import type { CompanyModule } from "@/hooks/useBusinessModules";
import type { TeamRole, TradeTitle } from "@/types/team";
import { ACCOUNTS, TENANTS } from "../../../../scripts/e2e/config.cjs";
import { ROLE_EXPECTATIONS } from "../../../../e2e/roles/expectations";

interface AccountShape {
  role?: TeamRole;
  trade?: TradeTitle;
}
interface TenantShape {
  id: string;
  industry: string;
}

const accounts = ACCOUNTS as unknown as Record<string, AccountShape>;
const tenants = TENANTS as unknown as Record<string, TenantShape>;

const EXPECTATION_KEYS = Object.keys(ROLE_EXPECTATIONS);
// The Hub is not the company shell: its nav is checked by the browser run, not here.
const COMPANY_KEYS = EXPECTATION_KEYS.filter((key) => key !== "superadmin");

/**
 * The module list the app actually runs with for this industry: the template's disabled modules, plus Billing turned
 * off with Jobs (see src/app/api/company/bootstrap/route.ts disabledModulesFor; every seeded tenant has all products).
 */
function disabledModulesFor(industry: string): CompanyModule[] {
  const disabled = new Set<CompanyModule>(getVerticalTemplate(industry).disabledModules as CompanyModule[]);
  if (disabled.has("jobs")) disabled.add("billing");
  return [...disabled];
}

describe("role expectations: coverage", () => {
  it("has one entry per seeded account", () => {
    expect(EXPECTATION_KEYS.sort()).toEqual(Object.keys(accounts).sort());
  });

  it("names a tenant that exists, and 3-6 API probes per role", () => {
    for (const key of EXPECTATION_KEYS) {
      const expectation = ROLE_EXPECTATIONS[key];
      expect(tenants[expectation.tenant], `${key}: unknown TENANTS key ${expectation.tenant}`).toBeDefined();
      expect(expectation.apiProbes.length, `${key}: probe count`).toBeGreaterThanOrEqual(3);
      expect(expectation.apiProbes.length, `${key}: probe count`).toBeLessThanOrEqual(6);
      for (const probe of expectation.apiProbes) {
        expect(probe.path, `${key}: probe path`).toMatch(/^\/api\//);
        // GET routes take the tenant as a query param; the team PATCH reads it from the body.
        expect(
          probe.path.includes("businessId=") || typeof probe.body?.businessId === "string",
          `${key}: probe must name its tenant`,
        ).toBe(true);
      }
    }
  });
});

describe("role expectations: nav and landing match the truth table", () => {
  it.each(COMPANY_KEYS)("%s: nav shows and hides the right labels", (key) => {
    const expectation = ROLE_EXPECTATIONS[key];
    const account = accounts[key];
    const disabled = disabledModulesFor(tenants[expectation.tenant].industry);
    const labels = visibleNavLinks({
      role: account.role,
      superadmin: false,
      isEnabled: (module) => !disabled.includes(module),
    }).map((link) => link.label);

    expect(labels).toEqual(expect.arrayContaining(expectation.navMustShow));
    for (const label of expectation.navMustNotShow) {
      expect(labels, `${key} must not see ${label}`).not.toContain(label);
    }
  });

  it.each(COMPANY_KEYS)("%s: sign-in lands where the truth table says", (key) => {
    const expectation = ROLE_EXPECTATIONS[key];
    const account = accounts[key];
    const disabled = disabledModulesFor(tenants[expectation.tenant].industry);
    expect(defaultLandingPath({ role: account.role, trade: account.trade }, disabled)).toBe(expectation.landing);
  });
});
