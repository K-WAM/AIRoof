import { describe, expect, it } from "vitest";
import { visibleNavLinks } from "./navModel";

const roof = (module: string) => module !== "unused";
// The bootstrap turns Billing off with Jobs (invoices belong to jobs), so a dental office has neither.
const dental = (module: string) => module !== "jobs" && module !== "pricing" && module !== "billing";
const paths = (context: Parameters<typeof visibleNavLinks>[0]) => visibleNavLinks(context).map((link) => link.path);
const common = ["/company/dashboard", "/company/calls", "/company/pipeline", "/company/calendar"];
const jobs = ["/company/jobs", "/company/field", "/company/billing"];
const manage = ["/company/customers", "/company/library"];
const end = ["/company/settings", "/company/guide", "feedback"];

describe("visibleNavLinks", () => {
  it.each(["owner", "staff", "viewer"])("keeps every roofing %s route", (role) => {
    expect(paths({ role, isEnabled: roof })).toEqual([
      ...common, ...jobs, ...manage, ...(role === "owner" ? ["/company/team"] : []), ...end,
    ]);
  });
  it.each<[string, string[]]>([
    ["owner", ["/company/team"]],
    ["staff", []],
    ["viewer", []],
  ])("keeps exactly today's %s links when the business has no showcase flags", (role, team) => {
    const today = [...common, ...jobs, ...manage, ...team, ...end];
    expect(paths({ role, isEnabled: roof })).toEqual(today);
    expect(paths({ role, isEnabled: roof, showcase: {} })).toEqual(today);
    expect(paths({ role, isEnabled: roof, showcase: { finances: false, payroll: false } })).toEqual(today);
  });
  it("keeps exactly today's links for a superadmin preview with no showcase flags", () => {
    expect(paths({ role: "viewer", superadmin: true, preview: true, isEnabled: roof, showcase: {} })).toEqual([
      ...common, ...jobs, ...manage, "/company/team", ...end,
    ]);
  });
  it("puts enabled showcase pages right after Billing, for the owner only", () => {
    const showcase = { finances: true, payroll: true };
    expect(paths({ role: "owner", isEnabled: roof, showcase })).toEqual([
      ...common, ...jobs, "/company/finances", "/company/payroll", ...manage, "/company/team", ...end,
    ]);
    expect(paths({ role: "staff", isEnabled: roof, showcase })).toEqual([...common, ...jobs, ...manage, ...end]);
    expect(paths({ role: "viewer", isEnabled: roof, showcase })).toEqual([...common, ...jobs, ...manage, ...end]);
    expect(paths({ role: "viewer", superadmin: true, preview: true, isEnabled: roof, showcase })).toEqual([
      ...common, ...jobs, "/company/finances", "/company/payroll", ...manage, "/company/team", ...end,
    ]);
    expect(paths({ role: "viewer", superadmin: true, isEnabled: roof, showcase })).toEqual([
      ...common, ...jobs, ...manage, "/company/team", ...end.filter((path) => path !== "feedback"),
    ]);
  });
  it("adds each showcase page only when its own flag is on", () => {
    expect(paths({ role: "owner", isEnabled: roof, showcase: { finances: true } })).toEqual([
      ...common, ...jobs, "/company/finances", ...manage, "/company/team", ...end,
    ]);
    expect(paths({ role: "owner", isEnabled: roof, showcase: { payroll: true } })).toEqual([
      ...common, ...jobs, "/company/payroll", ...manage, "/company/team", ...end,
    ]);
  });
  it("keeps a crew on Field (plus its Guide page) only", () => {
    expect(paths({ role: "crew", isEnabled: roof })).toEqual(["/company/field", "/company/guide", "feedback"]);
  });
  it("uses the dental modules and customer word", () => {
    const links = visibleNavLinks({ role: "owner", isEnabled: dental, vocab: { customerNounPlural: "Patients" } });
    expect(links.map((link) => link.path)).toEqual([...common, ...manage, "/company/team", ...end]);
    expect(links.find((link) => link.path === "/company/customers")?.label).toBe("Patients");
  });
  it("keeps every route including feedback in superadmin preview", () => {
    expect(paths({ role: "viewer", superadmin: true, preview: true, isEnabled: roof })).toEqual([
      ...common, ...jobs, ...manage, "/company/team", ...end,
    ]);
  });
  it("shows only what a client bought: field input + billing, no AI calls", () => {
    const fieldAndBilling = (module: string) => module !== "calls";
    expect(paths({ role: "owner", isEnabled: fieldAndBilling })).toEqual([
      "/company/dashboard", "/company/calendar", ...jobs, ...manage, "/company/team", ...end,
    ]);
  });
  it("shows a product the client could add as locked tabs in their usual place", () => {
    const links = visibleNavLinks({ role: "owner", isEnabled: (m) => m !== "calls", isLocked: (m) => m === "calls" });
    expect(links.filter((l) => l.locked).map((l) => l.path)).toEqual(["/company/calls", "/company/pipeline"]);
    expect(links.map((l) => l.path).slice(0, 3)).toEqual(["/company/dashboard", "/company/calls", "/company/pipeline"]);
  });
  it("never shows a module the industry doesn't use, even locked", () => {
    expect(visibleNavLinks({ role: "owner", isEnabled: dental, isLocked: () => false }).some((l) => l.path === "/company/jobs")).toBe(false);
  });
  it("a crew login never sees locked office tabs", () => {
    expect(paths({ role: "crew", isEnabled: (m) => m !== "calls", isLocked: (m) => m === "calls" })).toEqual(["/company/field", "/company/guide", "feedback"]);
  });
});
