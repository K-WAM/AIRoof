import { test, expect, settle, shot } from "./fixtures";

test("feedback and Help are usable", async ({ as, isMobile }) => {
  const page = await as("owner");
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/company/guide");
  await settle(page);
  const selected = page.getByRole("tab", { selected: true });
  await expect(selected).toBeVisible();
  await shot(page, "l2-guide");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Send feedback" }).filter({ visible: true }).click();
  await expect(page.getByText(/^From:/)).toBeVisible();
  await expect(page.getByLabel("Message")).toBeFocused();
  await shot(page, "l2-feedback");
});
