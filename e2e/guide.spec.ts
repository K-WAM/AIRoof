// The quick guide (owner, 2026-10-30): one short page per role in the client's branding, an "Ask a question" form that
// files a Question with the Luxor team, and a Foreman page a field-only login can actually open.
import { test, expect, settle, shot, expectHealthy } from "./fixtures";

test("owner opens their own page, switches roles, and can ask a question", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/guide");
  await expect(page.getByRole("heading", { name: "E2E Roofing Co" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Owner" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("See the business at a glance, and get paid")).toBeVisible();
  const guidebook = page.getByRole("link", { name: "Printable guidebook (PDF-ready)" });
  await expect(guidebook).toHaveAttribute("href", "/guides/user-guidebook.html");
  expect((await page.request.get("/guides/user-guidebook.html")).status()).toBe(200);
  await page.getByText("Can I answer calls myself?", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Quick answers" })).toContainText("The AI never takes a call you answered.");
  expect(await (await page.request.get("/guides/user-guidebook.html")).text()).toContain("Ask Luxor to set it up. The AI never takes a call you answered.");
  await settle(page);
  await expectHealthy(page);
  await shot(page, "guide-owner");

  // The role manuals (2026-11-05): How to… cards and Your screens, built from the same list as that role's menu.
  await expect(page.getByRole("heading", { name: "How to…" })).toBeVisible();
  await expect(page.getByTestId("guide-screens").getByText("Team", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Office staff" }).click();
  await expect(page.getByText("Confirm + email crew", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("guide-screens").getByText("Team", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Supervisor" }).click();
  await expect(page.getByText("Keep every crew on track")).toBeVisible();
  await shot(page, "guide-supervisor");
  await page.getByRole("tab", { name: "View only" }).click();
  await expect(page.getByText("See everything, change nothing")).toBeVisible();
  await expect(page.getByTestId("guide-screens")).not.toContainText("Drag ");
  await shot(page, "guide-viewer");
  await page.getByRole("tab", { name: "Field crew" }).click();
  await expect(page.getByText("Hold to talk, or tap to start")).toBeVisible();
  await shot(page, "guide-foreman");

  await page.getByRole("button", { name: "Ask a question" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Your question")).toBeVisible();
  // Questions carry no category picker — they are filed as "Question".
  await expect(dialog.locator("select")).toHaveCount(0);
  await shot(page, "guide-ask");
});

test("a field-only login lands on the Field crew page, sees only the field guides, and is not bounced to Field", async ({ as }) => {
  const page = await as("fieldCrew");
  await page.goto("/company/guide");
  await expect(page.getByRole("tab", { name: "Field crew" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveText(["Inspector", "Field crew"]);
  await settle(page, 1500);
  await expect(page).toHaveURL(/\/company\/guide/);
  await expect(page.getByText("Talk, don't type")).toBeVisible();
  await expectHealthy(page);
  await shot(page, "guide-fieldcrew");
});
