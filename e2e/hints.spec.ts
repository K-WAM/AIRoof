import { test, expect, expectHealthy, shot } from "./fixtures";

test("context hints open by focus or tap and dismiss with Escape", async ({ as, isMobile }) => {
  const page = await as("owner");
  await page.goto("/company/calendar");
  const hint = page.getByRole("button", { name: "Calendar status help", exact: true });
  if (isMobile) await hint.tap(); else await hint.focus();
  await expect(page.getByRole("tooltip")).toContainText("Grey means the time is saved");
  await expect(page.getByRole("tooltip")).toBeInViewport();
  await shot(page, "calendar-status-hint");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(hint).toBeFocused();
  await hint.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("heading", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expectHealthy(page);
});
