import { test, expect, settle, shot } from "./fixtures";

test("payroll dates and example", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/payroll");
  await settle(page);
  await page.getByLabel("From").fill("2000-01-03");
  await page.getByLabel("To", { exact: true }).fill("2000-01-09");
  await expect(page.getByLabel("Period")).toHaveValue("custom");
  await expect(page.getByText("No punches in this period.")).toBeVisible();
  await page.getByRole("button", { name: "Show an example week" }).click();
  await expect(page.getByText("Sample data", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Jordan Example" }).click();
  await expect(page.getByRole("heading", { name: /Monday 2000-01-03/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sunday 2000-01-09/ })).toBeVisible();
  await expect(page.getByText("Regular 40.0 h", { exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "rd-money-payroll");
});

for (const role of ["owner", "staff", "fieldCrew"] as const) {
  test(`${role} can open feedback`, async ({ as }, testInfo) => {
    const page = await as(role);
    await page.goto(role === "fieldCrew" ? "/company/field" : "/company/dashboard");
    await settle(page);
    if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click();
    const feedback = page.getByRole("button", { name: "Send feedback" }).filter({ visible: true });
    await feedback.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

test("preview feedback and desktop brand", async ({ as }, testInfo) => {
  const page = await as("superadmin");
  await page.goto("/company/dashboard?preview=e2e-roofpros");
  await settle(page);
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Send feedback" }).filter({ visible: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("two-company header at 1440", async ({ as }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const page = await as("proOwner");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/company/finances");
  await settle(page);
  await shot(page, "rd-money-1440");
});
