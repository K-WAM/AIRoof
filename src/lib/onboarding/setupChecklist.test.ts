import { describe, expect, it } from "vitest";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { setupChecklist, type SetupChecklistInput } from "./setupChecklist";

const roofing = getVerticalTemplate("roofing");
const dental = getVerticalTemplate("dental");
const modulesFor = (disabled: readonly string[]) => ({ isEnabled: (m: string) => !disabled.includes(m) });
const allOn = modulesFor([]);

const empty: SetupChecklistInput = { phoneConfigured: false, prices: 0, resources: 0, hasLogo: false, teamMembers: 1, calls: 0, phoneNumber: "+15550400" };
const complete: SetupChecklistInput = { phoneConfigured: true, businessHours: "Mon-Fri 8-5", prices: 3, resources: 1, hasLogo: true, teamMembers: 2, calls: 1, phoneNumber: "+15550400" };

describe("setupChecklist", () => {
  it("lists the items in setup order", () => {
    expect(setupChecklist(empty, allOn, roofing.vocab).map((item) => item.id)).toEqual(["phone", "hours", "prices", "resource", "team", "logo", "testCall"]);
  });

  it("marks nothing done for a brand-new tenant", () => {
    expect(setupChecklist(empty, allOn, roofing.vocab).filter((item) => item.done)).toEqual([]);
  });

  it("marks everything done once every input is satisfied", () => {
    expect(setupChecklist(complete, allOn, roofing.vocab).every((item) => item.done)).toBe(true);
  });

  it.each([
    ["prices", { prices: 1 }],
    ["resource", { resources: 1 }],
    ["logo", { hasLogo: true }],
    ["team", { teamMembers: 2 }],
    ["testCall", { calls: 1 }],
    ["phone", { phoneConfigured: true }],
    ["hours", { businessHours: "Mon-Fri 8-5" }],
  ] as const)("flips only %s when its input is met", (id, patch) => {
    const done = setupChecklist({ ...empty, ...patch }, allOn, roofing.vocab).filter((item) => item.done).map((item) => item.id);
    expect(done).toEqual([id]);
  });

  it("takes the owner to the line status while Luxor connects it", () => {
    const phone = setupChecklist(empty, allOn, roofing.vocab)[0];
    expect(phone).toMatchObject({ id: "phone", label: "Check your phone line", done: false, href: "/company/settings#phone", cta: "View line" });
  });

  it("links every other open item to the exact place that fixes it", () => {
    const byId = Object.fromEntries(setupChecklist(empty, allOn, roofing.vocab).map((item) => [item.id, item]));
    expect(byId.prices).toMatchObject({ href: "/company/library?section=pricing", cta: "Add prices" });
    expect(byId.hours).toMatchObject({ href: "/company/settings#hours", cta: "Set hours" });
    expect(byId.resource).toMatchObject({ href: "/company/library?section=crews", cta: "Add crew" });
    expect(byId.logo).toMatchObject({ href: "/company/library?section=branding", cta: "Upload logo" });
    expect(byId.team).toMatchObject({ href: "/company/team", cta: "Invite someone" });
    expect(byId.testCall).toMatchObject({ href: "tel:+15550400", cta: "Call your line" });
  });

  it("has no test-call button when the line has no number yet", () => {
    const testCall = setupChecklist({ ...empty, phoneNumber: null }, allOn, roofing.vocab).find((item) => item.id === "testCall");
    expect(testCall?.href).toBeUndefined();
    expect(testCall?.cta).toBeUndefined();
  });

  it("skips prices for a vertical without the pricing module", () => {
    expect(setupChecklist(empty, modulesFor(["pricing"]), roofing.vocab).map((item) => item.id)).not.toContain("prices");
  });

  it("uses the vertical's own resource noun (dental)", () => {
    const items = setupChecklist(empty, modulesFor(dental.disabledModules), dental.vocab);
    const resource = items.find((item) => item.id === "resource");
    const noun = dental.vocab.resourceNoun.toLowerCase();
    expect(resource).toMatchObject({ label: `Add your first ${noun}`, cta: `Add ${noun}` });
    expect(noun).not.toBe("crew");
    expect(items.some((item) => item.id === "prices")).toBe(!dental.disabledModules.includes("pricing"));
  });
});
