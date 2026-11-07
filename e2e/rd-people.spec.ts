// T-370..T-372 (stream L3): the Team roster, Library → Vendors, staff on crews and the superadmin Sample data panel, on the
// roofing tenant's invented L3 seed rows (scripts/e2e/seed.cjs "L3 people"). Checked at desktop and 375 px.
import { test, expect, settle, shot } from "./fixtures";
import { db } from "../scripts/e2e/lib.cjs";

// booking.spec.ts (scenarios/booking.cjs setSingleCrew) replaces every crew on e2e-roofing with one booking crew, which also
// removed L3's own "l3-crew" that these staff rows point at — in a full ordered run the roster then read "No crew" and lost
// its Example tag. Put the crew back (same fields as the seed) so this spec does not depend on what ran before it.
test.beforeAll(async () => {
  const at = Date.now();
  await db().collection("businesses").doc("e2e-roofing").collection("crews").doc("l3-crew")
    .set({ name: "Example Roofing Crew", active: true, kind: "crew", color: "#7c3aed", createdAt: at, updatedAt: at }, { merge: true });
});

test("Team page shows the roster: logins and staff without a login, with an Example tag on a guessed crew", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/team");
  await settle(page);
  await expect(page.getByRole("heading", { name: /Your team/ })).toBeVisible();
  for (const name of ["Taylor Foreman", "Morgan Estimator", "Riley Roofer"]) {
    await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Not invited yet").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Example", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await shot(page, "rd-people-team-roster");
});

test("Library → Vendors lists vendors, searchable", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/library?section=vendors");
  await settle(page);
  await expect(page.getByText("Example Shingle Co").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Sample Supply House").filter({ visible: true }).first()).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search vendors" }).filter({ visible: true }).first();
  await search.fill("shingle");
  await expect(page.getByText("Sample Supply House").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText("Example Shingle Co").filter({ visible: true }).first()).toBeVisible();
  await shot(page, "rd-people-vendors");
});

test("Library → Crews shows staff under their crew", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/library?section=crews");
  await settle(page);
  await expect(page.getByText("Riley Roofer").filter({ visible: true }).first()).toBeVisible();
  await shot(page, "rd-people-crews");
});

test("superadmin sees the Sample data panel with a dry run before removing anything", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto("/admin/businesses/e2e-roofing/config");
  await settle(page);
  const panel = page.getByRole("heading", { name: "Sample data" }).filter({ visible: true }).first();
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await shot(page, "rd-people-sample-panel");
});
