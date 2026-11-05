import { test, expect, settle, shot } from "./fixtures";

test("feedback stays above the calendar", async ({ as }, testInfo) => {
  const page = await as("owner");
  await page.goto("/company/calendar");
  await settle(page);
  await expect(page.getByText("Casey Sample").filter({ visible: true }).first()).toBeVisible();
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Send feedback" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send feedback to Luxor" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);
  await shot(page, "roofdoctors-feedback-calendar");
});
