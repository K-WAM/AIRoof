// Keep analytics route names bounded. Never send IDs, invitation tokens, or URL query strings.
const industries = new Set([
  "roofing", "hvac", "landscaping", "cleaning", "dental", "care-homes",
  "property-management", "general-contractors", "electricians",
  "appliance-repair", "childcare", "daycares", "junk-removal", "pet-care",
]);

const companyPages = new Set([
  "agent", "appointments", "billing", "calendar", "calls", "customers",
  "dashboard", "field", "guide", "jobs", "leads", "library", "pipeline",
  "settings", "team", "upgrade",
]);

const adminPages = new Set(["businesses", "invoices", "usage"]);
const hubPages = new Set(["demo", "guide", "onboarding"]);

export function trackedPage(pathname: string): string | null {
  const [first, second] = pathname.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  if (!first) return "/";
  if (first === "try" && second && industries.has(second)) return `/try/${second}`;
  if (first === "login" && !second) return "/login";
  if (first === "field") return "/field";
  if (first === "company" && second && companyPages.has(second)) return `/company/${second}`;
  if (first === "admin" && second && adminPages.has(second)) return `/admin/${second}`;
  if (first === "hub" && second && hubPages.has(second)) return `/hub/${second}`;
  return null;
}
