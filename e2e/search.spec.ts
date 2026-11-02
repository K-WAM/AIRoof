import { test, expect, expectHealthy, shot } from "./fixtures";
import { api, must } from "../scripts/e2e/lib.cjs";

test("header search stays visible and result columns never overlap", async ({ as, isMobile }) => {
  const owner = await api("owner");
  const title = `Search ${Date.now()} with a very long title to check narrow results`;
  must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title, clientName: "Search customer" }), "create search job");
  const page = await as("owner");
  await page.goto("/company/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Search", exact: true }).click();
  else {
    await expect(page.getByRole("searchbox", { name: "Search", exact: true })).toBeInViewport();
    await page.keyboard.press("/");
  }
  const input = page.getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill(title);
  await expect(page.getByRole("option")).toHaveCount(1);
  const row = page.getByRole("option");
  const type = await row.locator(".cmd-type").boundingBox();
  const body = await row.locator(".cmd-result-body").boundingBox();
  expect(type && body && type.x + type.width <= body.x - 8).toBe(true);
  await shot(page, "search-header-results");
  await expectHealthy(page);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/company\/jobs\/J-/);
});
