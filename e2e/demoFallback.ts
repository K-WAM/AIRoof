import { expect, type Page } from "@playwright/test";

/** The roofing sample app is offered on /demo once the day's live demos are used up — force that state. */
export async function openSampleFallback(page: Page) {
  await page.route("**/api/demo/roofing-trial", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 429, json: { error: "Today's demo limit has been reached." } }) : route.continue());
  await page.goto("/demo");
  await page.getByLabel("Your business name").fill("Sample Fallback Roofing");
  await page.getByRole("button", { name: "Start my demo" }).click();
  await expect(page.getByText("Today's live calls are all taken.", { exact: false })).toBeVisible();
}
