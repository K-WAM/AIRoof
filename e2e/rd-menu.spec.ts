import { mkdirSync } from "node:fs";
import { test, expect, expectHealthy, openJobPanel, openHelp, shot } from "./fixtures";

for (const account of ["proOwner", "fieldCrew", "dentalOwner"] as const) {
  test(`${account}: calmer menu preserves role and industry`, async ({ as }, info) => {
    const page = await as(account);
    await page.goto(account === "fieldCrew" ? "/company/field" : "/company/dashboard");
    await expect(page.locator(".company-shell")).toHaveAttribute("data-portal-family", /\S+/);
    if (info.project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.locator(".company-nav:visible a");
    const expected = account === "fieldCrew" ? ["Field", "Help"] : account === "dentalOwner"
      ? ["Dashboard", "Requests", "Calendar", "Patients", "Library", "Settings", "Help"]
      : ["Dashboard", "Requests", "Calendar", "Jobs", "Finances", "Customers", "Library", "Settings", "Help"];
    await expect(nav).toHaveText(expected);
    await expectHealthy(page);
    mkdirSync("docs/evidence/T-344", { recursive: true });
    await page.screenshot({ path: `docs/evidence/T-344/after-${account}-${info.project.name === "phone" ? 375 : 1280}.png` });
    await openHelp(page);
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Send feedback to Luxor" })).toBeVisible();
    await expect(page.locator("#company-mobile-nav")).toHaveCount(0);
  });
}

test("every old office URL remains reachable, with grouped switches", async ({ as }) => {
  test.setTimeout(240_000);
  const page = await as("proOwner");
  for (const [path, heading] of [
    ["dashboard", /Today.s Work/], ["pipeline", /^Requests$/], ["calls", /^Calls$/], ["calendar", /^Calendar$/],
    ["jobs", /^Jobs$/], ["field", /Field/], ["billing", /^Invoices$/], ["finances", /^Finances$/], ["payroll", /^Payroll$/],
    ["customers", /^Customers$/], ["library", /^Library$/], ["team", /^Team$/], ["settings", /^Settings$/], ["guide", /E2E Roof Pros/],
  ] as const) {
    await test.step(`/company/${path}`, async () => {
      const res = await page.goto(`/company/${path}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expect(page.getByText(/Failed to load this page|could not be loaded/i)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/company/${path}$`));
      if (["pipeline", "calls"].includes(path)) await expect(page.getByRole("navigation", { name: "Requests sections" }).getByRole("link")).toHaveText(["Requests", "Calls"]);
      if (["billing", "finances", "payroll"].includes(path)) await expect(page.getByRole("navigation", { name: "Money sections" }).getByRole("link")).toHaveText(["Invoices", "Finances", "Payroll"]);
      if (["settings", "team"].includes(path)) await expect(page.getByRole("navigation", { name: "Account sections" }).getByRole("link")).toHaveText(["Settings", "Team"]);
      if (path === "settings") await expect(page.getByRole("link", { name: "Manage team", exact: true })).toHaveCount(0);
      await expectHealthy(page);
    });
  }
  await page.goto("/company/pipeline?tab=leads");
  await page.getByRole("navigation", { name: "Requests sections" }).getByRole("link", { name: "Calls" }).click();
  await expect(page).toHaveURL(/company\/calls$/);
  await page.goBack(); await expect(page).toHaveURL(/pipeline\?tab=leads$/);
  await page.goto("/company/jobs");
  await page.getByRole("link", { name: "Open field screen", exact: true }).click();
  await expect(page).toHaveURL(/company\/field$/);
});

test("job groups retain every panel and old query link", async ({ as }) => {
  test.setTimeout(180_000);
  const page = await as("proOwner");
  for (const panel of ["timeline", "materials", "labor", "photos", "findings", "quote", "invoice", "report", "issues"]) {
    await page.goto(`/company/jobs/J-3163?tab=${panel}`);
    await expect(page.getByRole("heading", { name: /Sample South Homeowner|Lakeview County Schools/ }).first()).toBeVisible();
    const group = panel === "report" ? "report" : ["quote", "invoice"].includes(panel) ? "money" : "work";
    await expect(page.getByTestId(`job-group-${group}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tablist", { name: "Job groups" }).getByRole("tab")).toHaveText(["Work", "Money", "Report"]);
    if (panel !== "report") await expect(page.getByTestId(`job-tab-${panel === "issues" ? "findings" : panel}`)).toHaveAttribute("aria-selected", "true");
    await expectHealthy(page);
  }
  const groupBoxes = await page.getByRole("tablist", { name: "Job groups" }).getByRole("tab").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height }; }));
  expect(Math.max(...groupBoxes.map(b => b.top)) - Math.min(...groupBoxes.map(b => b.top))).toBeLessThan(1);
  expect(groupBoxes.every(b => b.height >= 44)).toBe(true);
  const fieldLink = await page.getByRole("link", { name: "Open field screen", exact: true }).boundingBox();
  expect(fieldLink && fieldLink.y + fieldLink.height <= groupBoxes[0].top).toBe(true);
  await openJobPanel(page, "materials"); await shot(page, "rd-job-work");
  await openJobPanel(page, "invoice"); await shot(page, "rd-job-money");
  await openJobPanel(page, "report"); await shot(page, "rd-job-report");
  await page.getByRole("link", { name: "Open field screen", exact: true }).click();
  await expect(page).toHaveURL(/company\/field\?jobId=J-3163$/);
});

test("staff and dental switches show only allowed parts", async ({ as }) => {
  const staff = await as("proOfficeAdmin");
  await staff.goto("/company/billing");
  await expect(staff.getByRole("navigation", { name: "Money sections" }).getByRole("link")).toHaveText(["Invoices"]);
  await staff.goto("/company/settings");
  await expect(staff.getByRole("navigation", { name: "Account sections" }).getByRole("link")).toHaveText(["Settings"]);
  await staff.goto("/company/team");
  await expect(staff.getByText("Only an admin can manage the team.", { exact: true })).toBeVisible();
  const dental = await as("dentalOwner");
  await dental.goto("/company/jobs"); await expect(dental).toHaveURL(/company\/dashboard$/);
  await dental.goto("/company/field"); await expect(dental).toHaveURL(/company\/dashboard$/);
});


test("Settings opens Team as its own section and returns", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/settings");
  const sections = page.getByRole("navigation", { name: "Account sections" });
  await expect(sections.getByRole("link")).toHaveText(["Settings", "Team"]);
  await expect(page.getByRole("link", { name: "Manage team", exact: true })).toHaveCount(0);
  await sections.getByRole("link", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await sections.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expectHealthy(page);
});
