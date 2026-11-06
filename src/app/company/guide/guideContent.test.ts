import { describe, expect, it } from "vitest";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import type { CompanyModule } from "@/hooks/useBusinessModules";
import { visibleNavLinks } from "../navModel";
import { GUIDE_ROLES, GUIDE_TEAM_ROLE, guideFor, screensFor } from "./guideContent";

const all = () => true;
const roofing = { isEnabled: all, vocab: VERTICAL_TEMPLATES.roofing.vocab, calendarMode: "jobs" as const, quotes: true };

describe("guideFor", () => {
  it("keeps every role to one short page", () => {
    for (const role of GUIDE_ROLES) {
      const guide = guideFor(role, roofing);
      expect(guide.steps.length).toBeGreaterThanOrEqual(4);
      expect(guide.steps.length).toBeLessThanOrEqual(5);
      expect(guide.tips.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives the foreman the voice-note flow in this industry's words", () => {
    const foreman = guideFor("foreman", roofing);
    expect(foreman.steps.map((step) => step.action)).toEqual(["Field", "Clock in", "Hold to talk, or tap to start", "+ Photo", "Clock out for the day"]);
    expect(foreman.steps[2].detail).toContain(VERTICAL_TEMPLATES.roofing.vocab.voiceExample);
  });

  it("never mentions jobs, crews or field notes to an industry without them", () => {
    const dental = { isEnabled: (m: CompanyModule) => m !== "jobs" && m !== "pricing", vocab: VERTICAL_TEMPLATES.dental.vocab, calendarMode: "appointments" as const, quotes: false };
    const staff = guideFor("staff", dental);
    expect(staff.title).toBe("Turn calls into confirmed bookings");
    expect(JSON.stringify(staff)).not.toMatch(/Create Job|Send to a worker|Findings/);
    expect(guideFor("admin", dental).steps.some((step) => step.path === "/company/library?section=crews")).toBe(false);
  });

  it("leaves Findings and Quote out for set-price work", () => {
    const petCare = { ...roofing, vocab: VERTICAL_TEMPLATES["pet-care"].vocab, quotes: false };
    const jobPage = guideFor("staff", petCare).steps.find((step) => step.path === "/company/jobs");
    expect(jobPage?.detail).toMatch(/^Report and Invoice/);
  });

  it("drops calls steps for a client without the phone product", () => {
    const owner = guideFor("owner", { ...roofing, isEnabled: (m: CompanyModule) => m !== "calls" });
    expect(owner.steps.map((step) => step.action)).not.toContain("Requests");
  });
});

// The role manuals (owner, 2026-11-05): short "How to…" cards and a "Your screens" reference per role.
describe("role manuals", () => {
  const twoCompanies = { ...roofing, showcase: { finances: true, payroll: true }, multiCompany: true };

  it("keeps How to short: at most two cards of at most four steps", () => {
    for (const role of GUIDE_ROLES) {
      const { howTo } = guideFor(role, twoCompanies);
      expect(howTo.length).toBeLessThanOrEqual(2);
      for (const task of howTo) expect(task.steps.length).toBeLessThanOrEqual(4);
    }
  });

  it("lists exactly the screens on that role's menu, each with two to four bullets", () => {
    for (const role of GUIDE_ROLES) {
      const menu = visibleNavLinks({ role: GUIDE_TEAM_ROLE[role], isEnabled: all, vocab: roofing.vocab, showcase: twoCompanies.showcase })
        .map((link) => link.path).filter((path) => path !== "/company/guide" && path !== "feedback");
      const screens = screensFor(role, twoCompanies);
      expect(screens.map((screen) => screen.path)).toEqual(menu);
      for (const screen of screens) {
        expect(screen.bullets.length, `${role} ${screen.path}`).toBeGreaterThanOrEqual(role === "viewer" || GUIDE_TEAM_ROLE[role] === "crew" ? 1 : 2);
        expect(screen.bullets.length, `${role} ${screen.path}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("gives a field login only the Field screen, and only the owner Team, Finances and Payroll", () => {
    expect(screensFor("foreman", twoCompanies).map((screen) => screen.path)).toEqual(["/company/field"]);
    expect(screensFor("inspector", twoCompanies)[0].bullets).toContain("My schedule shows your visits for the day.");
    const owner = screensFor("owner", twoCompanies).map((screen) => screen.path);
    expect(owner).toEqual(expect.arrayContaining(["/company/settings", "/company/billing"]));
    expect(JSON.stringify(screensFor("owner", twoCompanies))).toContain("Team at the top");
    expect(JSON.stringify(screensFor("owner", twoCompanies))).toContain("Finances and Payroll");
    for (const role of ["staff", "supervisor", "viewer"] as const) {
      expect(screensFor(role, twoCompanies).map((screen) => screen.path)).not.toEqual(expect.arrayContaining(["/company/team"]));
      expect(screensFor(role, twoCompanies).some((screen) => screen.path === "/company/finances")).toBe(false);
    }
  });

  it("tells View only what each screen shows, never what to tap", () => {
    const text = JSON.stringify([guideFor("viewer", twoCompanies), screensFor("viewer", twoCompanies)]);
    expect(text).not.toMatch(/Drag |Record payment|Send invite|Save Changes|Confirm & email|Send to a worker/);
  });

  it("mentions the company switch only for a business with two companies", () => {
    expect(JSON.stringify(screensFor("owner", twoCompanies))).toContain("Sent as");
    expect(guideFor("owner", twoCompanies).howTo.map((task) => task.title)).toContain("Send an invoice from the right company");
    expect(JSON.stringify([guideFor("owner", roofing), screensFor("owner", roofing)])).not.toMatch(/Sent as|company filter/);
  });

  it("keeps a dental office's manual free of crews, jobs and field work", () => {
    const dental = { isEnabled: (m: CompanyModule) => m !== "jobs" && m !== "pricing", vocab: VERTICAL_TEMPLATES.dental.vocab, calendarMode: "appointments" as const, quotes: false };
    const text = JSON.stringify(screensFor("staff", dental));
    expect(text).not.toMatch(/Unscheduled|Send to a worker|Findings|time clock|Prices & rates/);
    expect(screensFor("staff", dental).map((screen) => screen.path)).not.toContain("/company/field");
  });
});
