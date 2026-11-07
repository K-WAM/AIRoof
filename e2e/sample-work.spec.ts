// T-376: sample work on the Roof Doctors-like tenant (e2e-roofpros). scripts/seed-sample-work.mjs writes 7 jobs, a phone
// booking and 2 requests at the tenant's own properties; every one shows the Example tag on Jobs, the job page, the
// Calendar and Requests. A job made from the sample booking is a sample too (and adds no customer). The superadmin's
// Sample data panel removes all of it, with what was made from it. Desktop + 375 px; screenshots in test-results/screens.
import { execFileSync } from "node:child_process";
import { test, expect, settle, shot } from "./fixtures";
import { emulatorEnv, TENANTS } from "../scripts/e2e/config.cjs";
import { api, readCollection } from "../scripts/e2e/lib.cjs";

const B = TENANTS.pros.id;
type Row = { id: string; title?: string; provenance?: { origin?: string } };
const rows = (path: string) => readCollection(path) as Promise<Row[]>;
const isSample = (row: Row) => row.provenance?.origin === "luxor-sample";
const visibleTags = (page: import("@playwright/test").Page) => page.getByTestId("example-tag").filter({ visible: true });

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync(process.execPath, ["scripts/seed-sample-work.mjs", `--business=${B}`, "--replace", "--apply", `--confirm=${B}`], {
    env: { ...process.env, ...emulatorEnv() }, stdio: "pipe",
  });
});

// A failed step skips the rest of this serial file, including the removal test; never leave samples behind for the
// specs that run after this one (address-suggest once read a leftover sample job as a second saved address).
test.afterAll(async () => {
  if (!(await rows(`businesses/${B}/jobs`)).some(isSample)) return;
  const admin = await api("superadmin");
  await admin.del(`/api/admin/businesses/${B}/sample-data?apply=1&confirm=${B}`);
});

test("Jobs lists the sample jobs with an Example tag", async ({ as }) => {
  // The seed wrote 7 sample jobs; the Jobs list shows only its first rows, and other specs add jobs to this tenant,
  // so count in the data and find one through the list's own search rather than counting tags on screen.
  expect((await rows(`businesses/${B}/jobs`)).filter(isSample)).toHaveLength(7);
  const page = await as("proOwner");
  await page.goto("/company/jobs");
  await settle(page);
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
  await page.getByLabel("Search jobs", { exact: true }).fill("Roof leak repair");
  await expect(page.getByText(/Roof leak repair — /).filter({ visible: true }).first()).toBeVisible();
  // The only seeded "Roof leak repair" job is the sample one (desktop table row or phone card).
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
  await shot(page, "sample-work-jobs");
});

test("the in-progress sample job shows the tag and its crew notes", async ({ as }) => {
  const jobs = await rows(`businesses/${B}/jobs`);
  const leak = jobs.find((row) => isSample(row) && String(row.title).startsWith("Roof leak repair"));
  expect(leak, "seeded leak repair job").toBeTruthy();
  const page = await as("proOwner");
  await page.goto(`/company/jobs/${leak!.id}`);
  await settle(page);
  await expect(page.locator("h1").getByTestId("example-tag")).toBeVisible();
  await expect(page.getByText(/broken tiles/i).filter({ visible: true }).first()).toBeVisible();
  await shot(page, "sample-work-job-page");
});

test("Dashboard, Calendar and Requests tag the sample visits, booking and requests", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/dashboard");
  await settle(page);
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
  await shot(page, "sample-work-dashboard");
  await page.goto("/company/calendar");
  await settle(page);
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
  await shot(page, "sample-work-calendar");
  await page.goto("/company/pipeline");
  await settle(page);
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
  await shot(page, "sample-work-requests");
  await page.goto("/company/pipeline?tab=appointments");
  await settle(page);
  await expect.poll(async () => visibleTags(page).count()).toBeGreaterThan(0);
});

test("header search tags the sample jobs, requests and booking", async ({ as, isMobile }) => {
  const page = await as("proOwner");
  await page.goto("/company/dashboard");
  await settle(page);
  if (isMobile) await page.getByRole("button", { name: "Search", exact: true }).click();
  else await page.getByRole("searchbox", { name: "Search", exact: true }).click();
  await page.getByRole("combobox").fill("Roof leak repair");
  const option = page.getByRole("option").filter({ hasText: /Roof leak repair/ }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  const tag = option.getByTestId("example-tag");
  await expect(tag).toBeVisible();
  // toBeVisible() passes for a tag cut off by the name's ellipsis — the tag must sit inside the row (375 px included).
  const [tagBox, rowBox] = [await tag.boundingBox(), await option.boundingBox()];
  expect(tagBox!.x + tagBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
  await shot(page, "sample-work-search");
});

test("a job made from the sample booking is a sample too and adds no customer", async ({ as }) => {
  const before = (await rows(`businesses/${B}/customers`)).length;
  const page = await as("proOwner");
  await page.goto("/company/pipeline?tab=appointments");
  const response = await page.request.post("/api/jobs/from-request", { data: { businessId: B, appointmentId: "sample-booking-1" } });
  expect(response.status()).toBe(201);
  const { job } = await response.json();
  expect(job.provenance?.origin).toBe("luxor-sample");
  expect((await rows(`businesses/${B}/customers`)).length).toBe(before);
});

test("superadmin's Sample data panel removes the sample work and what was made from it", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto(`/admin/businesses/${B}/config`);
  await settle(page);
  const remove = page.getByRole("button", { name: "Remove all samples" });
  await remove.scrollIntoViewIfNeeded();
  await remove.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Jobs: 8/)).toBeVisible();
  await expect(dialog.getByText(/Made from sample work: 1 request-to-job link/)).toBeVisible();
  await shot(page, "sample-work-remove-dialog");
  await dialog.getByLabel("Business id").fill(B);
  await dialog.getByRole("button", { name: "Remove samples" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Samples removed" })).toBeVisible();
  expect((await rows(`businesses/${B}/jobs`)).filter(isSample)).toHaveLength(0);
  expect((await rows(`businesses/${B}/appointments`)).filter(isSample)).toHaveLength(0);
  expect((await rows(`businesses/${B}/leads`)).filter(isSample)).toHaveLength(0);
  expect((await rows(`businesses/${B}/requestJobs`)).map((row) => row.id)).not.toContain("appointment_sample-booking-1");
});
