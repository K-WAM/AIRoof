// T-144 (docs/NO-TRAINING-UX-PLAN.md §3.3–3.4): a brand-new account never lands on a blank screen. Every empty list,
// panel and tab says what goes there and offers ONE next step; that step lands on the right place; a viewer is never
// offered a button that would 403; and the Dashboard checklist counts up as the owner fixes things.
//
// Runs as owner@empty.e2e.test on the e2e-empty tenant ("Fresh Roofing Co": phone line configured, nothing else).
// The suite shares one database, so beforeAll wipes the tenant back to empty — the checklist test below loads prices.
import type { Page } from "@playwright/test";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { api, db, must, TENANTS } from "../scripts/e2e/lib.cjs";

test.describe.configure({ mode: "serial" });

const EMPTY = TENANTS.empty.id;
const LINE = TENANTS.empty.phone;

async function resetEmptyTenant() {
  const root = db().collection("businesses").doc(EMPTY);
  for (const sub of await root.listCollections()) await db().recursiveDelete(sub);
}

/** The EmptyState with this testId is visible, has this title, and (optionally) this one primary action. */
async function expectEmpty(page: Page, testId: string, title: RegExp, primary?: string | RegExp) {
  // Some screens render a phone copy and a desktop copy of the same state (one is hidden) — check the one on screen.
  const state = page.getByTestId(testId).filter({ visible: true }).first();
  await expect(state).toBeVisible();
  await expect(state.getByRole("heading", { name: title })).toBeVisible();
  if (primary) await expect(state.locator(".button.primary")).toHaveText(primary);
  return state;
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
  // An error page has no empty states, so without this every "no buttons in any empty state" check passes vacuously.
  await expect(page.getByText("Failed to load this page"), `${path} showed its load-error page`).toHaveCount(0);
}

async function check(page: Page, name: string) {
  await shot(page, `empty-${name}`);
  await expectHealthy(page);
}

test.beforeAll(resetEmptyTenant);

test("every empty screen says what goes there and offers one next step", async ({ as }) => {
  test.setTimeout(180_000);
  const page = await as("emptyOwner");

  await visit(page, "/company/dashboard");
  await expect(page.getByRole("heading", { name: /Get your business ready — \d of \d+ done/ })).toBeVisible(); // T-164
  await expect(page.getByTestId("setup-checklist").locator(".button.primary")).toHaveCount(1);
  await check(page, "dashboard");

  await visit(page, "/company/pipeline");
  const pipeline = await expectEmpty(page, "pipeline-empty", /New requests land here/, "Make a test call");
  await expect(pipeline.getByRole("link", { name: "Make a test call" })).toHaveAttribute("href", `tel:${LINE}`);
  await expect(page.getByRole("button", { name: /^Leads/ })).toHaveCount(0); // one panel, not two empty tabs
  await check(page, "pipeline");

  await visit(page, "/company/calls");
  await expect(page.getByRole("heading", { name: "No calls yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call your line" })).toHaveAttribute("href", `tel:${LINE}`);
  await check(page, "calls");

  await visit(page, "/company/calendar");
  const calendar = await expectEmpty(page, "calendar-no-resources", /Add your first crew/, "Add crew");
  await expect(calendar).toBeInViewport(); // not buried in a sideways-scrolling grid on a phone
  await check(page, "calendar");
  await calendar.getByRole("button", { name: "Add crew" }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); // the quick-add opens right here, no page hop
  await page.keyboard.press("Escape");

  await visit(page, "/company/jobs");
  const jobs = await expectEmpty(page, "jobs-empty", /No jobs yet/, "New Job");
  await expect(page.locator("main .button.primary")).toHaveCount(1); // the header's "New Job" steps down while the list is empty
  await check(page, "jobs");
  await jobs.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator('input[name="title"]')).toBeVisible();

  await visit(page, "/company/customers");
  const customers = await expectEmpty(page, "customers-empty", /No customers yet/, "Add customer");
  await expect(page.locator("main .button.primary")).toHaveCount(1);
  await check(page, "customers");
  await customers.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible(); // the new-customer form opened

  await visit(page, "/company/library?section=pricing");
  await expectEmpty(page, "library-pricing-empty", /Add your prices once/, "Load example prices");
  await expect(page.locator("main .button.primary")).toHaveCount(1); // the header's "Load starter kit" is hidden here
  await check(page, "library-pricing");

  await visit(page, "/company/library?section=crews");
  await expectEmpty(page, "library-crews-empty", /Add your first crew/);
  await check(page, "library-crews");

  await visit(page, "/company/library?section=documents");
  await expectEmpty(page, "library-documents-empty", /No documents yet/);
  await check(page, "library-documents");

  await visit(page, "/company/library?section=branding");
  const logos = await expectEmpty(page, "library-logos-empty", /Upload your logo/, "Upload logo");
  await check(page, "library-branding");
  const chooser = page.waitForEvent("filechooser");
  await logos.getByRole("button", { name: "Upload logo" }).click();
  await chooser; // the button opens the real file picker

  await visit(page, "/company/library?section=work-catalog");
  await expectEmpty(page, "library-work-catalog-empty", /Save your common fixes once/, "Load starter kit");
  await check(page, "library-work-catalog");

  await visit(page, "/company/team");
  await expectEmpty(page, "team-empty", /Just you so far/);
  await check(page, "team");

  await visit(page, "/company/field");
  const fieldTitle = page.getByTestId("field-empty").getByRole("heading", { name: "No job assigned to you today" }); // T-164 wording
  await expect(fieldTitle).toBeVisible();
  // The field screen is dark: "visible" is not enough, the title must actually be light enough to read.
  const titleColor = await fieldTitle.evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = titleColor.match(/\d+/g)!.map(Number);
  expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `field title color ${titleColor} is unreadable on the dark screen`).toBeGreaterThan(180);
  await check(page, "field");
});

test("a new job's tabs each explain themselves", async ({ as }) => {
  test.setTimeout(120_000);
  const owner = await api("emptyOwner");
  const { job } = must(await owner.post("/api/jobs", { businessId: EMPTY, title: "Empty tabs check" }), "create job");
  const page = await as("emptyOwner");
  await visit(page, `/company/jobs/${job.jobId}`);

  const tabs: Array<[string, string, RegExp]> = [
    ["timeline", "job-activity-empty", /No field notes yet/],
    ["photos", "job-photos-empty", /No photos yet/],
    ["materials", "job-materials-empty", /Filled in from field notes/],
    ["labor", "job-labor-empty", /Filled in from field notes/],
    ["findings", "job-findings-empty", /What did you find\?/],
    ["quote", "job-quote-empty", /No quote yet/],
    ["report", "job-report-empty", /No report yet/],
    ["invoice", "job-invoice-empty", /No invoice yet/],
  ];
  for (const [tab, testId, title] of tabs) {
    await page.getByTestId(`job-tab-${tab}`).click();
    await expectEmpty(page, testId, title);
    await check(page, `job-${tab}`);
  }

  // No dead end: the Invoice tab's blocked state leads straight to the step that unblocks it.
  await page.getByTestId("job-invoice-empty").getByRole("button", { name: "Add a finding" }).click();
  await expectEmpty(page, "job-findings-empty", /What did you find\?/, "＋ Add from Library");
});

test("the setup checklist counts up when the owner loads example prices", async ({ as }) => {
  const page = await as("emptyOwner");
  await visit(page, "/company/dashboard");
  // T-164: "Get your business ready — N of M done", showing only the next step until "Show all steps".
  const heading = page.getByRole("heading", { name: /Get your business ready — \d+ of \d+ done/ });
  const [, before, total] = (await heading.innerText()).match(/(\d+) of (\d+) done/)!.map(Number);

  // The checklist's own link lands on the exact place that fixes the item.
  const addPrices = page.getByTestId("setup-checklist").getByRole("link", { name: "Add prices" });
  if (!(await addPrices.isVisible())) await page.getByRole("button", { name: "Show all steps" }).click();
  await addPrices.click();
  await page.waitForURL(/\/company\/library\?section=pricing/);
  await settle(page);
  await page.getByTestId("library-pricing-empty").getByRole("button", { name: "Load example prices" }).click();
  await expect(page.getByRole("heading", { name: "Material prices" })).toBeVisible({ timeout: 15_000 });

  await visit(page, "/company/dashboard");
  await expect(page.getByRole("heading", { name: new RegExp(`Get your business ready — ${before + 1} of ${total} done`) })).toBeVisible();
  await shot(page, "empty-dashboard-after-prices");
});

test("a viewer is never offered a write action by an empty state", async ({ as }) => {
  // 18 screens; the live-polling ones never go network-idle, so each settle can take its full 15 s.
  test.setTimeout(300_000);
  // A fresh job guarantees every job-tab empty state is on screen for the viewer.
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: TENANTS.roofing.id, title: `Viewer empty check ${Date.now().toString(36)}` }), "create job");
  const page = await as("viewer");
  // Switching tabs ("Show all") is fine for a viewer; anything that creates, sends or calls is not.
  // Whole words: "Show callbacks" switches to another tab (read-only) and must not count as "call".
  const WRITE = /\b(add|new|create|invite|upload|load|send|call|generate|make|field qr)\b/i;
  const noButtonsInEmptyStates = async (where: string) => {
    const states = page.locator(".empty-state");
    for (let i = 0; i < await states.count(); i++) {
      const writes = states.nth(i).getByRole("button", { name: WRITE }).or(states.nth(i).getByRole("link", { name: WRITE }));
      await expect(writes, `${where}: empty state #${i + 1} offers the viewer a write action`).toHaveCount(0);
    }
  };

  await visit(page, `/company/jobs/${job.jobId}`);
  for (const tab of ["timeline", "photos", "materials", "labor", "findings", "quote", "report", "invoice"]) {
    await page.getByTestId(`job-tab-${tab}`).click();
    await expect(page.locator(".empty-state").first()).toBeVisible();
    await noButtonsInEmptyStates(`job tab ${tab}`);
  }
  for (const path of ["/company/dashboard", "/company/pipeline", "/company/calls", "/company/calendar", "/company/jobs", "/company/customers",
    "/company/library?section=pricing", "/company/library?section=crews", "/company/library?section=documents", "/company/library?section=branding"]) {
    await visit(page, path);
    await noButtonsInEmptyStates(path);
  }
});

test("dental reads in its own words", async ({ as }) => {
  const page = await as("dentalOwner");
  await visit(page, "/company/calendar");
  const empty = page.getByTestId("calendar-no-resources");
  if (await empty.count()) {
    await expect(empty).toContainText(/Add your first provider/i);
    await expect(empty).not.toContainText(/crew|job/i);
  } else {
    await expect(page.getByRole("link", { name: /Manage providers/i })).toBeVisible();
  }
  await expect(page.locator("main")).not.toContainText(/\bcrews?\b/i);
});
