import { test, expect, settle, shot, expectHealthy } from "./fixtures";

test("a new owner sees a useful next step on empty workflow screens", async ({ as }) => {
  const page = await as("emptyOwner");
  const checks: Array<[string, RegExp]> = [
    ["/company/dashboard", /Get your business ready/i],
    ["/company/pipeline", /New requests land here/i],
    ["/company/calls", /No calls yet/i],
    ["/company/calendar", /Add your first/i],
    ["/company/jobs", /No jobs yet/i],
    ["/company/customers", /No customers yet/i],
    ["/company/library?section=crews", /Add your first/i],
    ["/company/library?section=documents", /No documents yet/i],
    ["/company/library?section=branding", /Upload your logo/i],
    ["/company/team", /Just you so far/i],
    ["/company/field", /No jobs for you today/i],
  ];
  for (const [path, title] of checks) {
    await page.goto(path);
    await settle(page);
    await expect(page.getByText(title).first()).toBeVisible();
    await shot(page, `empty-${path.replace(/[^a-z0-9]+/gi, "-")}`);
    await expectHealthy(page, { allowOverflow: path.includes("field") });
  }
});

test("a viewer is not offered a write action by an empty state", async ({ as }) => {
  const page = await as("viewer");
  await page.goto("/company/pipeline");
  await settle(page);
  await expect(page.getByRole("button", { name: /make a test call|add customer|new job/i })).toHaveCount(0);
});

test("dental vocabulary stays industry-aware", async ({ as }) => {
  const page = await as("dentalOwner");
  await page.goto("/company/calendar");
  await settle(page);
  await expect(page.getByText(/provider/i).first()).toBeVisible();
});
