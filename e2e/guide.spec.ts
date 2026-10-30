// The quick guide (owner, 2026-10-30): one short page per role in the client's branding, an "Ask a question" form that
// files a Question with the Luxor team, and a Foreman page a field-only login can actually open.
import { test, expect, settle, shot, expectHealthy } from "./fixtures";

test("owner opens their own page, switches roles, and can ask a question", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/guide");
  await expect(page.getByRole("heading", { name: "E2E Roofing Co" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Owner" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("See the business at a glance, and get paid")).toBeVisible();
  await settle(page);
  await expectHealthy(page);
  await shot(page, "guide-owner");

  await page.getByRole("tab", { name: "Office staff" }).click();
  await expect(page.getByText("Confirm + email crew", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Foreman" }).click();
  await expect(page.getByText("Hold to talk, or tap to start")).toBeVisible();
  await shot(page, "guide-foreman");

  await page.getByRole("button", { name: "Ask a question" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Your question")).toBeVisible();
  // Questions carry no category picker — they are filed as "Question".
  await expect(dialog.locator("select")).toHaveCount(0);
  await shot(page, "guide-ask");
});

test("a field-only login lands on the Foreman page and is not bounced to Field", async ({ as }) => {
  const page = await as("fieldCrew");
  await page.goto("/company/guide");
  await expect(page.getByRole("tab", { name: "Foreman" })).toHaveAttribute("aria-selected", "true");
  await settle(page, 1500);
  await expect(page).toHaveURL(/\/company\/guide/);
  await expect(page.getByText("Talk, don't type")).toBeVisible();
  await expectHealthy(page);
  await shot(page, "guide-fieldcrew");
});
