import { describe, expect, it } from "vitest";
import { visibleNavLinks } from "./navModel";

const roof = (module: string) => module !== "unused";
const dental = (module: string) => module !== "jobs" && module !== "pricing";
const paths = (context: Parameters<typeof visibleNavLinks>[0]) => visibleNavLinks(context).map((link) => link.path);
const common = ["/company/dashboard", "/company/calls", "/company/pipeline", "/company/calendar"];
const jobs = ["/company/jobs", "/company/field"];
const manage = ["/company/customers", "/company/library"];
const end = ["/company/settings", "/company/guide", "feedback"];

describe("visibleNavLinks", () => {
  it.each(["owner", "staff", "viewer"])("keeps every roofing %s route", (role) => {
    expect(paths({ role, isEnabled: roof })).toEqual([
      ...common, ...jobs, ...manage, ...(role === "owner" ? ["/company/team"] : []), ...end,
    ]);
  });
  it("keeps a crew on Field only", () => {
    expect(paths({ role: "crew", isEnabled: roof })).toEqual(["/company/field"]);
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
});
